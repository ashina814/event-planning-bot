import type Database from "better-sqlite3";
import type { Client } from "discord.js";
import { config } from "../../config.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { logAudit } from "../../lib/audit.js";
import { formatJstPlainDate, unixNow } from "../../lib/time.js";
import { buildLeadDashboardComponents } from "../../ui/buttons.js";
import {
  defaultBaseSalaryGrades,
  defaultEventRewardLabels,
  defaultRoleRewards,
  defaultScaleMultipliers
} from "./masterData.js";

export interface RoleRewardRecord {
  role_label: string;
  amount: number;
  enabled: number;
  updated_at: number;
}

export interface BaseSalaryGradeRecord {
  id: number;
  name: string;
  amount: number;
  monthly_cap: number | null;
  updated_at: number;
}

export interface UserGradeRecord {
  user_id: string;
  grade_id: number;
  updated_at: number;
}

export interface MiscContributionRecord {
  id: number;
  user_id: string;
  role_label: string;
  thread_id: string | null;
  month_key: string;
  note: string | null;
  created_by: string;
  created_at: number;
}

export interface RewardSettingsSummary {
  roleRewards: RoleRewardRecord[];
  grades: BaseSalaryGradeRecord[];
  scaleMultipliers: Record<string, number>;
}

export class RewardsService {
  constructor(
    private readonly db: Database.Database,
    private readonly settingsRepo: SettingsRepo,
    private readonly eventsRepo?: EventsRepo
  ) {
    this.ensureDefaults();
  }

  ensureDefaults(): void {
    const now = unixNow();
    const roleCount = this.db.prepare("SELECT COUNT(*) AS count FROM role_rewards").get() as { count: number };
    if (roleCount.count === 0) {
      const insert = this.db.prepare(
        "INSERT INTO role_rewards (role_label, amount, enabled, updated_at) VALUES (?, ?, 1, ?)"
      );
      defaultRoleRewards.forEach((reward) => insert.run(reward.roleLabel, reward.amount, now));
    }

    const gradeCount = this.db.prepare("SELECT COUNT(*) AS count FROM base_salary_grades").get() as { count: number };
    if (gradeCount.count === 0) {
      const insert = this.db.prepare(
        "INSERT INTO base_salary_grades (name, amount, monthly_cap, updated_at) VALUES (?, ?, ?, ?)"
      );
      defaultBaseSalaryGrades.forEach((grade) => insert.run(grade.name, grade.amount, grade.monthlyCap, now));
    }

    if (!this.getSettingOptional("scale_multipliers")) {
      this.setSetting("scale_multipliers", defaultScaleMultipliers, now);
    }

    if (config.leadOnlyChannel && !this.settingsRepo.getOptional("leadOnly")) {
      this.settingsRepo.set("leadOnly", config.leadOnlyChannel, now);
    }
  }

  summary(): RewardSettingsSummary {
    return {
      roleRewards: this.listRoleRewards(true),
      grades: this.listGrades(),
      scaleMultipliers: this.getScaleMultipliers()
    };
  }

  listRoleRewards(includeDisabled = false): RoleRewardRecord[] {
    const sql = includeDisabled
      ? "SELECT * FROM role_rewards ORDER BY enabled DESC, role_label ASC"
      : "SELECT * FROM role_rewards WHERE enabled = 1 ORDER BY role_label ASC";
    return this.db.prepare(sql).all() as RoleRewardRecord[];
  }

  listContributionRoleRewards(): RoleRewardRecord[] {
    const eventLabels = new Set<string>(defaultEventRewardLabels);
    return this.listRoleRewards(false).filter((reward) => !eventLabels.has(reward.role_label));
  }

  upsertRoleReward(actorId: string, roleLabel: string, amount: number, enabled = true): RoleRewardRecord {
    const label = roleLabel.trim().slice(0, 30);
    if (!label) {
      throw new Error("役割名を入力してください。");
    }
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error("単価は0以上の整数で入力してください。");
    }
    const before = this.findRoleReward(label);
    const now = unixNow();
    this.db
      .prepare(
        `INSERT INTO role_rewards (role_label, amount, enabled, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(role_label) DO UPDATE SET
           amount = excluded.amount,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`
      )
      .run(label, amount, enabled ? 1 : 0, now);
    const after = this.getRoleReward(label);
    logAudit({
      actorId,
      action: "reward.role_rate_update",
      targetType: "role_reward",
      targetId: label,
      before,
      after
    });
    return after;
  }

  listGrades(): BaseSalaryGradeRecord[] {
    return this.db
      .prepare("SELECT * FROM base_salary_grades ORDER BY id ASC")
      .all() as BaseSalaryGradeRecord[];
  }

  upsertGrade(actorId: string, name: string, amount: number, monthlyCap: number | null): BaseSalaryGradeRecord {
    const label = name.trim().slice(0, 30);
    if (!label) {
      throw new Error("グレード名を入力してください。");
    }
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error("基本給は0以上の整数で入力してください。");
    }
    if (monthlyCap !== null && (!Number.isInteger(monthlyCap) || monthlyCap < 0)) {
      throw new Error("上限は0以上の整数、または空欄で入力してください。");
    }
    const before = this.getGradeByName(label);
    const now = unixNow();
    this.db
      .prepare(
        `INSERT INTO base_salary_grades (name, amount, monthly_cap, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET
           amount = excluded.amount,
           monthly_cap = excluded.monthly_cap,
           updated_at = excluded.updated_at`
      )
      .run(label, amount, monthlyCap, now);
    const after = this.getGradeByName(label);
    logAudit({
      actorId,
      action: "reward.grade_update",
      targetType: "base_salary_grade",
      targetId: String(after.id),
      before,
      after
    });
    return after;
  }

  assignUserGrade(actorId: string, userId: string, gradeId: number): void {
    const grade = this.getGrade(gradeId);
    if (!grade) {
      throw new Error("グレードが見つかりませんでした。");
    }
    const before = this.db.prepare("SELECT * FROM user_grades WHERE user_id = ?").get(userId) as
      | UserGradeRecord
      | undefined;
    const now = unixNow();
    this.db
      .prepare(
        `INSERT INTO user_grades (user_id, grade_id, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           grade_id = excluded.grade_id,
           updated_at = excluded.updated_at`
      )
      .run(userId, gradeId, now);
    const after = this.db.prepare("SELECT * FROM user_grades WHERE user_id = ?").get(userId) as UserGradeRecord;
    logAudit({
      actorId,
      action: "reward.user_grade_update",
      targetType: "user_grade",
      targetId: userId,
      before: before ?? null,
      after
    });
  }

  getScaleMultipliers(): Record<string, number> {
    return this.getSetting("scale_multipliers", { ...defaultScaleMultipliers });
  }

  setScaleMultiplier(actorId: string, scale: string, multiplier: number): void {
    if (!Number.isFinite(multiplier) || multiplier < 0) {
      throw new Error("倍率は0以上の数値で入力してください。");
    }
    const before = this.getScaleMultipliers();
    const after = { ...before, [scale]: multiplier };
    this.setSetting("scale_multipliers", after, unixNow());
    logAudit({
      actorId,
      action: "reward.scale_multiplier_update",
      targetType: "reward_setting",
      targetId: "scale_multipliers",
      before,
      after
    });
  }

  createMiscContribution(input: {
    actorId: string;
    userId: string;
    roleLabel: string;
    threadId: string | null;
    note: string | null;
  }): MiscContributionRecord {
    const reward = this.getRoleReward(input.roleLabel);
    if (!reward || reward.enabled !== 1) {
      throw new Error("貢献種別が見つかりませんでした。");
    }
    const now = unixNow();
    const monthKey = formatJstPlainDate(now).slice(0, 7);
    const result = this.db
      .prepare(
        `INSERT INTO misc_contributions (
          user_id, role_label, thread_id, month_key, note, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(input.userId, input.roleLabel, input.threadId, monthKey, input.note, input.actorId, now);
    const contribution = this.getContribution(Number(result.lastInsertRowid));
    logAudit({
      actorId: input.actorId,
      action: "misc_contribution.create",
      targetType: "misc_contribution",
      targetId: String(contribution.id),
      after: contribution
    });
    return contribution;
  }

  deleteMiscContribution(actorId: string, id: number): void {
    const before = this.getContribution(id);
    this.db.prepare("DELETE FROM misc_contributions WHERE id = ?").run(id);
    logAudit({
      actorId,
      action: "misc_contribution.delete",
      targetType: "misc_contribution",
      targetId: String(id),
      before
    });
  }

  listRecentContributions(limit = 25): MiscContributionRecord[] {
    return this.db
      .prepare("SELECT * FROM misc_contributions ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(limit) as MiscContributionRecord[];
  }

  async ensureLeadDashboard(client: Client): Promise<void> {
    const channelId = this.settingsRepo.getOptional("leadOnly");
    if (!channelId) {
      return;
    }
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel || !("send" in channel) || !("messages" in channel)) {
      return;
    }

    const payload = {
      content: "統括ダッシュボード",
      components: buildLeadDashboardComponents()
    };
    const existingId = this.getSetting<string | null>("lead_dashboard_message_id", null);
    if (existingId) {
      const message = await channel.messages.fetch(existingId).catch(() => null);
      if (message) {
        await message.edit(payload);
        return;
      }
    }

    const sent = await channel.send(payload);
    await sent.pin("Lead dashboard").catch(() => null);
    this.setSetting("lead_dashboard_message_id", sent.id, unixNow());
  }

  private getRoleReward(roleLabel: string): RoleRewardRecord {
    const row = this.findRoleReward(roleLabel);
    if (!row) {
      throw new Error("役割単価が見つかりませんでした。");
    }
    return row;
  }

  private findRoleReward(roleLabel: string): RoleRewardRecord | null {
    return (
      this.db.prepare("SELECT * FROM role_rewards WHERE role_label = ?").get(roleLabel) as
        | RoleRewardRecord
        | undefined
    ) ?? null;
  }

  private getGrade(id: number): BaseSalaryGradeRecord | null {
    return (
      this.db.prepare("SELECT * FROM base_salary_grades WHERE id = ?").get(id) as
        | BaseSalaryGradeRecord
        | undefined
    ) ?? null;
  }

  private getGradeByName(name: string): BaseSalaryGradeRecord {
    const row = this.db.prepare("SELECT * FROM base_salary_grades WHERE name = ?").get(name) as
      | BaseSalaryGradeRecord
      | undefined;
    if (!row) {
      throw new Error("基本給グレードが見つかりませんでした。");
    }
    return row;
  }

  private getContribution(id: number): MiscContributionRecord {
    const row = this.db.prepare("SELECT * FROM misc_contributions WHERE id = ?").get(id) as
      | MiscContributionRecord
      | undefined;
    if (!row) {
      throw new Error("貢献記録が見つかりませんでした。");
    }
    return row;
  }

  private getSettingOptional(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM reward_settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  private getSetting<T>(key: string, fallback: T): T {
    const value = this.getSettingOptional(key);
    if (!value) {
      return fallback;
    }
    return JSON.parse(value) as T;
  }

  private setSetting(key: string, value: unknown, now: number): void {
    this.db
      .prepare(
        `INSERT INTO reward_settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           value = excluded.value,
           updated_at = excluded.updated_at`
      )
      .run(key, JSON.stringify(value), now);
  }
}

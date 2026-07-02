import type Database from "better-sqlite3";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { roleLabel } from "../../db/repos/roles.js";
import { unixNow } from "../../lib/time.js";
import { monthBounds } from "../overview/calendar.js";
import { PayrollService } from "../payroll/service.js";
import { SelfReviewService } from "../retrospective/selfReview.js";
import {
  BACKSTAGE_GROUP_LABEL,
  BACKSTAGE_ROLE_LABELS,
  DEFAULT_BIAS_THRESHOLD,
  detectRoleBias,
  type RoleBiasInput,
  type RoleBiasResult
} from "./bias.js";

export { detectRoleBias } from "./bias.js";
export type { RoleBiasInput, RoleBiasResult } from "./bias.js";

const INACTIVE_SECONDS = 30 * 24 * 60 * 60;

export interface MonthlyReport {
  monthKey: string;
  events: {
    done: number;
    inProgress: number;
    postponed: number;
    cancelled: number;
  };
  roleBias: RoleBiasResult[];
  backstageBias: RoleBiasResult | null;
  pending: {
    overdueTodos: number;
    pendingProofExpenses: number;
    unconfirmedRoles: number;
  };
  payroll: {
    status: "none" | "draft" | "finalized";
    total: number;
    nearCapUserIds: string[];
  };
  selfReview: {
    submitted: number;
    expected: number;
  };
  inactiveUserIds: string[];
  biasThreshold: number;
}

interface RoleAssignmentRow {
  role_type: string;
  role_kind: "main" | "custom";
  role_label: string | null;
  user_id: string;
  count: number;
}

export class ReportService {
  constructor(
    private readonly db: Database.Database,
    private readonly settingsRepo: SettingsRepo
  ) {}

  biasThreshold(): number {
    const row = this.db
      .prepare("SELECT value FROM reward_settings WHERE key = 'bias_threshold'")
      .get() as { value: string } | undefined;
    if (!row) {
      return DEFAULT_BIAS_THRESHOLD;
    }
    const parsed = Number(row.value);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : DEFAULT_BIAS_THRESHOLD;
  }

  buildMonthlyReport(monthKey: string): MonthlyReport {
    const bounds = monthBounds(monthKey);
    const threshold = this.biasThreshold();

    const events = {
      done: this.count(
        "SELECT COUNT(*) AS count FROM events WHERE status = 'done' AND closed_at >= ? AND closed_at < ?",
        bounds.startAt,
        bounds.endAt
      ),
      inProgress: this.count("SELECT COUNT(*) AS count FROM events WHERE status = 'in_progress'"),
      postponed: this.count("SELECT COUNT(*) AS count FROM events WHERE status = 'postponed'"),
      cancelled: this.count(
        "SELECT COUNT(*) AS count FROM events WHERE status = 'cancelled' AND closed_at >= ? AND closed_at < ?",
        bounds.startAt,
        bounds.endAt
      )
    };

    const roleInputs = this.roleAssignmentInputs(bounds.startAt, bounds.endAt);
    const roleBias = detectRoleBias(roleInputs, threshold);
    const backstageBias = this.backstageBias(roleInputs, threshold);

    const pending = {
      overdueTodos: this.count(
        `SELECT COUNT(*) AS count FROM todos
         WHERE due_at >= ? AND due_at < ?
           AND (
             (status = 'done' AND done_at IS NOT NULL AND done_at > due_at)
             OR (status = 'open' AND due_at < ?)
           )`,
        bounds.startAt,
        bounds.endAt,
        unixNow()
      ),
      pendingProofExpenses: this.count(
        `SELECT COUNT(*) AS count FROM expenses
         WHERE proof_status = 'pending_proof' AND voided = 0
           AND occurred_at >= ? AND occurred_at < ?`,
        bounds.startAt,
        bounds.endAt
      ),
      unconfirmedRoles: this.count(
        `SELECT COUNT(*) AS count FROM event_roles
         INNER JOIN events ON events.thread_id = event_roles.thread_id
         WHERE event_roles.confirmed_at IS NULL
           AND events.status = 'done'
           AND events.closed_at >= ? AND events.closed_at < ?`,
        bounds.startAt,
        bounds.endAt
      )
    };

    const payroll = this.payrollSummary(monthKey);
    const selfReviewService = new SelfReviewService(this.db, this.settingsRepo);
    const selfReview = {
      submitted: selfReviewService.listSubmitters(monthKey).length,
      expected: selfReviewService.expectedCount()
    };

    return {
      monthKey,
      events,
      roleBias,
      backstageBias,
      pending,
      payroll,
      selfReview,
      inactiveUserIds: this.inactiveUsers(),
      biasThreshold: threshold
    };
  }

  private roleAssignmentInputs(startAt: number, endAt: number): RoleBiasInput[] {
    const rows = this.db
      .prepare(
        `SELECT event_roles.role_type, event_roles.role_kind, event_roles.role_label,
                event_roles.user_id, COUNT(*) AS count
         FROM event_roles
         INNER JOIN events ON events.thread_id = event_roles.thread_id
         WHERE events.status = 'done'
           AND events.closed_at >= ? AND events.closed_at < ?
         GROUP BY event_roles.role_type, event_roles.role_kind, event_roles.role_label, event_roles.user_id`
      )
      .all(startAt, endAt) as RoleAssignmentRow[];

    const byLabel = new Map<string, Map<string, number>>();
    for (const row of rows) {
      const label = roleLabel(row);
      const counts = byLabel.get(label) ?? new Map<string, number>();
      counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + row.count);
      byLabel.set(label, counts);
    }

    return [...byLabel.entries()].map(([label, counts]) => ({
      label,
      counts: [...counts.entries()].map(([userId, count]) => ({ userId, count }))
    }));
  }

  private backstageBias(roleInputs: RoleBiasInput[], threshold: number): RoleBiasResult | null {
    const backstage = new Set<string>(BACKSTAGE_ROLE_LABELS);
    const merged = new Map<string, number>();
    for (const input of roleInputs) {
      if (!backstage.has(input.label)) {
        continue;
      }
      for (const entry of input.counts) {
        merged.set(entry.userId, (merged.get(entry.userId) ?? 0) + entry.count);
      }
    }
    if (merged.size === 0) {
      return null;
    }
    const [result] = detectRoleBias(
      [
        {
          label: BACKSTAGE_GROUP_LABEL,
          counts: [...merged.entries()].map(([userId, count]) => ({ userId, count }))
        }
      ],
      threshold
    );
    return result ?? null;
  }

  private payrollSummary(monthKey: string): MonthlyReport["payroll"] {
    const payrollService = new PayrollService(this.db);
    const run = payrollService.getRunByMonth(monthKey);
    if (!run) {
      return { status: "none", total: 0, nearCapUserIds: [] };
    }
    const items = payrollService.listItems(run.id);
    const total = items.reduce((sum, item) => sum + item.total, 0);
    const nearCapUserIds = items
      .filter((item) => item.cap !== null && item.cap > 0 && item.total >= item.cap * 0.9)
      .map((item) => item.user_id);
    return { status: run.status, total, nearCapUserIds };
  }

  private inactiveUsers(): string[] {
    const cutoff = unixNow() - INACTIVE_SECONDS;
    const rows = this.db
      .prepare(
        `SELECT user_grades.user_id AS user_id,
           (
             SELECT MAX(value) FROM (
               SELECT MAX(ts) AS value FROM audit_log WHERE actor_id = user_grades.user_id
               UNION ALL
               SELECT MAX(done_at) AS value FROM todos WHERE assignee = user_grades.user_id
               UNION ALL
               SELECT MAX(confirmed_at) AS value FROM event_roles WHERE user_id = user_grades.user_id
               UNION ALL
               SELECT MAX(created_at) AS value FROM earnings WHERE user_id = user_grades.user_id AND voided = 0
             )
           ) AS last_active
         FROM user_grades`
      )
      .all() as Array<{ user_id: string; last_active: number | null }>;

    return rows
      .filter((row) => row.last_active === null || row.last_active < cutoff)
      .map((row) => row.user_id);
  }

  private count(sql: string, ...params: unknown[]): number {
    const row = this.db.prepare(sql).get(...params) as { count: number } | undefined;
    return row?.count ?? 0;
  }
}

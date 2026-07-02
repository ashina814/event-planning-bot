import type Database from "better-sqlite3";
import { logAudit } from "../../lib/audit.js";
import { formatJstPlainDate, unixNow } from "../../lib/time.js";

export interface PayrollRunRecord {
  id: number;
  month_key: string;
  status: "draft" | "finalized";
  created_at: number;
  updated_at: number;
  finalized_at: number | null;
}

export interface PayrollItemRecord {
  id: number;
  run_id: number;
  user_id: string;
  base_salary: number;
  work_total: number;
  eval_bonus: number;
  special_bonus: number;
  cap: number | null;
  cap_action: "unresolved" | "trim" | "keep" | null;
  total: number;
  note: string | null;
}

export class PayrollService {
  constructor(private readonly db: Database.Database) {}

  defaultMonthKey(now = unixNow()): string {
    const today = formatJstPlainDate(now);
    const [yearRaw, monthRaw] = today.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const prevYear = month === 1 ? year - 1 : year;
    const prevMonth = month === 1 ? 12 : month - 1;
    return `${prevYear}-${String(prevMonth).padStart(2, "0")}`;
  }

  generateDraft(actorId: string, monthKey: string): PayrollRunRecord {
    const now = unixNow();
    const existing = this.getRunByMonth(monthKey);
    if (existing?.status === "finalized") {
      throw new Error("確定済みの支給案は更新できません。");
    }

    const run = existing ?? this.createRun(monthKey, now);
    const existingItems = new Map(this.listItems(run.id).map((item) => [item.user_id, item]));
    const users = new Set<string>();
    this.db
      .prepare("SELECT DISTINCT user_id FROM earnings WHERE month_key = ? AND voided = 0")
      .all(monthKey)
      .forEach((row) => users.add((row as { user_id: string }).user_id));
    this.db
      .prepare("SELECT user_id FROM user_grades")
      .all()
      .forEach((row) => users.add((row as { user_id: string }).user_id));

    const upsert = this.db.prepare(
      `INSERT INTO payroll_items (
        run_id, user_id, base_salary, work_total, eval_bonus, special_bonus,
        cap, cap_action, total, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, user_id) DO UPDATE SET
        base_salary = excluded.base_salary,
        work_total = excluded.work_total,
        cap = excluded.cap,
        cap_action = excluded.cap_action,
        total = excluded.total`
    );

    for (const userId of users) {
      const grade = this.gradeForUser(userId);
      const workTotal = this.workTotal(userId, monthKey);
      const existingItem = existingItems.get(userId);
      const evalBonus = existingItem?.eval_bonus ?? 0;
      const specialBonus = existingItem?.special_bonus ?? 0;
      const rawTotal = (grade?.amount ?? 0) + workTotal + evalBonus + specialBonus;
      const cap = grade?.monthly_cap ?? null;
      const previousAction = existingItem?.cap_action ?? null;
      const capAction = cap !== null && rawTotal > cap
        ? previousAction === "trim" || previousAction === "keep"
          ? previousAction
          : "unresolved"
        : null;
      const total = capAction === "trim" && cap !== null ? cap : rawTotal;
      upsert.run(
        run.id,
        userId,
        grade?.amount ?? 0,
        workTotal,
        evalBonus,
        specialBonus,
        cap,
        capAction,
        total,
        existingItem?.note ?? null
      );
    }

    this.db.prepare("UPDATE payroll_runs SET updated_at = ? WHERE id = ?").run(now, run.id);
    const updated = this.getRun(run.id);
    logAudit({
      actorId,
      action: "payroll.draft_generate",
      targetType: "payroll_run",
      targetId: String(run.id),
      after: { monthKey, userCount: users.size }
    });
    return updated;
  }

  listItems(runId: number): PayrollItemRecord[] {
    return this.db
      .prepare("SELECT * FROM payroll_items WHERE run_id = ? ORDER BY total DESC, user_id ASC")
      .all(runId) as PayrollItemRecord[];
  }

  getRun(id: number): PayrollRunRecord {
    const row = this.db.prepare("SELECT * FROM payroll_runs WHERE id = ?").get(id) as PayrollRunRecord | undefined;
    if (!row) {
      throw new Error("支給案が見つかりませんでした。");
    }
    return row;
  }

  getRunByMonth(monthKey: string): PayrollRunRecord | null {
    return (
      this.db.prepare("SELECT * FROM payroll_runs WHERE month_key = ?").get(monthKey) as
        | PayrollRunRecord
        | undefined
    ) ?? null;
  }

  resolveCap(actorId: string, runId: number, userId: string, action: "trim" | "keep"): PayrollItemRecord {
    const item = this.getItem(runId, userId);
    const rawTotal = item.base_salary + item.work_total + item.eval_bonus + item.special_bonus;
    const total = action === "trim" && item.cap !== null ? item.cap : rawTotal;
    this.db
      .prepare("UPDATE payroll_items SET cap_action = ?, total = ? WHERE run_id = ? AND user_id = ?")
      .run(action, total, runId, userId);
    const updated = this.getItem(runId, userId);
    logAudit({
      actorId,
      action: "payroll.cap_action",
      targetType: "payroll_item",
      targetId: `${runId}:${userId}`,
      before: item,
      after: updated
    });
    return updated;
  }

  finalize(actorId: string, runId: number): PayrollRunRecord {
    const unresolved = this.db
      .prepare("SELECT COUNT(*) AS count FROM payroll_items WHERE run_id = ? AND cap_action = 'unresolved'")
      .get(runId) as { count: number };
    if (unresolved.count > 0) {
      throw new Error("上限超過の処理が未選択のユーザーがいます。");
    }
    const run = this.getRun(runId);
    if (run.status === "finalized") {
      return run;
    }
    const now = unixNow();
    this.db
      .prepare("UPDATE payroll_runs SET status = 'finalized', finalized_at = ?, updated_at = ? WHERE id = ?")
      .run(now, now, runId);
    const updated = this.getRun(runId);
    logAudit({
      actorId,
      action: "payroll.finalize",
      targetType: "payroll_run",
      targetId: String(runId),
      before: run,
      after: updated
    });
    return updated;
  }

  addManualEarning(actorId: string, userId: string, monthKey: string, roleLabel: string, amount: number): void {
    if (!Number.isInteger(amount) || amount < 0) {
      throw new Error("金額は0以上の整数で入力してください。");
    }
    const now = unixNow();
    const result = this.db
      .prepare(
        `INSERT INTO earnings (
          user_id, thread_id, source, role_label, base_amount, multiplier,
          amount, month_key, created_at, voided
        ) VALUES (?, NULL, 'manual', ?, ?, 1, ?, ?, ?, 0)`
      )
      .run(userId, roleLabel.trim() || "手動追加", amount, amount, monthKey, now);
    logAudit({
      actorId,
      action: "earnings.manual_add",
      targetType: "earning",
      targetId: String(result.lastInsertRowid),
      after: { userId, monthKey, roleLabel, amount }
    });
  }

  voidEarning(actorId: string, earningId: number): void {
    const before = this.db.prepare("SELECT * FROM earnings WHERE id = ?").get(earningId);
    this.db.prepare("UPDATE earnings SET voided = 1 WHERE id = ?").run(earningId);
    logAudit({
      actorId,
      action: "earnings.void",
      targetType: "earning",
      targetId: String(earningId),
      before
    });
  }

  private createRun(monthKey: string, now: number): PayrollRunRecord {
    const result = this.db
      .prepare("INSERT INTO payroll_runs (month_key, status, created_at, updated_at) VALUES (?, 'draft', ?, ?)")
      .run(monthKey, now, now);
    return this.getRun(Number(result.lastInsertRowid));
  }

  private getItem(runId: number, userId: string): PayrollItemRecord {
    const row = this.db
      .prepare("SELECT * FROM payroll_items WHERE run_id = ? AND user_id = ?")
      .get(runId, userId) as PayrollItemRecord | undefined;
    if (!row) {
      throw new Error("支給明細が見つかりませんでした。");
    }
    return row;
  }

  private gradeForUser(userId: string): { amount: number; monthly_cap: number | null } | null {
    return (
      this.db
        .prepare(
          `SELECT base_salary_grades.amount, base_salary_grades.monthly_cap
           FROM user_grades
           INNER JOIN base_salary_grades ON base_salary_grades.id = user_grades.grade_id
           WHERE user_grades.user_id = ?`
        )
        .get(userId) as { amount: number; monthly_cap: number | null } | undefined
    ) ?? null;
  }

  private workTotal(userId: string, monthKey: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM earnings
         WHERE user_id = ? AND month_key = ? AND voided = 0`
      )
      .get(userId, monthKey) as { total: number };
    return row.total;
  }
}

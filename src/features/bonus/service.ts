import type Database from "better-sqlite3";
import { logAudit } from "../../lib/audit.js";
import { unixNow } from "../../lib/time.js";

export type SpecialBonusStatus = "pending" | "approved" | "rejected";

export interface SpecialBonusRecord {
  id: number;
  user_id: string;
  amount: number;
  reason: string;
  thread_id: string | null;
  month_key: string;
  status: SpecialBonusStatus;
  created_by: string;
  created_at: number;
  decided_by: string | null;
  decided_at: number | null;
}

export class SpecialBonusService {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    actorId: string;
    userId: string;
    amount: number;
    reason: string;
    threadId: string | null;
    monthKey: string;
  }): SpecialBonusRecord {
    if (!Number.isInteger(input.amount) || input.amount <= 0) {
      throw new Error("金額は1以上の整数で入力してください。");
    }
    const reason = input.reason.trim();
    if (!reason) {
      throw new Error("特別貢献の理由を入力してください。");
    }
    const now = unixNow();
    const result = this.db
      .prepare(
        `INSERT INTO special_bonuses (
          user_id, amount, reason, thread_id, month_key, status, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`
      )
      .run(input.userId, input.amount, reason, input.threadId, input.monthKey, input.actorId, now);
    const bonus = this.get(Number(result.lastInsertRowid));
    logAudit({
      actorId: input.actorId,
      action: "bonus.create",
      targetType: "bonus",
      targetId: String(bonus.id),
      after: bonus
    });
    return bonus;
  }

  approve(actorId: string, id: number): SpecialBonusRecord {
    const before = this.get(id);
    if (before.status === "approved") {
      return before;
    }
    const now = unixNow();
    this.db
      .prepare("UPDATE special_bonuses SET status = 'approved', decided_by = ?, decided_at = ? WHERE id = ?")
      .run(actorId, now, id);
    const after = this.get(id);
    logAudit({
      actorId,
      action: "bonus.approve",
      targetType: "bonus",
      targetId: String(id),
      before,
      after
    });
    return after;
  }

  reject(actorId: string, id: number, reason: string | null = null): SpecialBonusRecord {
    const before = this.get(id);
    if (before.status === "rejected") {
      return before;
    }
    const now = unixNow();
    this.db
      .prepare("UPDATE special_bonuses SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?")
      .run(actorId, now, id);
    const after = this.get(id);
    logAudit({
      actorId,
      action: "bonus.reject",
      targetType: "bonus",
      targetId: String(id),
      before,
      after: { ...after, rejectReason: reason?.trim() || null }
    });
    return after;
  }

  cancelApproved(actorId: string, id: number): SpecialBonusRecord {
    const before = this.get(id);
    if (before.status !== "approved") {
      throw new Error("承認済みの特別貢献だけ取り消せます。");
    }
    const now = unixNow();
    this.db
      .prepare("UPDATE special_bonuses SET status = 'rejected', decided_by = ?, decided_at = ? WHERE id = ?")
      .run(actorId, now, id);
    const after = this.get(id);
    logAudit({
      actorId,
      action: "bonus.cancel",
      targetType: "bonus",
      targetId: String(id),
      before,
      after
    });
    return after;
  }

  listByMonth(monthKey: string): SpecialBonusRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM special_bonuses
         WHERE month_key = ?
         ORDER BY
           CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
           created_at DESC,
           id DESC`
      )
      .all(monthKey) as SpecialBonusRecord[];
  }

  get(id: number): SpecialBonusRecord {
    const row = this.db.prepare("SELECT * FROM special_bonuses WHERE id = ?").get(id) as
      | SpecialBonusRecord
      | undefined;
    if (!row) {
      throw new Error("特別貢献が見つかりませんでした。");
    }
    return row;
  }
}

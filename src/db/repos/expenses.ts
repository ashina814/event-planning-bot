import type Database from "better-sqlite3";
import type {
  ExpenseCategory,
  ExpenseDirection,
  ExpenseRecord,
  ExpenseThresholdKind,
  ExpenseThresholdRecord
} from "../../types/index.js";

interface CreateExpenseInput {
  threadId: string;
  category: ExpenseCategory;
  amount: number;
  direction: ExpenseDirection;
  recipientId: string | null;
  responderId: string;
  memo: string | null;
  occurredAt: number;
  now: number;
}

export class ExpensesRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateExpenseInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO expenses (
          thread_id, category, amount, direction, recipient_id, responder_id,
          proof_url, proof_msg_id, memo, occurred_at, created_at, proof_status
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, 'pending_proof')`
      )
      .run(
        input.threadId,
        input.category,
        input.amount,
        input.direction,
        input.recipientId,
        input.responderId,
        input.memo,
        input.occurredAt,
        input.now
      );

    return Number(result.lastInsertRowid);
  }

  get(id: number): ExpenseRecord | null {
    return (
      this.db.prepare("SELECT * FROM expenses WHERE id = ?").get(id) as ExpenseRecord | undefined
    ) ?? null;
  }

  listByThread(threadId: string, limit = 25): ExpenseRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM expenses
         WHERE thread_id = ?
         ORDER BY occurred_at DESC, created_at DESC
         LIMIT ?`
      )
      .all(threadId, limit) as ExpenseRecord[];
  }

  findLatestPendingProof(responderId: string, since: number): ExpenseRecord | null {
    return (
      this.db
        .prepare(
          `SELECT * FROM expenses
           WHERE responder_id = ?
             AND proof_status = 'pending_proof'
             AND created_at >= ?
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(responderId, since) as ExpenseRecord | undefined
    ) ?? null;
  }

  markProofAttached(id: number, proofUrl: string, proofMsgId: string): void {
    this.db
      .prepare(
        `UPDATE expenses
         SET proof_url = ?, proof_msg_id = ?, proof_status = 'attached'
         WHERE id = ?`
      )
      .run(proofUrl, proofMsgId, id);
  }

  totalByThread(threadId: string, direction: ExpenseDirection): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE thread_id = ? AND direction = ?`
      )
      .get(threadId, direction) as { total: number };
    return row.total;
  }

  totalBetween(startAt: number, endAt: number, direction: ExpenseDirection): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE occurred_at >= ? AND occurred_at < ? AND direction = ?`
      )
      .get(startAt, endAt, direction) as { total: number };
    return row.total;
  }

  totalsByCategoryBetween(
    startAt: number,
    endAt: number,
    direction: ExpenseDirection
  ): Array<{ category: ExpenseCategory; total: number }> {
    return this.db
      .prepare(
        `SELECT category, COALESCE(SUM(amount), 0) AS total
         FROM expenses
         WHERE occurred_at >= ? AND occurred_at < ? AND direction = ?
         GROUP BY category
         ORDER BY total DESC, category ASC`
      )
      .all(startAt, endAt, direction) as Array<{ category: ExpenseCategory; total: number }>;
  }

  rankingByEventBetween(startAt: number, endAt: number, limit = 10): Array<{ title: string; total: number }> {
    return this.db
      .prepare(
        `SELECT COALESCE(events.title, '未紐付け') AS title, COALESCE(SUM(expenses.amount), 0) AS total
         FROM expenses
         LEFT JOIN events ON events.thread_id = expenses.thread_id
         WHERE expenses.occurred_at >= ?
           AND expenses.occurred_at < ?
           AND expenses.direction = 'out'
         GROUP BY COALESCE(events.title, '未紐付け')
         ORDER BY total DESC, title ASC
         LIMIT ?`
      )
      .all(startAt, endAt, limit) as Array<{ title: string; total: number }>;
  }

  pendingProofCount(threadId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM expenses
         WHERE thread_id = ? AND proof_status = 'pending_proof'`
      )
      .get(threadId) as { count: number };
    return row.count;
  }

  ensureDefaultThresholds(now: number): void {
    const defaults: Array<{ kind: ExpenseThresholdKind; threshold: number }> = [
      { kind: "per_tx", threshold: 50_000 },
      { kind: "per_event", threshold: 300_000 },
      { kind: "per_month", threshold: 1_000_000 }
    ];

    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO expense_thresholds (kind, threshold, enabled, updated_at)
       VALUES (?, ?, 1, ?)`
    );
    defaults.forEach((item) => insert.run(item.kind, item.threshold, now));
  }

  getThreshold(kind: ExpenseThresholdKind): ExpenseThresholdRecord | null {
    return (
      this.db.prepare("SELECT * FROM expense_thresholds WHERE kind = ?").get(kind) as
        | ExpenseThresholdRecord
        | undefined
    ) ?? null;
  }

  hasAlertFired(kind: ExpenseThresholdKind, scopeKey: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS found FROM expense_alerts_fired WHERE kind = ? AND scope_key = ?")
      .get(kind, scopeKey) as { found: number } | undefined;
    return Boolean(row);
  }

  markAlertFired(kind: ExpenseThresholdKind, scopeKey: string, now: number): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO expense_alerts_fired (kind, scope_key, fired_at)
         VALUES (?, ?, ?)`
      )
      .run(kind, scopeKey, now);
  }
}

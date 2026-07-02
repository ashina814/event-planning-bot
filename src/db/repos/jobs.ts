import type Database from "better-sqlite3";
import type { ScheduledJobRecord } from "../../types/index.js";

interface CreateJobInput {
  kind: string;
  payload: unknown;
  threadId?: string | null;
  fireAt: number;
  now: number;
}

export class JobsRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateJobInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO scheduled_jobs (kind, payload, thread_id, fire_at, status, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?)`
      )
      .run(input.kind, JSON.stringify(input.payload), input.threadId ?? null, input.fireAt, input.now);

    return Number(result.lastInsertRowid);
  }

  claimDue(now: number, limit = 10): ScheduledJobRecord[] {
    const tx = this.db.transaction(() => {
      const rows = this.db
        .prepare(
          `SELECT * FROM scheduled_jobs
           WHERE status = 'pending' AND fire_at <= ?
           ORDER BY fire_at ASC
           LIMIT ?`
        )
        .all(now, limit) as ScheduledJobRecord[];

      const update = this.db.prepare(
        "UPDATE scheduled_jobs SET status = 'processing' WHERE id = ? AND status = 'pending'"
      );

      return rows.filter((row) => update.run(row.id).changes === 1);
    });

    return tx();
  }

  findMissed(now: number): ScheduledJobRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM scheduled_jobs
         WHERE status = 'pending' AND fire_at < ?
         ORDER BY fire_at ASC`
      )
      .all(now) as ScheduledJobRecord[];
  }

  hasPendingKind(kind: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS found FROM scheduled_jobs WHERE kind = ? AND status = 'pending' LIMIT 1")
      .get(kind) as { found: number } | undefined;
    return Boolean(row);
  }

  markFired(id: number, now: number): void {
    this.db
      .prepare("UPDATE scheduled_jobs SET status = 'fired', fired_at = ?, error = NULL WHERE id = ?")
      .run(now, id);
  }

  markFailed(id: number, error: string): void {
    this.db
      .prepare("UPDATE scheduled_jobs SET status = 'failed', error = ? WHERE id = ?")
      .run(error, id);
  }

  markSkipped(id: number, reason: string): void {
    this.db
      .prepare("UPDATE scheduled_jobs SET status = 'skipped', error = ? WHERE id = ?")
      .run(reason, id);
  }

  cancelJobsByThread(threadId: string, kinds?: string[]): number {
    if (kinds && kinds.length > 0) {
      const placeholders = kinds.map(() => "?").join(", ");
      const result = this.db
        .prepare(
          `UPDATE scheduled_jobs
           SET status = 'cancelled', error = 'cancelled by event reschedule'
           WHERE thread_id = ?
             AND status = 'pending'
             AND kind IN (${placeholders})`
        )
        .run(threadId, ...kinds);
      return result.changes;
    }

    const result = this.db
      .prepare(
        `UPDATE scheduled_jobs
         SET status = 'cancelled', error = 'cancelled by event reschedule'
         WHERE thread_id = ?
           AND status = 'pending'`
      )
      .run(threadId);
    return result.changes;
  }

  cancelPendingByPayloadId(kind: string, payloadKey: string, payloadValue: number): number {
    const result = this.db
      .prepare(
        `UPDATE scheduled_jobs
         SET status = 'cancelled', error = 'cancelled by update'
         WHERE kind = ?
           AND status = 'pending'
           AND json_extract(payload, ?) = ?`
      )
      .run(kind, `$.${payloadKey}`, payloadValue);
    return result.changes;
  }
}

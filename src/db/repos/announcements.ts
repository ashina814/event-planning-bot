import type Database from "better-sqlite3";
import type { AnnouncementRecord } from "../../types/index.js";

interface CreateAnnouncementInput {
  threadId: string;
  body: string;
  createdBy: string;
  now: number;
}

export class AnnouncementsRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateAnnouncementInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO announcements (
          thread_id, body, created_by, created_at, posted_msg_id, posted_at, scheduled_at
        ) VALUES (?, ?, ?, ?, NULL, NULL, NULL)`
      )
      .run(input.threadId, input.body, input.createdBy, input.now);

    return Number(result.lastInsertRowid);
  }

  get(id: number): AnnouncementRecord | null {
    return (
      this.db.prepare("SELECT * FROM announcements WHERE id = ?").get(id) as
        | AnnouncementRecord
        | undefined
    ) ?? null;
  }

  listByThread(threadId: string, limit = 25): AnnouncementRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM announcements
         WHERE thread_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(threadId, limit) as AnnouncementRecord[];
  }

  latestByThread(threadId: string): AnnouncementRecord | null {
    return (
      this.db
        .prepare(
          `SELECT * FROM announcements
           WHERE thread_id = ?
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(threadId) as AnnouncementRecord | undefined
    ) ?? null;
  }

  markPosted(id: number, postedMessageId: string, now: number): void {
    this.db
      .prepare(
        `UPDATE announcements
         SET posted_msg_id = ?, posted_at = ?, scheduled_at = NULL
         WHERE id = ?`
      )
      .run(postedMessageId, now, id);
  }

  markScheduled(id: number, scheduledAt: number): void {
    this.db
      .prepare("UPDATE announcements SET scheduled_at = ? WHERE id = ?")
      .run(scheduledAt, id);
  }
}

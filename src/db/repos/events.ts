import type Database from "better-sqlite3";
import type { EventRecord, EventStatus } from "../../types/index.js";

interface CreateEventInput {
  threadId: string;
  seriesId?: number | null;
  title: string;
  status: EventStatus;
  scheduledAt?: number | null;
  controlMsgId?: string | null;
  parentMsgId?: string | null;
  createdBy: string;
  now: number;
}

export class EventsRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateEventInput): void {
    this.db
      .prepare(
        `INSERT INTO events (
          thread_id, series_id, title, status, scheduled_at, control_msg_id,
          parent_msg_id, created_by, created_at, updated_at, closed_at
        ) VALUES (
          @threadId, @seriesId, @title, @status, @scheduledAt, @controlMsgId,
          @parentMsgId, @createdBy, @now, @now, NULL
        )`
      )
      .run({
        threadId: input.threadId,
        seriesId: input.seriesId ?? null,
        title: input.title,
        status: input.status,
        scheduledAt: input.scheduledAt ?? null,
        controlMsgId: input.controlMsgId ?? null,
        parentMsgId: input.parentMsgId ?? null,
        createdBy: input.createdBy,
        now: input.now
      });
  }

  get(threadId: string): EventRecord | null {
    return (
      this.db.prepare("SELECT * FROM events WHERE thread_id = ?").get(threadId) as
        | EventRecord
        | undefined
    ) ?? null;
  }

  listOpen(limit = 25): EventRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM events
         WHERE status NOT IN ('done', 'cancelled')
         ORDER BY COALESCE(scheduled_at, created_at) ASC
         LIMIT ?`
      )
      .all(limit) as EventRecord[];
  }

  listRecent(limit = 25): EventRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM events
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(limit) as EventRecord[];
  }

  listScheduledBetween(startAt: number, endAt: number, limit = 100): EventRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM events
         WHERE scheduled_at >= ? AND scheduled_at < ?
         ORDER BY scheduled_at ASC
         LIMIT ?`
      )
      .all(startAt, endAt, limit) as EventRecord[];
  }

  countByStatusBetween(startAt: number, endAt: number): Array<{ status: EventStatus; count: number }> {
    return this.db
      .prepare(
        `SELECT status, COUNT(*) AS count
         FROM events
         WHERE COALESCE(scheduled_at, created_at) >= ?
           AND COALESCE(scheduled_at, created_at) < ?
         GROUP BY status
         ORDER BY status ASC`
      )
      .all(startAt, endAt) as Array<{ status: EventStatus; count: number }>;
  }

  countBySeriesBetween(startAt: number, endAt: number, limit = 10): Array<{ name: string; count: number }> {
    return this.db
      .prepare(
        `SELECT COALESCE(series.name, '単発') AS name, COUNT(*) AS count
         FROM events
         LEFT JOIN series ON series.id = events.series_id
         WHERE COALESCE(events.scheduled_at, events.created_at) >= ?
           AND COALESCE(events.scheduled_at, events.created_at) < ?
         GROUP BY COALESCE(series.name, '単発')
         ORDER BY count DESC, name ASC
         LIMIT ?`
      )
      .all(startAt, endAt, limit) as Array<{ name: string; count: number }>;
  }

  updateControlMessageId(threadId: string, messageId: string): void {
    this.db
      .prepare("UPDATE events SET control_msg_id = ?, updated_at = unixepoch() WHERE thread_id = ?")
      .run(messageId, threadId);
  }

  updateParentMessageId(threadId: string, messageId: string | null): void {
    this.db
      .prepare("UPDATE events SET parent_msg_id = ?, updated_at = unixepoch() WHERE thread_id = ?")
      .run(messageId, threadId);
  }

  updateStatus(threadId: string, status: EventStatus, now: number): void {
    const closedAt = status === "done" || status === "cancelled" ? now : null;
    this.db
      .prepare(
        `UPDATE events
         SET status = ?, updated_at = ?, closed_at = ?
         WHERE thread_id = ?`
      )
      .run(status, now, closedAt, threadId);
  }

  updateTitle(threadId: string, title: string, now: number): void {
    this.db
      .prepare("UPDATE events SET title = ?, updated_at = ? WHERE thread_id = ?")
      .run(title, now, threadId);
  }

  updateScheduledAt(threadId: string, scheduledAt: number | null, now: number): void {
    this.db
      .prepare("UPDATE events SET scheduled_at = ?, updated_at = ? WHERE thread_id = ?")
      .run(scheduledAt, now, threadId);
  }

  delete(threadId: string): void {
    this.db.prepare("DELETE FROM events WHERE thread_id = ?").run(threadId);
  }
}

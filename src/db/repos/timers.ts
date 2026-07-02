import type Database from "better-sqlite3";
import type { TimerScheduleRecord, TimerSectionRecord } from "../../types/index.js";

interface CreateScheduleInput {
  threadId: string;
  notifyChannel: string;
  mentionRole: string | null;
  preNoticeMin: number;
  now: number;
}

interface CreateSectionInput {
  scheduleId: number;
  ord: number;
  name: string;
  plannedStart: number;
  plannedMinutes: number;
}

export class TimersRepo {
  constructor(private readonly db: Database.Database) {}

  createSchedule(input: CreateScheduleInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO timer_schedules (
          thread_id, notify_channel, mention_role, pre_notice_min, state, created_at
        ) VALUES (?, ?, ?, ?, 'idle', ?)`
      )
      .run(
        input.threadId,
        input.notifyChannel,
        input.mentionRole,
        input.preNoticeMin,
        input.now
      );

    return Number(result.lastInsertRowid);
  }

  createSection(input: CreateSectionInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO timer_sections (
          schedule_id, ord, name, planned_start, planned_minutes, actual_start, actual_end
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL)`
      )
      .run(
        input.scheduleId,
        input.ord,
        input.name,
        input.plannedStart,
        input.plannedMinutes
      );

    return Number(result.lastInsertRowid);
  }

  getSchedule(id: number): TimerScheduleRecord | null {
    return (
      this.db.prepare("SELECT * FROM timer_schedules WHERE id = ?").get(id) as
        | TimerScheduleRecord
        | undefined
    ) ?? null;
  }

  latestSchedule(threadId: string): TimerScheduleRecord | null {
    return (
      this.db
        .prepare(
          `SELECT * FROM timer_schedules
           WHERE thread_id = ?
           ORDER BY created_at DESC
           LIMIT 1`
        )
        .get(threadId) as TimerScheduleRecord | undefined
    ) ?? null;
  }

  latestScheduleForPreviousSeriesEvent(
    seriesId: number,
    currentThreadId: string,
    beforeAt: number
  ): TimerScheduleRecord | null {
    return (
      this.db
        .prepare(
          `SELECT timer_schedules.*
           FROM timer_schedules
           INNER JOIN events ON events.thread_id = timer_schedules.thread_id
           WHERE events.series_id = ?
             AND events.thread_id <> ?
             AND COALESCE(events.scheduled_at, events.created_at) < ?
           ORDER BY COALESCE(events.scheduled_at, events.created_at) DESC,
                    timer_schedules.created_at DESC
           LIMIT 1`
        )
        .get(seriesId, currentThreadId, beforeAt) as TimerScheduleRecord | undefined
    ) ?? null;
  }

  listSections(scheduleId: number): TimerSectionRecord[] {
    return this.db
      .prepare("SELECT * FROM timer_sections WHERE schedule_id = ? ORDER BY ord ASC")
      .all(scheduleId) as TimerSectionRecord[];
  }

  getSection(sectionId: number): TimerSectionRecord | null {
    return (
      this.db.prepare("SELECT * FROM timer_sections WHERE id = ?").get(sectionId) as
        | TimerSectionRecord
        | undefined
    ) ?? null;
  }

  updateScheduleState(scheduleId: number, state: TimerScheduleRecord["state"]): void {
    this.db.prepare("UPDATE timer_schedules SET state = ? WHERE id = ?").run(state, scheduleId);
  }

  markSectionStarted(sectionId: number, now: number): void {
    this.db
      .prepare("UPDATE timer_sections SET actual_start = COALESCE(actual_start, ?) WHERE id = ?")
      .run(now, sectionId);
  }

  markSectionEnded(sectionId: number, now: number): void {
    this.db
      .prepare("UPDATE timer_sections SET actual_end = COALESCE(actual_end, ?) WHERE id = ?")
      .run(now, sectionId);
  }

  shiftPlannedStarts(scheduleId: number, deltaSeconds: number, onlyUnstarted: boolean): number {
    const sql = onlyUnstarted
      ? "UPDATE timer_sections SET planned_start = planned_start + ? WHERE schedule_id = ? AND actual_start IS NULL"
      : "UPDATE timer_sections SET planned_start = planned_start + ? WHERE schedule_id = ?";
    return this.db.prepare(sql).run(deltaSeconds, scheduleId).changes;
  }
}

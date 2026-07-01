import type { Client, GuildMember } from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SeriesRepo } from "../../db/repos/series.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import type { TimersRepo } from "../../db/repos/timers.js";
import { isEventLead } from "../../lib/permission.js";
import {
  formatJstPlainDate,
  formatJstTime,
  jstDateTimeToUnix,
  unixNow
} from "../../lib/time.js";
import type {
  EventRecord,
  EventRoleRecord,
  TimerScheduleRecord,
  TimerSectionRecord
} from "../../types/index.js";
import { syncEventArtifacts } from "../event-lifecycle/sync.js";

interface ParsedTimerLine {
  name: string;
  plannedStart: number;
}

interface TimerSetupInput {
  notifyChannel: string | null;
  mentionRole: string | null;
  preNoticeMin: number;
  timetable: string;
}

export class TimekeeperPermissionError extends Error {
  override name = "TimekeeperPermissionError";
}

export class TimekeeperService {
  constructor(
    private readonly client: Client,
    private readonly timersRepo: TimersRepo,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly seriesRepo: SeriesRepo,
    private readonly jobsRepo: JobsRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  getLatest(threadId: string): {
    schedule: TimerScheduleRecord | null;
    sections: TimerSectionRecord[];
  } {
    const schedule = this.timersRepo.latestSchedule(threadId);
    return {
      schedule,
      sections: schedule ? this.timersRepo.listSections(schedule.id) : []
    };
  }

  setup(member: GuildMember, threadId: string, input: TimerSetupInput): TimerScheduleRecord {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanOperate(member, roles);

    const parsed = this.parseTimetable(event, input.timetable);
    if (parsed.length < 1) {
      throw new Error("タイムテーブルを 1 行以上入力してください。");
    }

    const now = unixNow();
    const notifyChannel = input.notifyChannel ?? threadId;
    const preNoticeMin = Math.max(0, Math.min(60, input.preNoticeMin));
    const scheduleId = this.timersRepo.createSchedule({
      threadId,
      notifyChannel,
      mentionRole: input.mentionRole,
      preNoticeMin,
      now
    });

    const sectionIds = parsed.map((line, index) => {
      const next = parsed[index + 1];
      const previous = parsed[index - 1];
      const plannedMinutes = next
        ? Math.max(1, Math.round((next.plannedStart - line.plannedStart) / 60))
        : previous
          ? Math.max(1, Math.round((line.plannedStart - previous.plannedStart) / 60))
          : 5;

      return this.timersRepo.createSection({
        scheduleId,
        ord: index + 1,
        name: line.name,
        plannedStart: line.plannedStart,
        plannedMinutes
      });
    });

    const sections = this.timersRepo.listSections(scheduleId);
    for (const section of sections) {
      if (preNoticeMin > 0) {
        this.jobsRepo.create({
          kind: "timer_section_prenotice",
          payload: {
            scheduleId,
            sectionId: section.id,
            threadId,
            minutes: preNoticeMin
          },
          fireAt: section.planned_start - preNoticeMin * 60,
          now
        });
      }

      this.jobsRepo.create({
        kind: "timer_section_start",
        payload: {
          scheduleId,
          sectionId: section.id,
          threadId
        },
        fireAt: section.planned_start,
        now
      });
    }

    // Keep the ids materialized during setup; this catches insertion mismatches early.
    if (sectionIds.length !== sections.length) {
      throw new Error("タイマーセクションの保存に失敗しました。");
    }

    return this.requireSchedule(scheduleId);
  }

  async next(member: GuildMember, threadId: string, scheduleId: number): Promise<string> {
    const roles = this.rolesRepo.list(threadId);
    this.assertCanOperate(member, roles);

    const schedule = this.requireSchedule(scheduleId);
    const sections = this.timersRepo.listSections(scheduleId);
    if (sections.length === 0) {
      throw new Error("タイマーセクションがありません。");
    }

    const now = unixNow();
    const active = sections.find(
      (section) => section.actual_start !== null && section.actual_end === null
    );

    if (!active) {
      const first = sections.find((section) => section.actual_start === null);
      if (!first) {
        this.timersRepo.updateScheduleState(schedule.id, "finished");
        await this.sync(threadId);
        return "すべてのセクションは終了済みです。";
      }

      this.timersRepo.updateScheduleState(schedule.id, "running");
      this.timersRepo.markSectionStarted(first.id, now);
      await this.sync(threadId);
      return `「${first.name}」を開始しました。`;
    }

    this.timersRepo.markSectionEnded(active.id, now);
    const next = sections.find((section) => section.ord > active.ord && section.actual_start === null);
    if (!next) {
      this.timersRepo.updateScheduleState(schedule.id, "finished");
      await this.recordHistory(threadId, scheduleId);
      await this.sync(threadId);
      return "最後のセクションを終了しました。";
    }

    this.timersRepo.markSectionStarted(next.id, now);
    await this.sync(threadId);
    return `「${active.name}」を終了し、「${next.name}」を開始しました。`;
  }

  async notifySection(
    scheduleId: number,
    sectionId: number,
    mode: "prenotice" | "start",
    minutes = 0
  ): Promise<void> {
    const schedule = this.requireSchedule(scheduleId);
    const section = this.timersRepo.getSection(sectionId);
    if (!section || section.schedule_id !== scheduleId) {
      throw new Error("タイマーセクションが DB に見つかりません。");
    }
    if (schedule.state === "finished") {
      return;
    }

    const event = this.eventsRepo.get(schedule.thread_id);
    const mention = this.timerMention(schedule);
    const prefix = event ? `【${event.title}】` : "";
    const time = formatJstTime(section.planned_start);
    const content =
      mode === "prenotice"
        ? `⏰ ${prefix}あと${minutes}分で「${section.name}」開始 ${mention}`.trim()
        : `⏰ ${prefix}${time}「${section.name}」スタート ${mention}`.trim();

    const channel = await this.client.channels.fetch(schedule.notify_channel);
    if (!channel || !("send" in channel)) {
      throw new Error("タイマー通知先チャンネルが見つかりません。");
    }

    await channel.send({ content });
  }

  private async recordHistory(threadId: string, scheduleId: number): Promise<void> {
    const event = this.eventsRepo.get(threadId);
    if (!event?.series_id) {
      return;
    }

    const now = unixNow();
    const sections = this.timersRepo.listSections(scheduleId);
    for (const section of sections) {
      if (section.actual_start === null || section.actual_end === null) {
        continue;
      }
      const actualMinutes = Math.max(
        1,
        Math.round((section.actual_end - section.actual_start) / 60)
      );
      this.seriesRepo.addSectionHistory(
        event.series_id,
        section.name,
        threadId,
        null,
        actualMinutes,
        now
      );
    }
  }

  private parseTimetable(event: EventRecord, input: string): ParsedTimerLine[] {
    const baseDate = event.scheduled_at
      ? formatJstPlainDate(event.scheduled_at)
      : formatJstPlainDate(unixNow());

    return input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^(\d{1,2}):(\d{2})\s+(.+)$/);
        if (!match) {
          throw new Error(`タイムテーブル行の形式が不正です: ${line}`);
        }
        const hour = match[1]?.padStart(2, "0");
        const minute = match[2];
        const name = match[3]?.trim();
        if (!hour || !minute || !name) {
          throw new Error(`タイムテーブル行の形式が不正です: ${line}`);
        }

        return {
          name,
          plannedStart: jstDateTimeToUnix(`${baseDate} ${hour}:${minute}`)
        };
      })
      .sort((a, b) => a.plannedStart - b.plannedStart);
  }

  private timerMention(schedule: TimerScheduleRecord): string {
    if (schedule.mention_role) {
      return `<@&${schedule.mention_role}>`;
    }

    const main = this.rolesRepo.getFirst(schedule.thread_id, "main");
    return main ? `<@${main.user_id}>` : "";
  }

  private assertCanOperate(member: GuildMember, roles: EventRoleRecord[]): void {
    if (isEventLead(member, this.settingsRepo)) {
      return;
    }

    const canOperate = roles.some(
      (role) =>
        (role.role_type === "main" || role.role_type === "mc") &&
        role.user_id === member.id
    );
    if (!canOperate) {
      throw new TimekeeperPermissionError("タイマー操作は主担当・司会・イベント統括のみ可能です。");
    }
  }

  private requireEvent(threadId: string): EventRecord {
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("イベントが DB に見つかりません。");
    }
    return event;
  }

  private requireSchedule(scheduleId: number): TimerScheduleRecord {
    const schedule = this.timersRepo.getSchedule(scheduleId);
    if (!schedule) {
      throw new Error("タイマー設定が DB に見つかりません。");
    }
    return schedule;
  }

  private async sync(threadId: string): Promise<void> {
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
  }
}

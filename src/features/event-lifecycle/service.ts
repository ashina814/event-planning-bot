import {
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  type GuildMember,
  type TextBasedChannel
} from "discord.js";
import { getDb } from "../../db/connection.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SeriesRepo } from "../../db/repos/series.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import type { TimersRepo } from "../../db/repos/timers.js";
import { logAudit } from "../../lib/audit.js";
import {
  assertCanCreateEvent,
  assertCanManageEvent,
  assertLeadOrSub,
  fetchGuildMember,
  isEventLead
} from "../../lib/permission.js";
import { titleWithStatusPrefix } from "../../lib/parser.js";
import { formatJstDateTime, jstDateTimeToUnix, unixNow } from "../../lib/time.js";
import type { EventRecord, EventScale, EventStatus } from "../../types/index.js";
import { allowedStatusTransitions } from "../../ui/buttons.js";
import { buildParentPost } from "../../ui/embeds.js";
import { statusLabels } from "../../ui/labels.js";
import { RewardsService } from "../rewards/service.js";
import { syncEventArtifacts } from "./sync.js";

function truncateDiscordName(name: string): string {
  return name.length <= 100 ? name : name.slice(0, 97) + "...";
}

const eventRescheduleJobKinds = [
  "event_reminder_announce",
  "event_reminder_retrospective",
  "event_auto_progress"
] as const;

type DeleteEventMode = "data" | "thread";

export class EventLifecycleService {
  constructor(
    private readonly client: Client,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly seriesRepo: SeriesRepo,
    private readonly jobsRepo: JobsRepo,
    private readonly timersRepo: TimersRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  async createFromCommand(interaction: ChatInputCommandInteraction): Promise<EventRecord> {
    const member = await fetchGuildMember(interaction);
    assertCanCreateEvent(member, this.settingsRepo);

    const title = interaction.options.getString("title", true).trim();
    const seriesInput = interaction.options.getString("series")?.trim();
    const now = unixNow();
    const series = seriesInput ? this.seriesRepo.findOrCreate(seriesInput, now) : null;

    const eventForum = this.settingsRepo.require("eventForum", "イベントフォーラム");
    const forum = await this.client.channels.fetch(eventForum);
    if (!forum || forum.type !== ChannelType.GuildForum) {
      throw new Error("/admin でイベントフォーラムに Discord フォーラムチャンネル ID を設定してください。");
    }

    const starterContent = buildParentPost(
      {
        title,
        status: "planning",
        scheduled_at: null,
        created_by: interaction.user.id
      },
      [],
      series
    );

    const thread = await forum.threads.create({
      name: truncateDiscordName(titleWithStatusPrefix("planning", title)),
      message: {
        content: starterContent
      },
      reason: `Event created by ${interaction.user.tag}`
    });

    const starter = await thread.fetchStarterMessage().catch(() => null);

    this.eventsRepo.create({
      threadId: thread.id,
      seriesId: series?.id ?? null,
      title,
      status: "planning",
      scheduledAt: null,
      controlMsgId: null,
      parentMsgId: starter?.id ?? null,
      createdBy: interaction.user.id,
      now
    });

    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, thread.id);

    const event = this.eventsRepo.get(thread.id);
    if (!event) {
      throw new Error("イベント作成後の DB 読み込みに失敗しました。");
    }
    return event;
  }

  async changeStatus(
    member: GuildMember,
    threadId: string,
    nextStatus: EventStatus
  ): Promise<EventRecord> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanManageEvent(member, event, roles, this.settingsRepo);

    const transitions = allowedStatusTransitions(event.status);
    if (!transitions.includes(nextStatus)) {
      throw new Error(
        `${statusLabels[event.status]} から ${statusLabels[nextStatus]} へは変更できません。`
      );
    }

    const now = unixNow();
    this.eventsRepo.updateStatus(threadId, nextStatus, now);
    if (event.status === "done") {
      new RewardsService(getDb(), this.settingsRepo, this.eventsRepo).voidEventEarnings(member.id, threadId);
    }
    logAudit({
      actorId: member.id,
      action: "event.status_change",
      targetType: "event",
      targetId: threadId,
      before: { status: event.status },
      after: { status: nextStatus }
    });
    if (nextStatus === "postponed") {
      this.jobsRepo.cancelJobsByThread(threadId, [...eventRescheduleJobKinds]);
      await this.postToThread(
        threadId,
        "このイベントは延期されました。再開するときは [状態] から企画中に戻し、[日時] を再設定してください"
      );
    }
    if (nextStatus === "announced" || nextStatus === "in_progress") {
      this.jobsRepo.cancelJobsByThread(threadId, [...eventRescheduleJobKinds]);
      this.scheduleEventJobs(this.requireEvent(threadId), now);
    }
    if (nextStatus === "done") {
      const snapshot = new RewardsService(getDb(), this.settingsRepo, this.eventsRepo)
        .snapshotEventEarnings(member.id, this.requireEvent(threadId), roles);
      const total = snapshot.created.reduce((sum, earning) => sum + earning.amount, 0);
      await this.postToThread(
        threadId,
        [
          "支給対象を確定しました。",
          `件数: ${snapshot.created.length}`,
          `合計: ${total.toLocaleString("ja-JP")} Land`
        ].join("\n")
      );
      if (snapshot.missing.length > 0) {
        await this.postToLeadOnly(
          `単価未設定の担当があります: ${event.title}\n${snapshot.missing.map((label) => `- ${label}`).join("\n")}`
        );
      }
    }
    await this.renameThread(threadId, nextStatus, event.title);
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);

    return this.requireEvent(threadId);
  }

  async rollbackStatus(member: GuildMember, threadId: string): Promise<{ event: EventRecord; warning: string | null }> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanManageEvent(member, event, roles, this.settingsRepo);

    const nextStatus = this.previousStatus(event.status);
    if (!nextStatus) {
      throw new Error("企画中からは戻せません。");
    }
    if ((event.status === "done" || event.status === "cancelled") && !isEventLead(member, this.settingsRepo)) {
      throw new Error("完了・見送りの取り消しはイベント統括のみ可能です。");
    }

    const now = unixNow();
    this.eventsRepo.updateStatus(threadId, nextStatus, now);
    logAudit({
      actorId: member.id,
      action: "event.status_change",
      targetType: "event",
      targetId: threadId,
      before: { status: event.status },
      after: { status: nextStatus }
    });
    await this.renameThread(threadId, nextStatus, event.title);
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);

    const warning =
      (event.status === "cancelled" || event.status === "postponed") && event.scheduled_at && event.scheduled_at <= now
        ? "開催日時が過去のままです。[日時] から更新してください。"
        : null;
    return { event: this.requireEvent(threadId), warning };
  }

  async deleteEvent(member: GuildMember, threadId: string, mode: DeleteEventMode): Promise<string> {
    const event = this.requireEvent(threadId);
    assertLeadOrSub(member, this.settingsRepo);

    this.jobsRepo.cancelJobsByThread(threadId);
    const channel = await this.client.channels.fetch(threadId).catch(() => null);
    const manageableChannel = channel as { setName?: (name: string, reason?: string) => Promise<unknown> } | null;
    if (mode === "data" && manageableChannel?.setName) {
      await manageableChannel.setName(
        truncateDiscordName(`【bot管理外】${event.title}`),
        "Event removed from bot management"
      );
    }

    this.eventsRepo.delete(threadId);
    logAudit({
      actorId: member.id,
      action: "event.delete",
      targetType: "event",
      targetId: threadId,
      before: { event, mode }
    });

    const deletableChannel = channel as { delete?: (reason?: string) => Promise<unknown> } | null;
    if (mode === "thread" && deletableChannel?.delete) {
      await deletableChannel.delete("Event deleted by bot");
    }

    await member.send(
      `${member} がイベント『${event.title}』を削除しました (方式: ${mode === "thread" ? "スレッドごと" : "データのみ"})`
    ).catch(() => null);
    return event.title;
  }

  async setSchedule(member: GuildMember, threadId: string, input: string): Promise<EventRecord> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanManageEvent(member, event, roles, this.settingsRepo);

    const scheduledAt = jstDateTimeToUnix(input.trim());
    const updated = await this.changeScheduledAt(threadId, scheduledAt);
    logAudit({
      actorId: member.id,
      action: "event.reschedule",
      targetType: "event",
      targetId: threadId,
      before: { scheduled_at: event.scheduled_at },
      after: { scheduled_at: updated.scheduled_at }
    });
    return updated;
  }

  async changeScheduledAt(threadId: string, scheduledAt: number): Promise<EventRecord> {
    const now = unixNow();
    this.eventsRepo.updateScheduledAt(threadId, scheduledAt, now);
    this.jobsRepo.cancelJobsByThread(threadId, [...eventRescheduleJobKinds]);
    const updated = this.requireEvent(threadId);
    this.scheduleEventJobs(updated, now);
    await this.warnIfIdleTimerExists(threadId);
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
    return updated;
  }

  async setScale(member: GuildMember, threadId: string, scale: EventScale): Promise<EventRecord> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanManageEvent(member, event, roles, this.settingsRepo);

    const now = unixNow();
    this.eventsRepo.updateScale(threadId, scale, now);
    logAudit({
      actorId: member.id,
      action: "event.scale_change",
      targetType: "event",
      targetId: threadId,
      before: { scale: event.scale },
      after: { scale }
    });
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
    return this.requireEvent(threadId);
  }

  async autoProgress(threadId: string, expectedScheduledAt: number | null = null): Promise<void> {
    const event = this.eventsRepo.get(threadId);
    if (!event || event.status !== "announced") {
      return;
    }
    if (expectedScheduledAt && event.scheduled_at !== expectedScheduledAt) {
      return;
    }

    const now = unixNow();
    if (event.scheduled_at && event.scheduled_at <= now) {
      this.eventsRepo.updateStatus(threadId, "in_progress", now);
      await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
    }
  }

  async handleRetrospectiveReminder(threadId: string, expectedScheduledAt: number | null = null): Promise<void> {
    const event = this.eventsRepo.get(threadId);
    if (!event || event.status === "done" || event.status === "cancelled" || event.status === "postponed") {
      return;
    }
    if (expectedScheduledAt && event.scheduled_at !== expectedScheduledAt) {
      return;
    }

    const channel = await this.client.channels.fetch(threadId);
    if (!channel || !("send" in channel)) {
      throw new Error("振り返り通知先スレッドが見つかりません。");
    }

    const main = this.rolesRepo.getFirst(threadId, "main");
    const eventLeadRole = this.settingsRepo.get("eventLeadRole");
    const mention = main
      ? `<@${main.user_id}>`
      : eventLeadRole
        ? `<@&${eventLeadRole}>`
        : "イベント統括";
    await channel.send({
      content: [
        `📝 振り返りの時間です ${mention}`,
        "",
        "- 良かった点：",
        "- 改善点：",
        "- 次回やるなら変えたいこと：",
        "- 参加人数・反応：",
        "",
        "記入したら状態を【完了】に切り替えてください。"
      ].join("\n")
    });
  }

  async handleAnnounceReminder(
    threadId: string,
    expectedScheduledAt: number | null = null,
    label = "まもなく"
  ): Promise<void> {
    const event = this.eventsRepo.get(threadId);
    if (
      !event ||
      event.status === "announced" ||
      event.status === "in_progress" ||
      event.status === "done" ||
      event.status === "cancelled" ||
      event.status === "postponed"
    ) {
      return;
    }
    if (expectedScheduledAt && event.scheduled_at !== expectedScheduledAt) {
      return;
    }

    const channel = await this.client.channels.fetch(threadId);
    if (!channel || !("send" in channel)) {
      throw new Error("告知リマインド先スレッドが見つかりません。");
    }

    const main = this.rolesRepo.getFirst(threadId, "main");
    const eventLeadRole = this.settingsRepo.get("eventLeadRole");
    const mention = main
      ? `<@${main.user_id}>`
      : eventLeadRole
        ? `<@&${eventLeadRole}>`
        : "イベント統括";
    await channel.send({
      content: [
        `📢 告知確認リマインド ${mention}`,
        `開催${label}: ${event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定"}`,
        "必要なら告知文予約や状態変更を確認してください。"
      ].join("\n")
    });
  }

  private requireEvent(threadId: string): EventRecord {
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("イベントが DB に見つかりません。");
    }
    return event;
  }

  private async renameThread(
    threadId: string,
    status: EventStatus,
    title: string
  ): Promise<void> {
    const channel = (await this.client.channels.fetch(threadId)) as TextBasedChannel & {
      setName?: (name: string, reason?: string) => Promise<unknown>;
    };

    if (channel?.setName) {
      await channel.setName(
        truncateDiscordName(titleWithStatusPrefix(status, title)),
        "Event status changed"
      );
    }
  }

  private async postToThread(threadId: string, content: string): Promise<void> {
    const channel = await this.client.channels.fetch(threadId).catch(() => null);
    if (channel && "send" in channel) {
      await channel.send({ content });
    }
  }

  private async postToLeadOnly(content: string): Promise<void> {
    const channelId = this.settingsRepo.getOptional("leadOnly");
    if (!channelId) {
      return;
    }
    const channel = await this.client.channels.fetch(channelId).catch(() => null);
    if (channel && "send" in channel) {
      await channel.send({ content });
    }
  }

  private previousStatus(status: EventStatus): EventStatus | null {
    switch (status) {
      case "announced":
        return "announcing";
      case "announcing":
        return "planning";
      case "in_progress":
        return "announced";
      case "done":
        return "announced";
      case "cancelled":
      case "postponed":
        return "planning";
      case "planning":
        return null;
    }
  }

  private scheduleEventJobs(event: EventRecord, now: number): void {
    if (!event.scheduled_at) {
      return;
    }
    if (event.status === "postponed") {
      return;
    }

    if ((event.status === "planning" || event.status === "announcing") && event.scheduled_at > now) {
      const reminderSpecs = [
        { secondsBefore: 3 * 24 * 60 * 60, label: "3日前" },
        { secondsBefore: 24 * 60 * 60, label: "前日" }
      ];

      for (const spec of reminderSpecs) {
        const fireAt = event.scheduled_at - spec.secondsBefore;
        if (fireAt <= now) {
          continue;
        }
        this.jobsRepo.create({
          kind: "event_reminder_announce",
          payload: {
            threadId: event.thread_id,
            scheduledAt: event.scheduled_at,
            label: spec.label
          },
          threadId: event.thread_id,
          fireAt,
          now
        });
      }
    }

    if (event.status === "announced" && event.scheduled_at > now) {
      this.jobsRepo.create({
        kind: "event_auto_progress",
        payload: { threadId: event.thread_id, scheduledAt: event.scheduled_at },
        threadId: event.thread_id,
        fireAt: event.scheduled_at,
        now
      });
    }

    if (
      event.status !== "done" &&
      event.status !== "cancelled" &&
      event.scheduled_at + 24 * 60 * 60 > now
    ) {
      this.jobsRepo.create({
        kind: "event_reminder_retrospective",
        payload: {
          threadId: event.thread_id,
          scheduledAt: event.scheduled_at,
          scheduledText: formatJstDateTime(event.scheduled_at)
        },
        threadId: event.thread_id,
        fireAt: event.scheduled_at + 24 * 60 * 60,
        now
      });
    }
  }

  private async warnIfIdleTimerExists(threadId: string): Promise<void> {
    const timer = this.timersRepo.latestSchedule(threadId);
    if (!timer || timer.state !== "idle") {
      return;
    }

    const channel = await this.client.channels.fetch(threadId).catch(() => null);
    if (!channel || !("send" in channel)) {
      return;
    }

    await channel.send({
      content: "⚠️ 開催日時が変更されました。タイムキーパーのタイムテーブルを確認・再設定してください。"
    });
  }
}

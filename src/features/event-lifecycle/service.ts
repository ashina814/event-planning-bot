import {
  ChannelType,
  type ChatInputCommandInteraction,
  type Client,
  type GuildMember,
  type TextBasedChannel
} from "discord.js";
import { config } from "../../config.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SeriesRepo } from "../../db/repos/series.js";
import { assertCanCreateEvent, assertCanManageEvent, fetchGuildMember } from "../../lib/permission.js";
import { titleWithStatusPrefix } from "../../lib/parser.js";
import { formatJstDateTime, jstDateTimeToUnix, unixNow } from "../../lib/time.js";
import type { EventRecord, EventStatus } from "../../types/index.js";
import { allowedStatusTransitions } from "../../ui/buttons.js";
import { buildParentPost } from "../../ui/embeds.js";
import { statusLabels } from "../../ui/labels.js";
import { syncEventArtifacts } from "./sync.js";

function truncateDiscordName(name: string): string {
  return name.length <= 100 ? name : name.slice(0, 97) + "...";
}

export class EventLifecycleService {
  constructor(
    private readonly client: Client,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly seriesRepo: SeriesRepo,
    private readonly jobsRepo: JobsRepo
  ) {}

  async createFromCommand(interaction: ChatInputCommandInteraction): Promise<EventRecord> {
    const member = await fetchGuildMember(interaction);
    assertCanCreateEvent(member);

    const title = interaction.options.getString("title", true).trim();
    const seriesInput = interaction.options.getString("series")?.trim();
    const now = unixNow();
    const series = seriesInput ? this.seriesRepo.findOrCreate(seriesInput, now) : null;

    const forum = await this.client.channels.fetch(config.channels.eventForum);
    if (!forum || forum.type !== ChannelType.GuildForum) {
      throw new Error("CH_EVENT_FORUM は Discord フォーラムチャンネル ID を指定してください。");
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
    assertCanManageEvent(member, event, roles);

    const transitions = allowedStatusTransitions(event.status);
    if (!transitions.includes(nextStatus)) {
      throw new Error(
        `${statusLabels[event.status]} から ${statusLabels[nextStatus]} へは変更できません。`
      );
    }

    const now = unixNow();
    this.eventsRepo.updateStatus(threadId, nextStatus, now);
    if (nextStatus === "announced" || nextStatus === "in_progress") {
      this.scheduleEventJobs(this.requireEvent(threadId), now);
    }
    await this.renameThread(threadId, nextStatus, event.title);
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);

    return this.requireEvent(threadId);
  }

  async setSchedule(member: GuildMember, threadId: string, input: string): Promise<EventRecord> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanManageEvent(member, event, roles);

    const scheduledAt = jstDateTimeToUnix(input.trim());
    const now = unixNow();
    this.eventsRepo.updateScheduledAt(threadId, scheduledAt, now);
    const updated = this.requireEvent(threadId);
    this.scheduleEventJobs(updated, now);
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
    return updated;
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
    if (!event || event.status === "done" || event.status === "cancelled") {
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
    const mention = main ? `<@${main.user_id}>` : `<@&${config.roles.eventLead}>`;
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

  private scheduleEventJobs(event: EventRecord, now: number): void {
    if (!event.scheduled_at) {
      return;
    }

    if (event.status === "announced" && event.scheduled_at > now) {
      this.jobsRepo.create({
        kind: "event_auto_progress",
        payload: { threadId: event.thread_id, scheduledAt: event.scheduled_at },
        fireAt: event.scheduled_at,
        now
      });
    }

    if (event.scheduled_at + 24 * 60 * 60 > now) {
      this.jobsRepo.create({
        kind: "event_reminder_retrospective",
        payload: {
          threadId: event.thread_id,
          scheduledAt: event.scheduled_at,
          scheduledText: formatJstDateTime(event.scheduled_at)
        },
        fireAt: event.scheduled_at + 24 * 60 * 60,
        now
      });
    }
  }
}

import { type Client, type GuildMember } from "discord.js";
import type { AnnouncementsRepo } from "../../db/repos/announcements.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { isEventLead } from "../../lib/permission.js";
import { unixNow } from "../../lib/time.js";
import type { AnnouncementRecord, EventRecord, EventRoleRecord } from "../../types/index.js";

export class AnnouncementPermissionError extends Error {
  override name = "AnnouncementPermissionError";
}

interface ScheduleFromMessageInput {
  threadId: string;
  sourceChannelId: string;
  sourceMessageId: string;
  sourceAuthorId: string;
  targetChannelId: string;
  body: string;
  scheduledAt: number;
}

export class AnnouncementService {
  constructor(
    private readonly client: Client,
    private readonly announcementsRepo: AnnouncementsRepo,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly jobsRepo: JobsRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  list(threadId: string): AnnouncementRecord[] {
    return this.announcementsRepo.listByThread(threadId);
  }

  async scheduleFromMessage(
    member: GuildMember,
    input: ScheduleFromMessageInput
  ): Promise<AnnouncementRecord> {
    const event = this.requireEvent(input.threadId);
    const roles = this.rolesRepo.list(input.threadId);
    this.assertCanRegister(member, event, roles, input.sourceAuthorId);
    await this.assertCanSendTo(input.targetChannelId);

    const body = input.body.trim();
    if (!body) {
      throw new Error("告知文の本文が空です。");
    }

    const now = unixNow();
    if (input.scheduledAt <= now) {
      throw new Error("予約日時は現在より後にしてください。");
    }

    const id = this.announcementsRepo.create({
      threadId: input.threadId,
      body,
      sourceChannelId: input.sourceChannelId,
      sourceMessageId: input.sourceMessageId,
      targetChannelId: input.targetChannelId,
      scheduledAt: input.scheduledAt,
      createdBy: member.id,
      now
    });

    this.jobsRepo.create({
      kind: "announcement_post",
      payload: {
        announcement_id: id,
        scheduledAt: input.scheduledAt
      },
      fireAt: input.scheduledAt,
      now
    });

    const created = this.announcementsRepo.get(id);
    if (!created) {
      throw new Error("告知文の保存後読み込みに失敗しました。");
    }
    return created;
  }

  cancel(member: GuildMember, announcementId: number): AnnouncementRecord {
    const announcement = this.requireAnnouncement(announcementId);
    const event = this.requireEvent(announcement.thread_id);
    const roles = this.rolesRepo.list(announcement.thread_id);
    this.assertCanRegister(member, event, roles, announcement.created_by);

    if (announcement.posted_at) {
      throw new Error("投稿済みの告知文は取り消せません。");
    }
    if (!announcement.scheduled_at) {
      throw new Error("予約済みの告知文ではありません。");
    }

    this.announcementsRepo.cancelScheduled(announcement.id);
    return this.requireAnnouncement(announcement.id);
  }

  async postFromJob(
    announcementId: number,
    expectedScheduledAt: number | null,
    fallbackChannelId?: string | null
  ): Promise<AnnouncementRecord> {
    const announcement = this.requireAnnouncement(announcementId);
    if (announcement.posted_msg_id) {
      return announcement;
    }
    if (!announcement.scheduled_at) {
      return announcement;
    }
    if (expectedScheduledAt && announcement.scheduled_at !== expectedScheduledAt) {
      return announcement;
    }

    const content = await this.resolveBody(announcement);
    if (!content) {
      throw new Error("告知文の本文が空です。元メッセージまたは予約時の本文を確認してください。");
    }

    const targetChannelId =
      announcement.target_channel_id ??
      fallbackChannelId ??
      this.settingsRepo.require("eventAnnounce", "公式告知チャンネル");
    const targetChannel = await this.assertCanSendTo(targetChannelId);
    const sent = await targetChannel.send({ content });

    const now = unixNow();
    this.announcementsRepo.markPosted(announcement.id, sent.id, now);
    return this.requireAnnouncement(announcement.id);
  }

  private async resolveBody(announcement: AnnouncementRecord): Promise<string> {
    if (announcement.source_channel_id && announcement.source_message_id) {
      const currentBody = await this.fetchSourceBody(
        announcement.source_channel_id,
        announcement.source_message_id
      );
      if (currentBody) {
        return currentBody;
      }
    }
    return announcement.body.trim();
  }

  private async fetchSourceBody(channelId: string, messageId: string): Promise<string | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !("messages" in channel)) {
        return null;
      }
      const message = await channel.messages.fetch(messageId);
      return message.content.trim() || null;
    } catch {
      return null;
    }
  }

  private async assertCanSendTo(channelId: string) {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !("send" in channel)) {
      throw new Error("投稿先はテキストチャンネルを選んでください。");
    }
    return channel;
  }

  private requireEvent(threadId: string): EventRecord {
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("イベントが DB に見つかりません。");
    }
    return event;
  }

  private requireAnnouncement(announcementId: number): AnnouncementRecord {
    const announcement = this.announcementsRepo.get(announcementId);
    if (!announcement) {
      throw new Error("告知文が DB に見つかりません。");
    }
    return announcement;
  }

  private assertCanRegister(
    member: GuildMember,
    _event: EventRecord,
    roles: EventRoleRecord[],
    sourceAuthorId: string
  ): void {
    if (member.id === sourceAuthorId || isEventLead(member, this.settingsRepo)) {
      return;
    }

    const isMain = roles.some(
      (role) => (role.role_kind === "main" || role.role_type === "main") && role.user_id === member.id
    );
    if (!isMain) {
      throw new AnnouncementPermissionError("告知文の予約は、投稿者本人・主担当・イベント統括のみ可能です。");
    }
  }
}

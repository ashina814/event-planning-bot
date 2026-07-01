import { type Client, type GuildMember } from "discord.js";
import type { AnnouncementsRepo } from "../../db/repos/announcements.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { isEventLead } from "../../lib/permission.js";
import { jstDateTimeToUnix, unixNow } from "../../lib/time.js";
import type { AnnouncementRecord, EventRecord, EventRoleRecord } from "../../types/index.js";

export class AnnouncementPermissionError extends Error {
  override name = "AnnouncementPermissionError";
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

  createDraft(member: GuildMember, threadId: string, body: string): AnnouncementRecord {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanEdit(member, event, roles);

    const trimmed = body.trim();
    if (!trimmed) {
      throw new Error("告知文の本文が空です。");
    }

    const now = unixNow();
    const id = this.announcementsRepo.create({
      threadId,
      body: trimmed,
      createdBy: member.id,
      now
    });

    const created = this.announcementsRepo.get(id);
    if (!created) {
      throw new Error("告知文の保存後読み込みに失敗しました。");
    }
    return created;
  }

  async postNow(member: GuildMember, announcementId: number): Promise<AnnouncementRecord> {
    this.assertCanPost(member);
    return this.postAnnouncement(announcementId);
  }

  schedule(member: GuildMember, announcementId: number, input: string): AnnouncementRecord {
    this.assertCanPost(member);
    const announcement = this.requireAnnouncement(announcementId);
    const fireAt = jstDateTimeToUnix(input);
    const now = unixNow();

    if (fireAt <= now) {
      throw new Error("予約日時は現在より後にしてください。");
    }

    this.announcementsRepo.markScheduled(announcement.id, fireAt);
    this.jobsRepo.create({
      kind: "announcement_post",
      payload: {
        announcementId: announcement.id,
        channelId: this.settingsRepo.require("eventAnnounce", "公式告知チャンネル"),
        scheduledAt: fireAt
      },
      fireAt,
      now
    });

    return this.requireAnnouncement(announcement.id);
  }

  async postFromJob(
    announcementId: number,
    channelId: string,
    expectedScheduledAt: number | null
  ): Promise<AnnouncementRecord> {
    const announcement = this.requireAnnouncement(announcementId);
    if (
      expectedScheduledAt &&
      announcement.scheduled_at &&
      announcement.scheduled_at !== expectedScheduledAt
    ) {
      return announcement;
    }

    return this.postAnnouncement(announcementId, channelId);
  }

  private async postAnnouncement(
    announcementId: number,
    channelId?: string
  ): Promise<AnnouncementRecord> {
    const announcement = this.requireAnnouncement(announcementId);
    if (announcement.posted_msg_id) {
      return announcement;
    }

    const targetChannelId = channelId ?? this.settingsRepo.require("eventAnnounce", "公式告知チャンネル");
    if (!targetChannelId) {
      throw new Error("公式告知チャンネルが未設定です。/admin の管理パネルで設定してください。");
    }

    const channel = await this.client.channels.fetch(targetChannelId);
    if (!channel || !("send" in channel)) {
      throw new Error("公式告知チャンネルはテキストチャンネル ID を指定してください。");
    }

    const sent = await channel.send({ content: announcement.body });
    const now = unixNow();
    this.announcementsRepo.markPosted(announcement.id, sent.id, now);
    return this.requireAnnouncement(announcement.id);
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

  private assertCanEdit(
    member: GuildMember,
    _event: EventRecord,
    roles: EventRoleRecord[]
  ): void {
    if (isEventLead(member, this.settingsRepo)) {
      return;
    }

    const canEdit = roles.some(
      (role) =>
        (role.role_type === "main" || role.role_type === "announce") &&
        role.user_id === member.id
    );
    if (!canEdit) {
      throw new AnnouncementPermissionError("告知文の作成は主担当・告知担当・イベント統括のみ可能です。");
    }
  }

  private assertCanPost(member: GuildMember): void {
    if (!isEventLead(member, this.settingsRepo)) {
      throw new AnnouncementPermissionError("公式告知チャンネルへの転送・予約はイベント統括のみ可能です。");
    }
  }
}

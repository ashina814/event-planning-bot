import type { Client, GuildMember } from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SeriesRepo } from "../../db/repos/series.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import {
  assertCanAssignRole,
  assertCanHandover
} from "../../lib/permission.js";
import { normalizeOptionalText } from "../../lib/parser.js";
import { unixNow } from "../../lib/time.js";
import type { RoleType } from "../../types/index.js";
import { roleLabels } from "../../ui/labels.js";
import { syncEventArtifacts } from "../event-lifecycle/sync.js";

export class EventRolesService {
  constructor(
    private readonly client: Client,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly seriesRepo: SeriesRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  async assignRole(
    member: GuildMember,
    threadId: string,
    roleType: RoleType,
    userId: string
  ): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanAssignRole(member, event, roles, roleType, this.settingsRepo);

    const now = unixNow();
    this.rolesRepo.replaceSingle(threadId, roleType, userId, now);
    await this.postToThread(
      threadId,
      `<@${userId}> が **${roleLabels[roleType]}** になりました。`
    );
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
  }

  async handover(
    member: GuildMember,
    threadId: string,
    roleType: RoleType,
    newUserId: string,
    pendingTasks: string,
    reason: string
  ): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanHandover(member, event, roles, roleType, this.settingsRepo);

    const current = this.rolesRepo.getFirst(threadId, roleType);
    const fromUser = current?.user_id ?? member.id;
    const now = unixNow();

    this.rolesRepo.replaceSingle(threadId, roleType, newUserId, now);
    const declared = await this.postToThread(
      threadId,
      [
        `🤝 **引き継ぎ宣言: ${roleLabels[roleType]}**`,
        "",
        `<@${fromUser}> から <@${newUserId}> に引き継ぎます。`,
        `残タスク: ${pendingTasks}`,
        normalizeOptionalText(reason) ? `理由: ${reason.trim()}` : null
      ]
        .filter(Boolean)
        .join("\n")
    );

    this.rolesRepo.insertHandover({
      threadId,
      roleType,
      fromUser,
      toUser: newUserId,
      reason: normalizeOptionalText(reason),
      pendingTasks: normalizeOptionalText(pendingTasks),
      declaredMsgId: declared?.id ?? null,
      now
    });

    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
  }

  private requireEvent(threadId: string) {
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("イベントが DB に見つかりません。");
    }
    return event;
  }

  private async postToThread(threadId: string, content: string): Promise<{ id: string } | null> {
    const channel = (await this.client.channels.fetch(threadId)) as any;
    if (!channel?.send) {
      return null;
    }
    return channel.send({ content });
  }
}

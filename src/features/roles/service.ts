import type { Client, GuildMember } from "discord.js";
import { parseRoleKey, roleLabel } from "../../db/repos/roles.js";
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
    roleKey: string,
    userId: string
  ): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    const identity = parseRoleKey(roleKey);
    assertCanAssignRole(member, event, roles, identity.roleType, this.settingsRepo);

    const now = unixNow();
    this.rolesRepo.replaceSingle(threadId, roleKey, userId, now);
    await this.postToThread(
      threadId,
      `<@${userId}> が **${identity.roleLabel ?? "主担当"}** になりました。`
    );
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
  }

  async bulkAssignRoles(
    member: GuildMember,
    threadId: string,
    assignments: Array<{ roleKey: string; userId: string }>
  ): Promise<string> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    const cleaned = assignments.filter((assignment) => assignment.userId);
    if (cleaned.length === 0) {
      throw new Error("設定する担当を1つ以上選んでください。");
    }

    for (const assignment of cleaned) {
      const identity = parseRoleKey(assignment.roleKey);
      assertCanAssignRole(member, event, roles, identity.roleType, this.settingsRepo);
    }

    const now = unixNow();
    for (const assignment of cleaned) {
      this.rolesRepo.replaceSingle(threadId, assignment.roleKey, assignment.userId, now);
    }

    const summary = cleaned
      .map((assignment) => {
        const identity = parseRoleKey(assignment.roleKey);
        return `${identity.roleLabel ?? "主担当"} <@${assignment.userId}>`;
      })
      .join(" / ");

    await this.postToThread(threadId, `担当を更新しました: ${summary}`);
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
    return summary;
  }

  async deleteRole(member: GuildMember, threadId: string, roleKey: string): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    assertCanAssignRole(member, event, roles, roleKey, this.settingsRepo);
    this.rolesRepo.deleteRole(threadId, roleKey);
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
  }

  async handover(
    member: GuildMember,
    threadId: string,
    roleKey: string,
    newUserId: string,
    pendingTasks: string,
    reason: string
  ): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    const identity = parseRoleKey(roleKey);
    assertCanHandover(member, event, roles, identity.roleType, this.settingsRepo);

    const current = this.rolesRepo.getByKey(threadId, roleKey);
    const fromUser = current?.user_id ?? member.id;
    const now = unixNow();
    const label = current ? roleLabel(current) : identity.roleLabel ?? "主担当";

    this.rolesRepo.replaceSingle(threadId, roleKey, newUserId, now);
    const declared = await this.postToThread(
      threadId,
      [
        `🤝 **引き継ぎ宣言: ${label}**`,
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
      roleType: identity.roleType,
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
      throw new Error("イベントが見つかりませんでした");
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

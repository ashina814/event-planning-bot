import type { ActionRowBuilder, ButtonBuilder, Client, GuildMember } from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import { parseRoleKey, roleLabel } from "../../db/repos/roles.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SeriesRepo } from "../../db/repos/series.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { logAudit } from "../../lib/audit.js";
import {
  assertCanAssignRole,
  assertCanHandover
} from "../../lib/permission.js";
import { normalizeOptionalText } from "../../lib/parser.js";
import { unixNow } from "../../lib/time.js";
import { buildRoleConfirmationComponents } from "../../ui/buttons.js";
import { syncEventArtifacts } from "../event-lifecycle/sync.js";

export class EventRolesService {
  constructor(
    private readonly client: Client,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly seriesRepo: SeriesRepo,
    private readonly jobsRepo: JobsRepo,
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
    const before = this.rolesRepo.getByKey(threadId, roleKey);
    this.rolesRepo.replaceSingle(threadId, roleKey, userId, now);
    const after = this.rolesRepo.getByKey(threadId, roleKey);
    logAudit({
      actorId: member.id,
      action: "role.assign",
      targetType: "event_role",
      targetId: threadId,
      before,
      after
    });

    const label = identity.roleLabel ?? "主担当";
    await this.postToThread(
      threadId,
      `<@${userId}> が **${label}** になりました。確認してください。`,
      buildRoleConfirmationComponents(threadId, [{ roleKey, label, userId }])
    );
    this.scheduleConfirmReminder(threadId, roleKey, userId, now);
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
      const before = this.rolesRepo.getByKey(threadId, assignment.roleKey);
      this.rolesRepo.replaceSingle(threadId, assignment.roleKey, assignment.userId, now);
      const after = this.rolesRepo.getByKey(threadId, assignment.roleKey);
      logAudit({
        actorId: member.id,
        action: "role.assign",
        targetType: "event_role",
        targetId: threadId,
        before,
        after
      });
      this.scheduleConfirmReminder(threadId, assignment.roleKey, assignment.userId, now);
    }

    const confirmationAssignments = cleaned.map((assignment) => {
      const identity = parseRoleKey(assignment.roleKey);
      return {
        roleKey: assignment.roleKey,
        label: identity.roleLabel ?? "主担当",
        userId: assignment.userId
      };
    });
    const summary = confirmationAssignments
      .map((assignment) => `${assignment.label} <@${assignment.userId}>`)
      .join(" / ");

    await this.postConfirmationBatches(
      threadId,
      confirmationAssignments,
      `担当を更新しました: ${summary}\n担当になった人は確認ボタンを押してください。`,
    );
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
    return summary;
  }

  async deleteRole(member: GuildMember, threadId: string, roleKey: string): Promise<void> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    const identity = parseRoleKey(roleKey);
    assertCanAssignRole(member, event, roles, identity.roleType, this.settingsRepo);
    const before = this.rolesRepo.getByKey(threadId, roleKey);
    this.rolesRepo.deleteRole(threadId, roleKey);
    logAudit({
      actorId: member.id,
      action: "role.remove",
      targetType: "event_role",
      targetId: threadId,
      before
    });
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
    const after = this.rolesRepo.getByKey(threadId, roleKey);
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
        .join("\n"),
      buildRoleConfirmationComponents(threadId, [{ roleKey, label, userId: newUserId }])
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
    logAudit({
      actorId: member.id,
      action: "role.handover",
      targetType: "event_role",
      targetId: threadId,
      before: current,
      after
    });
    this.scheduleConfirmReminder(threadId, roleKey, newUserId, now);

    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
  }

  async confirmRole(member: GuildMember, threadId: string, roleKey: string) {
    const role = this.rolesRepo.getByKey(threadId, roleKey);
    if (!role) {
      throw new Error("担当が見つかりませんでした。");
    }
    if (role.user_id !== member.id) {
      throw new Error("この確認ボタンは担当本人のみ押せます。");
    }
    const updated = this.rolesRepo.confirmRole(threadId, roleKey, member.id, unixNow());
    await syncEventArtifacts(this.client, this.eventsRepo, this.rolesRepo, this.seriesRepo, threadId);
    return updated ?? role;
  }

  async handleConfirmReminder(threadId: string, roleKey: string, userId: string): Promise<void> {
    const event = this.eventsRepo.get(threadId);
    if (!event || event.status === "done" || event.status === "cancelled") {
      return;
    }
    const role = this.rolesRepo.getByKey(threadId, roleKey);
    if (!role || role.user_id !== userId || role.confirmed_at) {
      return;
    }
    await this.postToThread(
      threadId,
      `<@${userId}> 担当「${roleLabel(role)}」がまだ未確認です。確認ボタンを押してください。`,
      buildRoleConfirmationComponents(threadId, [{ roleKey, label: roleLabel(role), userId }])
    );
  }

  private async postConfirmationBatches(
    threadId: string,
    assignments: Array<{ roleKey: string; label: string; userId: string }>,
    firstContent: string
  ): Promise<void> {
    for (let index = 0; index < assignments.length; index += 25) {
      const chunk = assignments.slice(index, index + 25);
      await this.postToThread(
        threadId,
        index === 0 ? firstContent : "担当確認の続きです。担当になった人は確認ボタンを押してください。",
        buildRoleConfirmationComponents(threadId, chunk)
      );
    }
  }

  private requireEvent(threadId: string) {
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("イベントが見つかりませんでした");
    }
    return event;
  }

  private scheduleConfirmReminder(threadId: string, roleKey: string, userId: string, now: number): void {
    this.jobsRepo.create({
      kind: "role_confirm_reminder",
      payload: { threadId, roleKey, userId },
      threadId,
      fireAt: now + 48 * 60 * 60,
      now
    });
  }

  private async postToThread(
    threadId: string,
    content: string,
    components: ActionRowBuilder<ButtonBuilder>[] = []
  ): Promise<{ id: string } | null> {
    const channel = (await this.client.channels.fetch(threadId)) as any;
    if (!channel?.send) {
      return null;
    }
    return channel.send({ content, components });
  }
}

import type { ChatInputCommandInteraction, GuildMember, Interaction } from "discord.js";
import type { SettingsRepo } from "../db/repos/settings.js";
import type { EventRecord, EventRoleRecord } from "../types/index.js";

export class PermissionError extends Error {
  override name = "PermissionError";
}

export async function fetchGuildMember(
  interaction: Interaction | ChatInputCommandInteraction
): Promise<GuildMember> {
  if (!interaction.guild) {
    throw new PermissionError("サーバー内でのみ使える操作です。");
  }

  return interaction.guild.members.fetch(interaction.user.id);
}

export function memberHasRole(member: GuildMember, roleId: string): boolean {
  return member.roles.cache.has(roleId);
}

export function isOwner(userId: string, ownerId: string): boolean {
  return userId === ownerId;
}

export function isEventLead(member: GuildMember, settingsRepo: SettingsRepo): boolean {
  const roleId = settingsRepo.get("eventLeadRole");
  return Boolean(roleId && memberHasRole(member, roleId));
}

export function isEventer(member: GuildMember, settingsRepo: SettingsRepo): boolean {
  const roleId = settingsRepo.get("eventerRole");
  return isEventLead(member, settingsRepo) || Boolean(roleId && memberHasRole(member, roleId));
}

export function assertCanCreateEvent(member: GuildMember, settingsRepo: SettingsRepo): void {
  if (!isEventer(member, settingsRepo)) {
    throw new PermissionError("イベント統括またはイベンターのみ作成できます。");
  }
}

export function assertCanManageEvent(
  member: GuildMember,
  event: EventRecord,
  roles: EventRoleRecord[],
  settingsRepo: SettingsRepo
): void {
  if (isEventLead(member, settingsRepo)) {
    return;
  }

  const isMain = roles.some(
    (role) => (role.role_kind === "main" || role.role_type === "main") && role.user_id === member.id
  );
  if (!isMain) {
    throw new PermissionError(
      `この操作は主担当またはイベント統括のみ可能です。対象: ${event.title}`
    );
  }
}

export function assertCanAssignRole(
  member: GuildMember,
  event: EventRecord,
  roles: EventRoleRecord[],
  roleType: string,
  settingsRepo: SettingsRepo
): void {
  if (roleType === "main") {
    if (!isEventLead(member, settingsRepo)) {
      throw new PermissionError("主担当の設定はイベント統括のみ可能です。");
    }
    return;
  }

  assertCanManageEvent(member, event, roles, settingsRepo);
}

export function assertCanHandover(
  member: GuildMember,
  event: EventRecord,
  roles: EventRoleRecord[],
  roleType: string,
  settingsRepo: SettingsRepo
): void {
  if (isEventLead(member, settingsRepo)) {
    return;
  }

  const ownsRole = roles.some((role) => role.role_type === roleType && role.user_id === member.id);
  if (ownsRole) {
    return;
  }

  assertCanManageEvent(member, event, roles, settingsRepo);
}

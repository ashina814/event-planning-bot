import type { ChatInputCommandInteraction, GuildMember, Interaction } from "discord.js";
import { config } from "../config.js";
import type { EventRecord, EventRoleRecord, RoleType } from "../types/index.js";

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

export function isEventLead(member: GuildMember): boolean {
  return memberHasRole(member, config.roles.eventLead);
}

export function isEventer(member: GuildMember): boolean {
  return isEventLead(member) || memberHasRole(member, config.roles.eventer);
}

export function assertCanCreateEvent(member: GuildMember): void {
  if (!isEventer(member)) {
    throw new PermissionError("イベント統括またはイベンターのみ作成できます。");
  }
}

export function assertCanManageEvent(
  member: GuildMember,
  event: EventRecord,
  roles: EventRoleRecord[]
): void {
  if (isEventLead(member)) {
    return;
  }

  const isMain = roles.some(
    (role) => role.role_type === "main" && role.user_id === member.id
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
  roleType: RoleType
): void {
  if (roleType === "main") {
    if (!isEventLead(member)) {
      throw new PermissionError("主担当の設定はイベント統括のみ可能です。");
    }
    return;
  }

  assertCanManageEvent(member, event, roles);
}

export function assertCanHandover(
  member: GuildMember,
  event: EventRecord,
  roles: EventRoleRecord[],
  roleType: RoleType
): void {
  if (isEventLead(member)) {
    return;
  }

  const ownsRole = roles.some((role) => role.role_type === roleType && role.user_id === member.id);
  if (ownsRole) {
    return;
  }

  assertCanManageEvent(member, event, roles);
}

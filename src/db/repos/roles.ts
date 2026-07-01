import type Database from "better-sqlite3";
import { Buffer } from "node:buffer";
import type { EventRoleRecord, RoleKind, RoleSlot, SeriesDefaultRoleRecord } from "../../types/index.js";

interface HandoverInput {
  threadId: string;
  roleType: string;
  fromUser: string | null;
  toUser: string;
  reason: string | null;
  pendingTasks: string | null;
  declaredMsgId: string | null;
  now: number;
}

interface RoleIdentity {
  roleType: string;
  roleKind: RoleKind;
  roleLabel: string | null;
  ord: number | null;
}

const legacyCustomRoleLabels: Record<string, { label: string; ord: number }> = {
  mc: { label: "司会・進行", ord: 10 },
  announce: { label: "告知担当", ord: 20 },
  record: { label: "集計・記録担当", ord: 30 },
  prize: { label: "賞金・景品対応", ord: 40 },
  support: { label: "サポート", ord: 50 }
};

export const mainRoleKey = "main";
const customRolePrefix = "custom_";

export function normalizeRoleLabel(label: string): string {
  return label.replace(/\s+/g, " ").trim().slice(0, 15);
}

export function customRoleKey(label: string): string {
  const normalized = normalizeRoleLabel(label);
  return `${customRolePrefix}${Buffer.from(normalized, "utf8").toString("base64url")}`;
}

export function parseRoleKey(roleKey: string): RoleIdentity {
  if (roleKey === mainRoleKey) {
    return { roleType: mainRoleKey, roleKind: "main", roleLabel: null, ord: 0 };
  }

  if (roleKey.startsWith(customRolePrefix)) {
    const encoded = roleKey.slice(customRolePrefix.length);
    const label = normalizeRoleLabel(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!label) {
      throw new Error("役割名が空です");
    }
    return { roleType: roleKey, roleKind: "custom", roleLabel: label, ord: null };
  }

  const legacy = legacyCustomRoleLabels[roleKey];
  if (legacy) {
    return { roleType: roleKey, roleKind: "custom", roleLabel: legacy.label, ord: legacy.ord };
  }

  return { roleType: roleKey, roleKind: "custom", roleLabel: normalizeRoleLabel(roleKey), ord: null };
}

export function roleLabel(role: Pick<EventRoleRecord | RoleSlot, "role_kind" | "role_label" | "role_type">): string {
  if (role.role_kind === "main" || role.role_type === mainRoleKey) {
    return "主担当";
  }
  return role.role_label ?? legacyCustomRoleLabels[role.role_type]?.label ?? role.role_type;
}

export function roleKeyFor(role: Pick<EventRoleRecord | RoleSlot, "role_kind" | "role_label" | "role_type">): string {
  if (role.role_kind === "main" || role.role_type === mainRoleKey) {
    return mainRoleKey;
  }
  return role.role_type || customRoleKey(roleLabel(role));
}

function emptySlot(identity: RoleIdentity, ord: number): RoleSlot {
  return {
    role_type: identity.roleType,
    role_kind: identity.roleKind,
    role_label: identity.roleLabel,
    ord,
    user_id: null,
    assigned_at: null
  };
}

function toSlot(role: EventRoleRecord): RoleSlot {
  return {
    role_type: role.role_type,
    role_kind: role.role_kind,
    role_label: role.role_label,
    ord: role.ord,
    user_id: role.user_id,
    assigned_at: role.assigned_at
  };
}

export class RolesRepo {
  constructor(private readonly db: Database.Database) {}

  list(threadId: string): EventRoleRecord[] {
    return this.db
      .prepare("SELECT * FROM event_roles WHERE thread_id = ? ORDER BY ord, role_type, assigned_at")
      .all(threadId) as EventRoleRecord[];
  }

  listSlots(threadId: string, seriesId: number | null = null): RoleSlot[] {
    const assigned = this.list(threadId);
    const slots: RoleSlot[] = [];
    const usedRoleTypes = new Set<string>();

    const main = assigned.find((role) => role.role_kind === "main" || role.role_type === mainRoleKey);
    slots.push(main ? toSlot(main) : emptySlot(parseRoleKey(mainRoleKey), 0));
    if (main) {
      usedRoleTypes.add(main.role_type);
    }

    if (seriesId) {
      const defaults = this.db
        .prepare("SELECT * FROM series_default_roles WHERE series_id = ? ORDER BY ord ASC")
        .all(seriesId) as SeriesDefaultRoleRecord[];

      for (const defaultRole of defaults) {
        const label = normalizeRoleLabel(defaultRole.role_label);
        const assignedRole = assigned.find(
          (role) => role.role_kind === "custom" && roleLabel(role) === label && !usedRoleTypes.has(role.role_type)
        );
        if (assignedRole) {
          slots.push(toSlot({ ...assignedRole, ord: defaultRole.ord }));
          usedRoleTypes.add(assignedRole.role_type);
          continue;
        }
        slots.push(emptySlot(parseRoleKey(customRoleKey(label)), defaultRole.ord));
      }
    }

    for (const role of assigned) {
      if (usedRoleTypes.has(role.role_type)) {
        continue;
      }
      if (role.role_kind === "main" || role.role_type === mainRoleKey) {
        continue;
      }
      slots.push(toSlot(role));
      usedRoleTypes.add(role.role_type);
    }

    return slots.sort((a, b) => a.ord - b.ord || roleLabel(a).localeCompare(roleLabel(b), "ja"));
  }

  getFirst(threadId: string, roleType: string): EventRoleRecord | null {
    return (
      this.db
        .prepare(
          `SELECT * FROM event_roles
           WHERE thread_id = ?
             AND (role_type = ? OR (? = 'main' AND role_kind = 'main'))
           ORDER BY assigned_at DESC
           LIMIT 1`
        )
        .get(threadId, roleType, roleType) as EventRoleRecord | undefined
    ) ?? null;
  }

  getByKey(threadId: string, roleKey: string): EventRoleRecord | null {
    const identity = parseRoleKey(roleKey);
    return this.getFirst(threadId, identity.roleType);
  }

  replaceSingle(threadId: string, roleKey: string, userId: string, now: number): void {
    const identity = parseRoleKey(roleKey);
    const existing = this.getFirst(threadId, identity.roleType);
    const ord = identity.ord ?? existing?.ord ?? this.nextCustomOrder(threadId);

    const tx = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM event_roles WHERE thread_id = ? AND role_type = ?")
        .run(threadId, identity.roleType);
      this.db
        .prepare(
          `INSERT INTO event_roles (
            thread_id, role_type, role_kind, role_label, ord, user_id, assigned_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          threadId,
          identity.roleType,
          identity.roleKind,
          identity.roleLabel,
          ord,
          userId,
          now
        );
    });

    tx();
  }

  deleteRole(threadId: string, roleKey: string): void {
    const identity = parseRoleKey(roleKey);
    if (identity.roleKind === "main") {
      throw new Error("主担当は削除できません");
    }
    this.db
      .prepare("DELETE FROM event_roles WHERE thread_id = ? AND role_type = ?")
      .run(threadId, identity.roleType);
  }

  insertHandover(input: HandoverInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO handover_log (
          thread_id, role_type, from_user, to_user, reason, pending_tasks,
          declared_msg_id, ts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.threadId,
        input.roleType,
        input.fromUser,
        input.toUser,
        input.reason,
        input.pendingTasks,
        input.declaredMsgId,
        input.now
      );

    return Number(result.lastInsertRowid);
  }

  countAssignmentsBetween(startAt: number, endAt: number, limit = 10): Array<{ user_id: string; count: number }> {
    return this.db
      .prepare(
        `SELECT event_roles.user_id, COUNT(*) AS count
         FROM event_roles
         INNER JOIN events ON events.thread_id = event_roles.thread_id
         WHERE COALESCE(events.scheduled_at, events.created_at) >= ?
           AND COALESCE(events.scheduled_at, events.created_at) < ?
         GROUP BY event_roles.user_id
         ORDER BY count DESC, event_roles.user_id ASC
         LIMIT ?`
      )
      .all(startAt, endAt, limit) as Array<{ user_id: string; count: number }>;
  }

  private nextCustomOrder(threadId: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(MAX(ord), 0) AS maxOrd FROM event_roles WHERE thread_id = ?")
      .get(threadId) as { maxOrd: number };
    return Math.max(10, row.maxOrd + 10);
  }
}

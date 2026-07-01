import type Database from "better-sqlite3";
import type { EventRoleRecord, RoleType } from "../../types/index.js";

interface HandoverInput {
  threadId: string;
  roleType: RoleType;
  fromUser: string | null;
  toUser: string;
  reason: string | null;
  pendingTasks: string | null;
  declaredMsgId: string | null;
  now: number;
}

export class RolesRepo {
  constructor(private readonly db: Database.Database) {}

  list(threadId: string): EventRoleRecord[] {
    return this.db
      .prepare("SELECT * FROM event_roles WHERE thread_id = ? ORDER BY role_type, assigned_at")
      .all(threadId) as EventRoleRecord[];
  }

  getFirst(threadId: string, roleType: RoleType): EventRoleRecord | null {
    return (
      this.db
        .prepare("SELECT * FROM event_roles WHERE thread_id = ? AND role_type = ? ORDER BY assigned_at DESC LIMIT 1")
        .get(threadId, roleType) as EventRoleRecord | undefined
    ) ?? null;
  }

  replaceSingle(threadId: string, roleType: RoleType, userId: string, now: number): void {
    const tx = this.db.transaction(() => {
      this.db
        .prepare("DELETE FROM event_roles WHERE thread_id = ? AND role_type = ?")
        .run(threadId, roleType);
      this.db
        .prepare(
          `INSERT INTO event_roles (thread_id, role_type, user_id, assigned_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(threadId, roleType, userId, now);
    });

    tx();
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
}

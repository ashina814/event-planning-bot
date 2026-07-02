import type Database from "better-sqlite3";
import { roleLabel } from "../../db/repos/roles.js";
import { monthBounds } from "../overview/calendar.js";
import { unixNow } from "../../lib/time.js";

export interface EvaluationMaterial {
  roleCounts: Record<string, number>;
  mainCount: number;
  todoDone: number;
  todoOverdue: number;
  confirmRate: number | null;
  confirmAssigned: number;
  confirmDone: number;
  retroSubmitted: boolean;
  handoverCount: number;
  lastActiveAt: number | null;
}

export class EvaluationService {
  constructor(private readonly db: Database.Database) {}

  buildEvaluationMaterial(userId: string, monthKey: string): EvaluationMaterial {
    const bounds = monthBounds(monthKey);
    const roleRows = this.db
      .prepare(
        `SELECT role_label, COUNT(*) AS count
         FROM earnings
         WHERE user_id = ?
           AND month_key = ?
           AND source = 'event_role'
           AND voided = 0
         GROUP BY role_label
         ORDER BY count DESC, role_label ASC`
      )
      .all(userId, monthKey) as Array<{ role_label: string; count: number }>;
    const roleCounts = Object.fromEntries(roleRows.map((row) => [row.role_label, row.count]));

    const todoDone = this.scalar(
      `SELECT COUNT(*) AS count
       FROM todos
       WHERE assignee = ?
         AND status = 'done'
         AND done_at >= ?
         AND done_at < ?`,
      userId,
      bounds.startAt,
      bounds.endAt
    );
    const todoOverdue = this.scalar(
      `SELECT COUNT(*) AS count
       FROM todos
       WHERE assignee = ?
         AND due_at >= ?
         AND due_at < ?
         AND (
           (status = 'done' AND done_at IS NOT NULL AND done_at > due_at)
           OR (status != 'done' AND due_at < ?)
         )`,
      userId,
      bounds.startAt,
      bounds.endAt,
      unixNow()
    );
    const confirmRows = this.db
      .prepare(
        `SELECT event_roles.role_type, event_roles.role_kind, event_roles.role_label, event_roles.confirmed_at
         FROM event_roles
         INNER JOIN events ON events.thread_id = event_roles.thread_id
         WHERE event_roles.user_id = ?
           AND events.status = 'done'
           AND events.closed_at >= ?
           AND events.closed_at < ?`
      )
      .all(userId, bounds.startAt, bounds.endAt) as Array<{
        role_type: string;
        role_kind: "main" | "custom";
        role_label: string | null;
        confirmed_at: number | null;
      }>;
    const confirmAssigned = confirmRows.length;
    const confirmDone = confirmRows.filter((row) => row.confirmed_at !== null).length;
    const handoverCount = this.scalar(
      `SELECT COUNT(*) AS count
       FROM handover_log
       WHERE to_user = ? AND ts >= ? AND ts < ?`,
      userId,
      bounds.startAt,
      bounds.endAt
    );
    const activeCandidates = [
      this.maxScalar(
        `SELECT MAX(ts) AS value
         FROM audit_log
         WHERE actor_id = ? AND ts >= ? AND ts < ?`,
        userId,
        bounds.startAt,
        bounds.endAt
      ),
      this.maxScalar(
        `SELECT MAX(done_at) AS value
         FROM todos
         WHERE assignee = ? AND done_at >= ? AND done_at < ?`,
        userId,
        bounds.startAt,
        bounds.endAt
      ),
      this.maxScalar(
        `SELECT MAX(confirmed_at) AS value
         FROM event_roles
         WHERE user_id = ? AND confirmed_at >= ? AND confirmed_at < ?`,
        userId,
        bounds.startAt,
        bounds.endAt
      )
    ].filter((value): value is number => value !== null);

    for (const row of confirmRows) {
      const label = roleLabel(row);
      roleCounts[label] = roleCounts[label] ?? 0;
    }

    const retroSubmitted = Boolean(
      this.db
        .prepare(
          "SELECT 1 AS found FROM self_reviews WHERE user_id = ? AND month_key = ? AND submitted_at IS NOT NULL"
        )
        .get(userId, monthKey)
    );

    return {
      roleCounts,
      mainCount: roleCounts["主担当"] ?? 0,
      todoDone,
      todoOverdue,
      confirmRate: confirmAssigned > 0 ? confirmDone / confirmAssigned : null,
      confirmAssigned,
      confirmDone,
      retroSubmitted,
      handoverCount,
      lastActiveAt: activeCandidates.length > 0 ? Math.max(...activeCandidates) : null
    };
  }

  private scalar(sql: string, ...params: unknown[]): number {
    const row = this.db.prepare(sql).get(...params) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  private maxScalar(sql: string, ...params: unknown[]): number | null {
    const row = this.db.prepare(sql).get(...params) as { value: number | null } | undefined;
    return row?.value ?? null;
  }
}

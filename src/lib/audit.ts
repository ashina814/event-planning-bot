import { getDb } from "../db/connection.js";
import { unixNow } from "./time.js";

export interface AuditEntryInput {
  actorId: string;
  action: string;
  targetType: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
}

export interface AuditLogRecord {
  id: number;
  actor_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  before_json: string | null;
  after_json: string | null;
  ts: number;
}

function toJson(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

export function logAudit(entry: AuditEntryInput): void {
  getDb()
    .prepare(
      `INSERT INTO audit_log (
        actor_id, action, target_type, target_id, before_json, after_json, ts
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      entry.actorId,
      entry.action,
      entry.targetType,
      entry.targetId ?? null,
      toJson(entry.before),
      toJson(entry.after),
      unixNow()
    );
}

export function listAuditLog(page = 0, pageSize = 20): AuditLogRecord[] {
  const safePage = Math.max(0, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 50);
  return getDb()
    .prepare(
      `SELECT * FROM audit_log
       ORDER BY ts DESC, id DESC
       LIMIT ? OFFSET ?`
    )
    .all(safePageSize, safePage * safePageSize) as AuditLogRecord[];
}

import type Database from "better-sqlite3";
import type { TodoRecord } from "../../types/index.js";

interface CreateTodoInput {
  threadId: string | null;
  content: string;
  assignee: string | null;
  dueAt: number | null;
  createdBy: string;
  source: string | null;
  sourceMsgId: string | null;
  now: number;
}

interface AdoptMinutesCandidateInput {
  threadId: string;
  content: string;
  assignee: string | null;
  dueAt: number | null;
  adoptedBy: string;
}

export class TodosRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateTodoInput): number {
    const result = this.db
      .prepare(
        `INSERT INTO todos (
          thread_id, content, assignee, due_at, status, created_by,
          created_at, done_at, source, source_msg_id
        ) VALUES (?, ?, ?, ?, 'open', ?, ?, NULL, ?, ?)`
      )
      .run(
        input.threadId,
        input.content,
        input.assignee,
        input.dueAt,
        input.createdBy,
        input.now,
        input.source,
        input.sourceMsgId
      );

    return Number(result.lastInsertRowid);
  }

  get(id: number): TodoRecord | null {
    return (
      this.db.prepare("SELECT * FROM todos WHERE id = ?").get(id) as TodoRecord | undefined
    ) ?? null;
  }

  listByThread(threadId: string): TodoRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM todos
         WHERE thread_id = ?
         ORDER BY status = 'open' DESC, COALESCE(due_at, 9999999999) ASC, created_at DESC`
      )
      .all(threadId) as TodoRecord[];
  }

  listPendingMinutesBySource(sourceMsgId: string): TodoRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM todos
         WHERE source = 'minutes'
           AND source_msg_id = ?
           AND thread_id IS NULL
           AND status = 'open'
         ORDER BY id ASC`
      )
      .all(sourceMsgId) as TodoRecord[];
  }

  adoptMinutesCandidate(id: number, input: AdoptMinutesCandidateInput): void {
    this.db
      .prepare(
        `UPDATE todos
         SET thread_id = ?,
             content = ?,
             assignee = ?,
             due_at = ?,
             created_by = ?
         WHERE id = ?
           AND source = 'minutes'
           AND thread_id IS NULL
           AND status = 'open'`
      )
      .run(input.threadId, input.content, input.assignee, input.dueAt, input.adoptedBy, id);
  }

  setStatus(id: number, status: TodoRecord["status"], now: number): void {
    this.db
      .prepare(
        `UPDATE todos
         SET status = ?, done_at = CASE WHEN ? = 'done' THEN ? ELSE NULL END
         WHERE id = ?`
      )
      .run(status, status, now, id);
  }

  updateContentAndDue(id: number, content: string, dueAt: number | null): void {
    this.db
      .prepare("UPDATE todos SET content = ?, due_at = ? WHERE id = ?")
      .run(content, dueAt, id);
  }

  delete(id: number): void {
    this.db.prepare("DELETE FROM todos WHERE id = ?").run(id);
  }
}

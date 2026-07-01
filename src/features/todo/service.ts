import type { Client, GuildMember, Message } from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import type { TodosRepo } from "../../db/repos/todos.js";
import { isEventLead, isEventer } from "../../lib/permission.js";
import { parseDiscordSnowflake } from "../../lib/parser.js";
import { formatJstDateTime, jstDateTimeToUnix, unixNow } from "../../lib/time.js";
import type { EventRoleRecord, TodoRecord } from "../../types/index.js";
import { buildMinutesTodoNoticeComponents } from "../../ui/buttons.js";
import { extractTodoCandidates } from "./parser.js";

interface CreateTodoInput {
  content: string;
  assignee: string;
  dueDate: string;
}

export class TodoPermissionError extends Error {
  override name = "TodoPermissionError";
}

export class TodoService {
  constructor(
    private readonly client: Client,
    private readonly todosRepo: TodosRepo,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly jobsRepo: JobsRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  list(threadId: string): TodoRecord[] {
    return this.todosRepo.listByThread(threadId);
  }

  create(member: GuildMember, threadId: string, input: CreateTodoInput): TodoRecord {
    this.assertCanAdd(member, threadId);

    const content = input.content.trim();
    if (!content) {
      throw new Error("ToDo の内容が空です。");
    }

    const assignee = input.assignee.trim()
      ? parseDiscordSnowflake(input.assignee, "last")
      : null;
    if (input.assignee.trim() && !assignee) {
      throw new Error("担当者は @ユーザー またはユーザーIDで入力してください。");
    }

    const dueAt = this.parseDueDate(input.dueDate);
    const now = unixNow();
    const id = this.todosRepo.create({
      threadId,
      content,
      assignee,
      dueAt,
      createdBy: member.id,
      source: "manual",
      sourceMsgId: null,
      now
    });

    if (dueAt) {
      this.jobsRepo.create({
        kind: "todo_due_reminder",
        payload: { todoId: id },
        fireAt: dueAt,
        now
      });
    }

    return this.requireTodo(id);
  }

  listMinutesCandidates(member: GuildMember, sourceMsgId: string): TodoRecord[] {
    this.assertCanReviewMinutes(member);
    return this.todosRepo.listPendingMinutesBySource(sourceMsgId);
  }

  getMinutesCandidate(member: GuildMember, todoId: number): TodoRecord {
    this.assertCanReviewMinutes(member);
    return this.requireMinutesCandidate(todoId);
  }

  adoptMinutesCandidate(
    member: GuildMember,
    todoId: number,
    threadId: string,
    input: CreateTodoInput
  ): TodoRecord {
    this.assertCanReviewMinutes(member);
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("紐付け先イベントが DB に見つかりません。");
    }
    if (event.status === "done" || event.status === "cancelled") {
      throw new Error("完了または見送り済みのイベントには採用できません。");
    }

    this.requireMinutesCandidate(todoId);
    const content = input.content.trim();
    if (!content) {
      throw new Error("ToDo の内容が空です。");
    }

    const assignee = input.assignee.trim()
      ? parseDiscordSnowflake(input.assignee, "last")
      : null;
    if (input.assignee.trim() && !assignee) {
      throw new Error("担当者は @ユーザー またはユーザーIDで入力してください。");
    }

    const dueAt = this.parseDueDate(input.dueDate);
    this.todosRepo.adoptMinutesCandidate(todoId, {
      threadId,
      content,
      assignee,
      dueAt,
      adoptedBy: member.id
    });

    if (dueAt) {
      this.jobsRepo.create({
        kind: "todo_due_reminder",
        payload: { todoId },
        fireAt: dueAt,
        now: unixNow()
      });
    }

    return this.requireTodo(todoId);
  }

  discardMinutesCandidate(member: GuildMember, todoId: number): void {
    this.assertCanReviewMinutes(member);
    this.requireMinutesCandidate(todoId);
    this.todosRepo.setStatus(todoId, "cancelled", unixNow());
  }

  setDone(member: GuildMember, todoId: number, done: boolean): TodoRecord {
    const todo = this.requireTodo(todoId);
    this.assertCanTouch(member, todo);
    this.todosRepo.setStatus(todoId, done ? "done" : "open", unixNow());
    return this.requireTodo(todoId);
  }

  delete(member: GuildMember, todoId: number): void {
    const todo = this.requireTodo(todoId);
    if (!isEventLead(member, this.settingsRepo) && todo.created_by !== member.id) {
      throw new TodoPermissionError("ToDo の削除は作成者またはイベント統括のみ可能です。");
    }
    this.todosRepo.delete(todoId);
  }

  async handleDueReminder(todoId: number): Promise<void> {
    const todo = this.todosRepo.get(todoId);
    if (!todo || todo.status !== "open" || !todo.thread_id) {
      return;
    }

    const channel = await this.client.channels.fetch(todo.thread_id);
    if (!channel || !("send" in channel)) {
      throw new Error("ToDo 通知先スレッドが見つかりません。");
    }

    const assignee = todo.assignee ? `<@${todo.assignee}> ` : "";
    await channel.send({
      content: `✅ ${assignee}今日が期限: ${todo.content}`
    });
  }

  async handleMinutesMessage(message: Message): Promise<void> {
    const minutesChannel = this.settingsRepo.get("minutes");
    if (!minutesChannel || message.channelId !== minutesChannel) {
      return;
    }
    if (message.author.bot) {
      return;
    }

    const candidates = extractTodoCandidates(message.content);
    if (candidates.length === 0) {
      return;
    }

    if (!message.guild) {
      return;
    }

    const now = unixNow();
    candidates.forEach((candidate) => {
      this.todosRepo.create({
        threadId: null,
        content: candidate,
        assignee: null,
        dueAt: null,
        createdBy: message.author.id,
        source: "minutes",
        sourceMsgId: message.id,
        now
      });
    });

    const pending = this.todosRepo.listPendingMinutesBySource(message.id);
    const eventLeadRole = this.settingsRepo.get("eventLeadRole");
    const body = [
      `議事録から ToDo 候補を ${pending.length} 件検出しました。`,
      eventLeadRole ? `<@&${eventLeadRole}>` : "イベント統括",
      `元メッセージ: ${message.url}`,
      "",
      ...pending.map((candidate, index) => `${index + 1}. #${candidate.id} ${candidate.content}`)
    ].join("\n");

    const internalAnnounce = this.settingsRepo.get("internalAnnounce");
    if (internalAnnounce) {
      const channel = await this.client.channels.fetch(internalAnnounce);
      if (channel && "send" in channel) {
        await channel.send({
          content: body,
          components: buildMinutesTodoNoticeComponents(message.id)
        });
      }
    }
  }

  private parseDueDate(input: string): number | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return jstDateTimeToUnix(`${trimmed} 09:00`);
    }

    return jstDateTimeToUnix(trimmed);
  }

  private assertCanAdd(member: GuildMember, threadId: string): void {
    if (isEventer(member, this.settingsRepo) || this.isAssigned(member.id, threadId)) {
      return;
    }
    throw new TodoPermissionError("ToDo の追加はイベンターまたは担当者のみ可能です。");
  }

  private assertCanReviewMinutes(member: GuildMember): void {
    if (isEventLead(member, this.settingsRepo)) {
      return;
    }
    throw new TodoPermissionError("議事録 ToDo 候補の振り分けはイベント統括のみ可能です。");
  }

  private assertCanTouch(member: GuildMember, todo: TodoRecord): void {
    if (isEventer(member, this.settingsRepo) || todo.created_by === member.id || todo.assignee === member.id) {
      return;
    }
    throw new TodoPermissionError("この ToDo を操作する権限がありません。");
  }

  private isAssigned(userId: string, threadId: string): boolean {
    const roles: EventRoleRecord[] = this.rolesRepo.list(threadId);
    return roles.some((role) => role.user_id === userId);
  }

  private requireTodo(todoId: number): TodoRecord {
    const todo = this.todosRepo.get(todoId);
    if (!todo) {
      throw new Error("ToDo が DB に見つかりません。");
    }
    return todo;
  }

  private requireMinutesCandidate(todoId: number): TodoRecord {
    const todo = this.requireTodo(todoId);
    if (todo.source !== "minutes" || todo.thread_id !== null || todo.status !== "open") {
      throw new Error("未処理の議事録 ToDo 候補ではありません。");
    }
    return todo;
  }
}

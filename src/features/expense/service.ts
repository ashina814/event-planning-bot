import type { Client, GuildMember, Message } from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { ExpensesRepo } from "../../db/repos/expenses.js";
import type { JobsRepo } from "../../db/repos/jobs.js";
import { roleLabel } from "../../db/repos/roles.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SettingsRepo } from "../../db/repos/settings.js";
import { isEventLead } from "../../lib/permission.js";
import { parseDiscordSnowflake } from "../../lib/parser.js";
import {
  formatJstDate,
  formatJstPlainDate,
  jstDateToUnixAtMidnight,
  parseFlexibleDateTime,
  unixNow
} from "../../lib/time.js";
import type {
  EventRecord,
  EventRoleRecord,
  ExpenseRecord,
  ExpenseThresholdKind
} from "../../types/index.js";
import { parseAmount, parseExpenseCategory, parseExpenseDirection } from "./parser.js";

interface CreateExpenseInput {
  category: string;
  direction: string;
  amount: string;
  recipient: string;
  occurredMemo: string;
}

interface CorrectExpenseInput {
  amount: string;
  recipient: string;
  memo: string;
}

interface CreateExpenseFromProofInput {
  threadId: string | null;
  targetChannelId: string;
  targetMessageId: string;
  category: string;
  direction: string;
  amount: string;
  recipientId: string | null;
  memo: string;
}

export interface ExpensePanel {
  expenses: ExpenseRecord[];
  totalOut: number;
  totalIn: number;
  pendingProofCount: number;
}

export class ExpensePermissionError extends Error {
  override name = "ExpensePermissionError";
}

export class ExpenseService {
  constructor(
    private readonly client: Client,
    private readonly expensesRepo: ExpensesRepo,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly jobsRepo: JobsRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  getPanel(threadId: string): ExpensePanel {
    return {
      expenses: this.expensesRepo.listByThread(threadId),
      totalOut: this.expensesRepo.totalByThread(threadId, "out"),
      totalIn: this.expensesRepo.totalByThread(threadId, "in"),
      pendingProofCount: this.expensesRepo.pendingProofCount(threadId)
    };
  }

  async create(member: GuildMember, threadId: string, input: CreateExpenseInput): Promise<ExpenseRecord> {
    const event = this.requireEvent(threadId);
    const roles = this.rolesRepo.list(threadId);
    this.assertCanRecord(member, roles);

    const category = parseExpenseCategory(input.category);
    const direction = parseExpenseDirection(input.direction);
    const amount = parseAmount(input.amount);
    const recipientId = input.recipient.trim()
      ? parseDiscordSnowflake(input.recipient, "last")
      : null;
    if (input.recipient.trim() && !recipientId) {
      throw new Error("対象者は @ユーザー またはユーザーIDで入力してください。");
    }

    const { occurredAt, memo } = parseOccurredMemo(input.occurredMemo);
    const now = unixNow();
    const id = this.expensesRepo.create({
      threadId,
      category,
      amount,
      direction,
      recipientId,
      responderId: member.id,
      memo,
      occurredAt,
      now
    });

    this.jobsRepo.create({
      kind: "expense_proof_timeout",
      payload: { expenseId: id },
      threadId,
      fireAt: now + 5 * 60,
      now
    });

    const expense = this.requireExpense(id);
    await this.checkThresholds(event, expense);
    return expense;
  }

  async voidExpense(member: GuildMember, expenseId: number): Promise<ExpenseRecord> {
    const expense = this.requireExpense(expenseId);
    this.assertCanModify(member, expense);
    if (expense.voided) {
      throw new Error("この出費記録はすでに取り消されています。");
    }

    this.expensesRepo.void(expense.id);
    const updated = this.requireExpense(expense.id);
    await this.postExpenseNotice(`⚠️ 出費 #${expense.id} は <@${member.id}> により取り消されました。`);
    return updated;
  }

  async correct(member: GuildMember, expenseId: number, input: CorrectExpenseInput): Promise<ExpenseRecord> {
    const original = this.requireExpense(expenseId);
    this.assertCanModify(member, original);
    if (original.voided) {
      throw new Error("取り消し済みの出費記録は訂正できません。");
    }
    if (!original.thread_id) {
      throw new Error("イベントに紐付いていない出費記録はここから訂正できません。");
    }

    const event = this.requireEvent(original.thread_id);
    const amount = parseAmount(input.amount);
    const recipientId = input.recipient.trim()
      ? parseDiscordSnowflake(input.recipient, "last")
      : null;
    if (input.recipient.trim() && !recipientId) {
      throw new Error("対象者は @ユーザー またはユーザーIDで入力してください。");
    }

    const now = unixNow();
    this.expensesRepo.void(original.id);
    const id = this.expensesRepo.create({
      threadId: original.thread_id,
      category: original.category,
      amount,
      direction: original.direction,
      recipientId,
      responderId: member.id,
      memo: input.memo.trim() || original.memo,
      occurredAt: original.occurred_at,
      proofUrl: original.proof_url,
      proofMsgId: original.proof_msg_id,
      proofStatus: original.proof_status,
      correctsId: original.id,
      now
    });

    const corrected = this.requireExpense(id);
    if (corrected.proof_status === "pending_proof") {
      this.jobsRepo.create({
        kind: "expense_proof_timeout",
        payload: { expenseId: corrected.id },
        threadId: original.thread_id,
        fireAt: now + 5 * 60,
        now
      });
    }
    await this.postExpenseLog(corrected);
    await this.postExpenseNotice(`✏️ 出費 #${original.id} を <@${member.id}> が訂正しました。訂正版: #${corrected.id}`);
    await this.checkThresholds(event, corrected);
    return corrected;
  }

  async createFromProof(
    member: GuildMember,
    input: CreateExpenseFromProofInput
  ): Promise<ExpenseRecord> {
    const event = input.threadId ? this.requireEvent(input.threadId) : null;
    if (event) {
      const roles = this.rolesRepo.list(event.thread_id);
      this.assertCanRecord(member, roles);
    } else if (!isEventLead(member, this.settingsRepo)) {
      throw new ExpensePermissionError("イベント外の出費記録はイベント統括のみ可能です。");
    }

    const category = parseExpenseCategory(input.category);
    const direction = parseExpenseDirection(input.direction);
    const amount = parseAmount(input.amount);
    const proofUrl = await this.fetchProofImageUrl(input.targetChannelId, input.targetMessageId);
    const now = unixNow();
    const id = this.expensesRepo.create({
      threadId: input.threadId,
      category,
      amount,
      direction,
      recipientId: input.recipientId,
      responderId: member.id,
      memo: input.memo.trim() || null,
      occurredAt: now,
      proofUrl,
      proofMsgId: input.targetMessageId,
      proofStatus: "attached",
      now
    });

    const expense = this.requireExpense(id);
    await this.postExpenseLog(expense);
    if (event) {
      await this.checkThresholds(event, expense);
    }
    return expense;
  }

  async handleProofMessage(message: Message): Promise<void> {
    if (message.author.bot) {
      return;
    }

    const proofUrl = firstImageUrl(message);
    if (!proofUrl) {
      return;
    }

    const now = unixNow();
    const expense = this.expensesRepo.findLatestPendingProof(message.author.id, now - 5 * 60);
    if (!expense) {
      return;
    }

    this.expensesRepo.markProofAttached(expense.id, proofUrl, message.id);
    const attached = this.requireExpense(expense.id);
    await this.postExpenseLog(attached);

    if ("send" in message.channel) {
      await message.channel.send({
        content: `💰 出費 #${attached.id} の証明画像を紐付けました。`
      });
    }
  }

  async handleProofTimeout(expenseId: number): Promise<void> {
    const expense = this.expensesRepo.get(expenseId);
    if (!expense || expense.voided || expense.proof_status !== "pending_proof" || !expense.thread_id) {
      return;
    }

    const channel = await this.client.channels.fetch(expense.thread_id);
    if (channel && "send" in channel) {
      await channel.send({
        content: `⚠️ <@${expense.responder_id}> 出費 #${expense.id} の証明画像がまだ添付されていません。5分以内に拾えなかったので、画像付きメッセージを再投稿してください。`
      });
    }
  }

  private async postExpenseLog(expense: ExpenseRecord): Promise<void> {
    const expenseLog = this.settingsRepo.get("expenseLog");
    if (!expenseLog) {
      return;
    }

    const event = expense.thread_id ? this.eventsRepo.get(expense.thread_id) : null;
    const channel = await this.client.channels.fetch(expenseLog);
    if (!channel || !("send" in channel)) {
      throw new Error("出費ログチャンネルが見つかりません。");
    }

    await channel.send({
      content: buildExpenseLogMessage(event, expense)
    });
  }

  private async fetchProofImageUrl(targetChannelId: string, targetMessageId: string): Promise<string> {
    const channel = await this.client.channels.fetch(targetChannelId);
    if (!channel || !("messages" in channel)) {
      throw new Error("証明画像のメッセージを取得できませんでした。");
    }
    const message = await channel.messages.fetch(targetMessageId);
    const proofUrl = firstImageUrl(message);
    if (!proofUrl) {
      throw new Error("画像が添付されたメッセージを選んでください。");
    }
    return proofUrl;
  }

  private async postExpenseNotice(content: string): Promise<void> {
    const expenseLog = this.settingsRepo.get("expenseLog");
    if (!expenseLog) {
      return;
    }

    const channel = await this.client.channels.fetch(expenseLog);
    if (channel && "send" in channel) {
      await channel.send({ content });
    }
  }

  private async checkThresholds(event: EventRecord, expense: ExpenseRecord): Promise<void> {
    if (expense.direction !== "out" || !expense.thread_id) {
      return;
    }

    const now = unixNow();
    this.expensesRepo.ensureDefaultThresholds(now);
    await this.checkPerTx(event, expense);
    await this.checkScopedThreshold("per_event", event.thread_id, event.title, () =>
      this.expensesRepo.totalByThread(event.thread_id, "out")
    );

    const monthKey = formatJstPlainDate(expense.occurred_at).slice(0, 7);
    await this.checkScopedThreshold("per_month", monthKey, `${monthKey} 月合計`, () => {
      const { startAt, endAt } = monthBounds(monthKey);
      return this.expensesRepo.totalBetween(startAt, endAt, "out");
    });
  }

  private async checkPerTx(event: EventRecord, expense: ExpenseRecord): Promise<void> {
    const threshold = this.expensesRepo.getThreshold("per_tx");
    if (!threshold || !threshold.enabled || expense.amount <= threshold.threshold) {
      return;
    }

    await this.sendThresholdAlert(
      `出費単発アラート: ${event.title}`,
      expense.amount,
      threshold.threshold,
      `出費 #${expense.id}`
    );
  }

  private async checkScopedThreshold(
    kind: ExpenseThresholdKind,
    scopeKey: string,
    title: string,
    total: () => number
  ): Promise<void> {
    const threshold = this.expensesRepo.getThreshold(kind);
    if (!threshold || !threshold.enabled) {
      return;
    }

    const currentTotal = total();
    if (currentTotal <= threshold.threshold || this.expensesRepo.hasAlertFired(kind, scopeKey)) {
      return;
    }

    const now = unixNow();
    this.expensesRepo.markAlertFired(kind, scopeKey, now);
    await this.sendThresholdAlert(title, currentTotal, threshold.threshold, scopeKey);
  }

  private async sendThresholdAlert(
    title: string,
    amount: number,
    threshold: number,
    scope: string
  ): Promise<void> {
    const eventLeadRole = this.settingsRepo.get("eventLeadRole");
    const content = [
      `💰 ${eventLeadRole ? `<@&${eventLeadRole}>` : "イベント統括"} 出費閾値を超えました。`,
      `対象: ${title}`,
      `金額: ${amount.toLocaleString("ja-JP")} Land`,
      `閾値: ${threshold.toLocaleString("ja-JP")} Land`,
      `scope: ${scope}`
    ].join("\n");

    const channelId = this.settingsRepo.get("internalAnnounce") || this.settingsRepo.get("expenseLog");
    if (!channelId) {
      return;
    }

    const channel = await this.client.channels.fetch(channelId);
    if (channel && "send" in channel) {
      await channel.send({ content });
    }
  }

  private assertCanRecord(member: GuildMember, roles: EventRoleRecord[]): void {
    if (isEventLead(member, this.settingsRepo)) {
      return;
    }

    const isPrize = roles.some((role) => {
      const label = roleLabel(role);
      return role.user_id === member.id && (role.role_type === "prize" || label.includes("賞金") || label.includes("景品"));
    });
    if (!isPrize) {
      throw new ExpensePermissionError("出費記録は賞金・景品対応担当またはイベント統括のみ可能です。");
    }
  }

  private assertCanModify(member: GuildMember, expense: ExpenseRecord): void {
    if (expense.responder_id === member.id || isEventLead(member, this.settingsRepo)) {
      return;
    }
    throw new ExpensePermissionError("この出費記録を変更できるのは、記録者本人またはイベント統括のみです。");
  }

  private requireEvent(threadId: string): EventRecord {
    const event = this.eventsRepo.get(threadId);
    if (!event) {
      throw new Error("イベントが DB に見つかりません。");
    }
    return event;
  }

  private requireExpense(expenseId: number): ExpenseRecord {
    const expense = this.expensesRepo.get(expenseId);
    if (!expense) {
      throw new Error("出費記録が DB に見つかりません。");
    }
    return expense;
  }
}

function parseOccurredMemo(input: string): { occurredAt: number; memo: string | null } {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const date = lines[0] ?? formatJstPlainDate(unixNow());
  const memo = lines.slice(1).join("\n") || null;

  return { occurredAt: parseFlexibleDateTime(date), memo };
}

function firstImageUrl(message: Message): string | null {
  const attachment = message.attachments.find((item) => {
    const contentType = item.contentType ?? "";
    const name = item.name ?? "";
    return contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name);
  });
  return attachment?.url ?? null;
}

function buildExpenseLogMessage(event: EventRecord | null, expense: ExpenseRecord): string {
  return [
    `**【イベント名】**：${event?.title ?? "未紐付け"}`,
    `**【支払日】**：${formatJstDate(expense.occurred_at)}`,
    `**【金額・賞品】**：${expense.amount.toLocaleString("ja-JP")} Land`,
    `**【対象者】**：${expense.recipient_id ? `<@${expense.recipient_id}>` : "未設定"}`,
    `**【対応者】**：<@${expense.responder_id}>`,
    `**【カテゴリ】**：${expense.category}`,
    `**【方向】**：${expense.direction}`,
    `**【用途メモ】**：${expense.memo ?? "なし"}`,
    `**【証明画像】**：${expense.proof_url ?? "未添付"}`
  ].join("\n");
}

function monthBounds(monthKey: string): { startAt: number; endAt: number } {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error("monthKey must be YYYY-MM");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    startAt: jstDateToUnixAtMidnight(`${monthKey}-01`),
    endAt: jstDateToUnixAtMidnight(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`)
  };
}

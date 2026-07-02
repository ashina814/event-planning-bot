import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type GuildMember,
  type Message,
  type MessageContextMenuCommandInteraction
} from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos, type Repos } from "../db/repos/index.js";
import { fetchGuildMember, isEventLead } from "../lib/permission.js";
import type { EventRecord, ExpenseCategory, ExpenseDirection } from "../types/index.js";
import {
  buildExpenseProofCategorySelect,
  buildExpenseProofEventSelect
} from "../ui/buttons.js";

export const RECORD_EXPENSE_COMMAND_NAME = "record_expense";
export const RECORD_EXPENSE_COMMAND_JA_NAME = "出費として記録";

export interface ExpenseProofDraft {
  userId: string;
  threadId: string | null;
  targetChannelId: string;
  targetMessageId: string;
  category: ExpenseCategory;
  direction: ExpenseDirection;
  amount: string;
  memo: string;
  createdAt: number;
}

const proofDrafts = new Map<string, ExpenseProofDraft>();

export const recordExpenseCommandData = new ContextMenuCommandBuilder()
  .setName(RECORD_EXPENSE_COMMAND_NAME)
  .setNameLocalizations({ ja: RECORD_EXPENSE_COMMAND_JA_NAME })
  .setType(ApplicationCommandType.Message);

export async function handleRecordExpenseCommand(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  const targetMessage = interaction.targetMessage;
  if (!firstImageUrl(targetMessage)) {
    await interaction.reply({
      content: "画像が添付されたメッセージを選んでください。",
      ephemeral: true
    });
    return;
  }

  const repos = createRepos(getDb());
  const member = await fetchGuildMember(interaction);
  const events = findRecordableEvents(member, repos);
  const lead = isEventLead(member, repos.settingsRepo);
  const threadEvent = repos.eventsRepo.get(targetMessage.channelId);

  if (threadEvent && (lead || events.some((event) => event.thread_id === threadEvent.thread_id))) {
    await interaction.reply({
      content: `**${threadEvent.title}** の出費として記録します。カテゴリを選んでください。`,
      components: buildExpenseProofCategorySelect(
        threadEvent.thread_id,
        targetMessage.channelId,
        targetMessage.id
      ),
      ephemeral: true
    });
    return;
  }

  if (events.length === 0 && !lead) {
    await interaction.reply({
      content: "出費として記録できるイベントが見つかりません。",
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: "紐付けるイベントを選んでください。",
    components: buildExpenseProofEventSelect(
      targetMessage.channelId,
      targetMessage.id,
      events,
      lead
    ),
    ephemeral: true
  });
}

export function createExpenseProofDraft(
  input: Omit<ExpenseProofDraft, "createdAt">
): string {
  cleanupProofDrafts();
  const sessionId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  proofDrafts.set(sessionId, {
    ...input,
    createdAt: Math.floor(Date.now() / 1000)
  });
  return sessionId;
}

export function consumeExpenseProofDraft(sessionId: string, userId: string): ExpenseProofDraft {
  cleanupProofDrafts();
  const draft = proofDrafts.get(sessionId);
  if (!draft || draft.userId !== userId) {
    throw new Error("出費記録の入力セッションが見つかりません。もう一度やり直してください。");
  }
  proofDrafts.delete(sessionId);
  return draft;
}

function findRecordableEvents(member: GuildMember, repos: Repos): EventRecord[] {
  const events = repos.eventsRepo.listOpen(100);
  if (isEventLead(member, repos.settingsRepo)) {
    return events;
  }
  return events.filter((event) =>
    repos.rolesRepo
      .list(event.thread_id)
      .some((role) => (role.role_kind === "main" || role.role_type === "main") && role.user_id === member.id)
  );
}

function firstImageUrl(message: Message): string | null {
  const attachment = message.attachments.find((item) => {
    const contentType = item.contentType ?? "";
    const name = item.name ?? "";
    return contentType.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(name);
  });
  return attachment?.url ?? null;
}

function cleanupProofDrafts(): void {
  const expiresBefore = Math.floor(Date.now() / 1000) - 10 * 60;
  for (const [sessionId, draft] of proofDrafts) {
    if (draft.createdAt < expiresBefore) {
      proofDrafts.delete(sessionId);
    }
  }
}

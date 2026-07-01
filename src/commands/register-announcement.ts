import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  type GuildMember,
  type MessageContextMenuCommandInteraction
} from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos, type Repos } from "../db/repos/index.js";
import { fetchGuildMember, isEventLead } from "../lib/permission.js";
import type { EventRecord } from "../types/index.js";
import {
  buildAnnouncementTargetChannelSelect,
  buildAnnouncementTargetEventSelect
} from "../ui/buttons.js";

export const REGISTER_ANNOUNCEMENT_COMMAND_NAME = "register_announcement";
export const REGISTER_ANNOUNCEMENT_COMMAND_JA_NAME = "告知文として予約";

interface AnnouncementDraftSession {
  id: string;
  userId: string;
  sourceChannelId: string;
  sourceMessageId: string;
  sourceAuthorId: string;
  body: string;
  threadId: string | null;
  targetChannelId: string | null;
  createdAt: number;
}

const targetEventStatuses = new Set(["planning", "announcing", "announced"]);
const sessions = new Map<string, AnnouncementDraftSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;

export const registerAnnouncementCommandData = new ContextMenuCommandBuilder()
  .setName(REGISTER_ANNOUNCEMENT_COMMAND_NAME)
  .setNameLocalizations({ ja: REGISTER_ANNOUNCEMENT_COMMAND_JA_NAME })
  .setType(ApplicationCommandType.Message);

export async function handleRegisterAnnouncementCommand(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  if (!interaction.guildId) {
    throw new Error("サーバー内のメッセージから実行してください。");
  }

  const targetMessage = interaction.targetMessage;
  if (targetMessage.author.id === interaction.client.user?.id || targetMessage.author.bot) {
    throw new Error("Bot のメッセージは告知文として予約できません。");
  }

  const body = targetMessage.content.trim();
  if (!body) {
    throw new Error("本文が空のメッセージは告知文として予約できません。");
  }

  const repos = createRepos(getDb());
  const member = await fetchGuildMember(interaction);
  const sessionId = createSession({
    userId: interaction.user.id,
    sourceChannelId: targetMessage.channelId,
    sourceMessageId: targetMessage.id,
    sourceAuthorId: targetMessage.author.id,
    body
  });

  const eventInThread = repos.eventsRepo.get(targetMessage.channelId);
  if (eventInThread && targetEventStatuses.has(eventInThread.status)) {
    assertCanUseEvent(member, repos, eventInThread, targetMessage.author.id);
    setAnnouncementDraftEvent(sessionId, interaction.user.id, eventInThread.thread_id);
    await interaction.reply({
      content: buildTargetChannelPrompt(eventInThread, repos),
      components: buildAnnouncementTargetChannelSelect(sessionId),
      ephemeral: true
    });
    return;
  }

  const events = findTargetEvents(member, repos).slice(0, 25);
  if (events.length === 0) {
    throw new Error("紐付けるイベントが見つかりません。");
  }

  if (events.length === 1) {
    const event = events[0];
    if (!event) {
      throw new Error("紐付けるイベントが見つかりません。");
    }
    setAnnouncementDraftEvent(sessionId, interaction.user.id, event.thread_id);
    await interaction.reply({
      content: buildTargetChannelPrompt(event, repos),
      components: buildAnnouncementTargetChannelSelect(sessionId),
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: "紐付けるイベントを選んでください。",
    components: buildAnnouncementTargetEventSelect(sessionId, events),
    ephemeral: true
  });
}

export function requireAnnouncementDraftSession(
  sessionId: string,
  userId: string
): AnnouncementDraftSession {
  cleanupSessions();
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("予約操作の有効期限が切れました。もう一度右クリックからやり直してください。");
  }
  if (session.userId !== userId) {
    throw new Error("この予約操作は開始した本人のみ続行できます。");
  }
  return session;
}

export function setAnnouncementDraftEvent(sessionId: string, userId: string, threadId: string): AnnouncementDraftSession {
  const session = requireAnnouncementDraftSession(sessionId, userId);
  session.threadId = threadId;
  return session;
}

export function setAnnouncementDraftTargetChannel(
  sessionId: string,
  userId: string,
  targetChannelId: string
): AnnouncementDraftSession {
  const session = requireAnnouncementDraftSession(sessionId, userId);
  session.targetChannelId = targetChannelId;
  return session;
}

export function discardAnnouncementDraftSession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function buildTargetChannelPrompt(event: EventRecord, repos: Repos): string {
  const defaultChannelId = repos.settingsRepo.getOptional("eventAnnounce");
  return [
    `**${event.title}** の告知文として予約します。`,
    defaultChannelId
      ? `投稿先チャンネルを選んでください。既定の公式告知は <#${defaultChannelId}> です。`
      : "投稿先チャンネルを選んでください。"
  ].join("\n");
}

export function buildSchedulePrompt(targetChannelId: string): string {
  return [
    `投稿先: <#${targetChannelId}>`,
    "投稿日時を選んでください。元メッセージを予約後に編集した場合、投稿時には編集後の本文を使います。"
  ].join("\n");
}

function createSession(input: Omit<AnnouncementDraftSession, "id" | "threadId" | "targetChannelId" | "createdAt">): string {
  cleanupSessions();
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  sessions.set(id, {
    ...input,
    id,
    threadId: null,
    targetChannelId: null,
    createdAt: Date.now()
  });
  return id;
}

function cleanupSessions(): void {
  const expiresBefore = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions.entries()) {
    if (session.createdAt < expiresBefore) {
      sessions.delete(id);
    }
  }
}

function findTargetEvents(member: GuildMember, repos: Repos): EventRecord[] {
  const lead = isEventLead(member, repos.settingsRepo);
  return repos.eventsRepo
    .listOpen(100)
    .filter((event) => targetEventStatuses.has(event.status))
    .filter((event) => {
      if (lead) {
        return true;
      }
      return isMainAssignee(member.id, repos, event.thread_id);
    });
}

function assertCanUseEvent(
  member: GuildMember,
  repos: Repos,
  event: EventRecord,
  sourceAuthorId: string
): void {
  if (
    member.id === sourceAuthorId ||
    isEventLead(member, repos.settingsRepo) ||
    isMainAssignee(member.id, repos, event.thread_id)
  ) {
    return;
  }

  throw new Error("このメッセージを告知文として予約できるのは、投稿者本人・主担当・イベント統括のみです。");
}

function isMainAssignee(userId: string, repos: Repos, threadId: string): boolean {
  return repos.rolesRepo
    .list(threadId)
    .some((role) => (role.role_kind === "main" || role.role_type === "main") && role.user_id === userId);
}

export function announcementMessageLink(guildId: string | null | undefined, channelId: string | null, messageId: string | null): string {
  if (!guildId || !channelId || !messageId) {
    return "元メッセージリンク未設定";
  }
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

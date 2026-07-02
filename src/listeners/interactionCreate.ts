import { Events, type Client, type GuildMember, type Interaction } from "discord.js";
import { commandMap } from "../commands/index.js";
import {
  announcementMessageLink,
  buildSchedulePrompt,
  buildTargetChannelPrompt,
  discardAnnouncementDraftSession,
  handleRegisterAnnouncementCommand,
  REGISTER_ANNOUNCEMENT_COMMAND_JA_NAME,
  REGISTER_ANNOUNCEMENT_COMMAND_NAME,
  requireAnnouncementDraftSession,
  setAnnouncementDraftEvent,
  setAnnouncementDraftTargetChannel
} from "../commands/register-announcement.js";
import {
  handleSetParticipantsTargetCommand,
  SET_PARTICIPANTS_TARGET_COMMAND_JA_NAME,
  SET_PARTICIPANTS_TARGET_COMMAND_NAME
} from "../commands/set-participants-target.js";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { customRoleKey, normalizeRoleLabel, parseRoleKey, roleKeyFor } from "../db/repos/roles.js";
import { AnnouncementService } from "../features/announcement/service.js";
import { EventLifecycleService } from "../features/event-lifecycle/service.js";
import { ExpenseService } from "../features/expense/service.js";
import {
  buildHelpSelectMenu,
  buildHelpTopicEmbed,
  helpTopics,
  type HelpTopic
} from "../features/help/index.js";
import { OverviewService } from "../features/overview/service.js";
import { ParticipantsService } from "../features/participants/service.js";
import { EventRolesService } from "../features/roles/service.js";
import { TodoService } from "../features/todo/service.js";
import { TimekeeperService } from "../features/timekeeper/service.js";
import { fetchGuildMember, PermissionError } from "../lib/permission.js";
import { parseDiscordUserId } from "../lib/parser.js";
import { formatJstDateTime, jstDateTimeToUnix, unixNow } from "../lib/time.js";
import { logger } from "../lib/logger.js";
import {
  eventStatuses,
  expenseCategories,
  expenseDirections,
  roleTypes,
  type AnnouncementRecord,
  type EventStatus,
  type ExpenseCategory,
  type ExpenseDirection,
  type ReactionEmojiConfig,
  type RoleSlot,
  type RoleType,
  type SettingKey
} from "../types/index.js";
import {
  buildAnnouncementPanelComponents,
  buildAnnouncementParticipantsConfirmComponents,
  buildAnnouncementSchedulePresetComponents,
  buildAnnouncementTargetChannelSelect,
  buildAdminPanelComponents,
  buildEventsOverviewComponents,
  buildExpenseCategorySelect,
  buildExpenseDirectionSelect,
  buildExpensePanelComponents,
  buildHandoverRoleSelect,
  buildMinutesTodoCandidateComponents,
  buildMinutesTodoReviewComponents,
  buildParticipantsPostChannelSelect,
  buildParticipantsSetupGuideComponents,
  buildRoleAssignUserSelect,
  buildRoleBulkComponents,
  buildRoleDeleteConfirm,
  buildRoleHandoverSelect,
  buildRolePanelComponents,
  buildParticipantsPanelComponents,
  buildRoleTypeSelect,
  buildRoleUserSelect,
  buildStatusSelect,
  buildTimerPanelComponents,
  buildTimerNotificationComponents,
  buildTodoActions,
  buildTodoPanelComponents
} from "../ui/buttons.js";
import {
  buildAdminPanelEmbed,
  buildEventsCalendarEmbed,
  buildEventsStatsEmbed,
  buildExpensePanelEmbed,
  buildFlexibleRolePanelEmbed,
  buildMinutesTodoCandidateEmbed,
  buildMinutesTodoReviewEmbed,
  buildParticipantsPanelEmbed,
  buildRolePanelEmbed,
  buildTodoDetailEmbed,
  buildTodoPanelEmbed,
  buildTimerPanelEmbed
} from "../ui/embeds.js";
import {
  buildAnnouncementCustomTimeModal,
  buildAdminBaseModal,
  buildAdminChannels1Modal,
  buildAdminChannels2Modal,
  buildAdminRolesModal,
  buildEventScheduleModal,
  buildExpenseCreateModal,
  buildHandoverModal,
  buildMinutesTodoAdoptModal,
  buildRoleAddModal,
  buildTodoAddModal,
  buildTimerSetupModal
} from "../ui/modals.js";
import { roleLabels, statusLabels } from "../ui/labels.js";

function isRoleType(value: string): value is RoleType {
  return (roleTypes as readonly string[]).includes(value);
}

function isEventStatus(value: string): value is EventStatus {
  return (eventStatuses as readonly string[]).includes(value);
}

function isExpenseCategory(value: string): value is ExpenseCategory {
  return (expenseCategories as readonly string[]).includes(value);
}

function isExpenseDirection(value: string): value is ExpenseDirection {
  return (expenseDirections as readonly string[]).includes(value);
}

function isHelpTopic(value: string): value is HelpTopic {
  return helpTopics.some((topic) => topic.value === value);
}

interface RoleBulkSession {
  userId: string;
  threadId: string;
  roles: RoleSlot[];
  selections: Record<string, string | null>;
  page: number;
  createdAt: number;
}

const roleBulkSessions = new Map<string, RoleBulkSession>();
const ROLE_BULK_SESSION_TTL_MS = 10 * 60 * 1000;

function roleBulkSessionKey(userId: string, threadId: string): string {
  return `${userId}:${threadId}`;
}

function cleanupRoleBulkSessions(): void {
  const expiresBefore = Date.now() - ROLE_BULK_SESSION_TTL_MS;
  for (const [key, session] of roleBulkSessions.entries()) {
    if (session.createdAt < expiresBefore) {
      roleBulkSessions.delete(key);
    }
  }
}

function createRoleBulkSession(userId: string, threadId: string, roles: RoleSlot[]): RoleBulkSession {
  cleanupRoleBulkSessions();
  const selections = Object.fromEntries(
    roles.map((role) => [roleKeyFor(role), role.user_id ?? null])
  ) as Record<string, string | null>;
  const session = {
    userId,
    threadId,
    roles,
    selections,
    page: 0,
    createdAt: Date.now()
  };
  roleBulkSessions.set(roleBulkSessionKey(userId, threadId), session);
  return session;
}

function requireRoleBulkSession(userId: string, threadId: string): RoleBulkSession {
  cleanupRoleBulkSessions();
  const session = roleBulkSessions.get(roleBulkSessionKey(userId, threadId));
  if (!session) {
    throw new Error("一括設定画面の有効期限が切れました。もう一度 [まとめて設定] から開いてください。");
  }
  return session;
}

function roleBulkContent(session: RoleBulkSession): string {
  const maxPage = Math.max(0, Math.ceil(session.roles.length / 4) - 1);
  return `担当をまとめて設定します。${maxPage > 0 ? `ページ ${session.page + 1}/${maxPage + 1}` : ""}`;
}

interface AnnouncementScheduleSession {
  userId: string;
  scheduledAt: number;
  createdAt: number;
}

const announcementScheduleSessions = new Map<string, AnnouncementScheduleSession>();
const ANNOUNCEMENT_SCHEDULE_SESSION_TTL_MS = 30 * 60 * 1000;

function cleanupAnnouncementScheduleSessions(): void {
  const expiresBefore = Date.now() - ANNOUNCEMENT_SCHEDULE_SESSION_TTL_MS;
  for (const [key, session] of announcementScheduleSessions.entries()) {
    if (session.createdAt < expiresBefore) {
      announcementScheduleSessions.delete(key);
    }
  }
}

function setAnnouncementScheduledAt(sessionId: string, userId: string, scheduledAt: number): void {
  cleanupAnnouncementScheduleSessions();
  announcementScheduleSessions.set(sessionId, {
    userId,
    scheduledAt,
    createdAt: Date.now()
  });
}

function requireAnnouncementScheduledAt(sessionId: string, userId: string): number {
  cleanupAnnouncementScheduleSessions();
  const session = announcementScheduleSessions.get(sessionId);
  if (!session) {
    throw new Error("予約日時の選択が見つかりません。もう一度右クリックからやり直してください。");
  }
  if (session.userId !== userId) {
    throw new Error("この予約操作は開始した本人のみ続行できます。");
  }
  return session.scheduledAt;
}

async function scheduleAnnouncementDraft(
  sessionId: string,
  userId: string,
  member: GuildMember,
  service: AnnouncementService,
  enableParticipants: boolean,
  participantsEmojis: ReactionEmojiConfig[] | null
): Promise<AnnouncementRecord> {
  const session = requireAnnouncementDraftSession(sessionId, userId);
  if (!session.threadId || !session.targetChannelId) {
    throw new Error("予約するイベントまたは投稿先チャンネルが未選択です。");
  }
  const scheduledAt = requireAnnouncementScheduledAt(sessionId, userId);
  const announcement = await service.scheduleFromMessage(member, {
    threadId: session.threadId,
    sourceChannelId: session.sourceChannelId,
    sourceMessageId: session.sourceMessageId,
    sourceAuthorId: session.sourceAuthorId,
    targetChannelId: session.targetChannelId,
    body: session.body,
    scheduledAt,
    enableParticipants,
    participantsEmojis
  });
  discardAnnouncementDraftSession(sessionId);
  announcementScheduleSessions.delete(sessionId);
  return announcement;
}

function buildAnnouncementParticipantsPrompt(targetChannelId: string, scheduledAt: number): string {
  return [
    `投稿先: <#${targetChannelId}>`,
    `投稿日時: ${formatJstDateTime(scheduledAt)}`,
    "",
    "この告知を参加者カウントの対象にしますか？"
  ].join("\n");
}

function buildAnnouncementReservedContent(
  announcement: AnnouncementRecord,
  scheduledAt: number,
  participantsEnabled: boolean
): string {
  return [
    `予約完了。${formatJstDateTime(announcement.scheduled_at ?? scheduledAt)} に <#${announcement.target_channel_id}> へ投稿します。`,
    participantsEnabled ? "投稿後に参加者カウントを開始します。" : null
  ].filter(Boolean).join("\n");
}

function assertOwner(userId: string): void {
  if (userId !== config.ownerId) {
    throw new PermissionError("この管理パネルは OWNER_ID のユーザーのみ使えます。");
  }
}

function buildAnnouncementPanelContent(
  eventTitle: string,
  announcements: AnnouncementRecord[],
  guildId: string | null | undefined
): string {
  const scheduled = announcements.filter((announcement) => announcement.scheduled_at && !announcement.posted_at);
  const scheduledLines =
    scheduled.length > 0
      ? scheduled
          .slice(0, 8)
          .map((announcement) => {
            const target = announcement.target_channel_id ? `<#${announcement.target_channel_id}>` : "投稿先未設定";
            const source = announcementMessageLink(
              guildId,
              announcement.source_channel_id,
              announcement.source_message_id
            );
            return [
              `• ${formatJstDateTime(announcement.scheduled_at ?? 0)} → ${target}`,
              `  元メッセージ: ${source}`
            ].join("\n");
          })
          .concat(scheduled.length > 8 ? [`ほか ${scheduled.length - 8} 件`] : [])
          .join("\n")
      : "まだ予約されていません。";

  return [
    `📢 **告知文の予約: ${eventTitle}**`,
    "",
    scheduledLines,
    "",
    "使い方",
    "1. このイベントスレッドに告知文を普通に投稿します。",
    "2. その投稿を右クリック → アプリ → 告知文として予約。",
    "3. 投稿先チャンネルと日時を選ぶと予約完了です。",
    "",
    "予約後に元メッセージを編集すると、投稿時には編集後の本文を使います。"
  ].join("\n");
}

function announcementPresetUnix(preset: string): number {
  switch (preset) {
    case "now":
      return unixNow() + 30;
    case "1h":
      return unixNow() + 60 * 60;
    case "21":
      return jstDateTimeToUnix("21:00");
    default:
      throw new Error("未知の予約プリセットです。");
  }
}

async function replyError(interaction: Interaction, error: unknown): Promise<void> {
  const message =
    error instanceof PermissionError
      ? error.message
      : error instanceof Error
        ? error.message
        : String(error);

  logger.error({ error: message }, "interaction failed");

  if (interaction.isRepliable()) {
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: `⚠️ ${message}`, ephemeral: true }).catch(() => null);
    } else {
      await interaction.reply({ content: `⚠️ ${message}`, ephemeral: true }).catch(() => null);
    }
  }
}

export function registerInteractionCreateListener(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        if (interaction.commandName !== "event") {
          return;
        }

        const focused = interaction.options.getFocused(true);
        if (focused.name !== "series") {
          await interaction.respond([]);
          return;
        }

        const repos = createRepos(getDb());
        const query = String(focused.value ?? "").trim().toLowerCase();
        const allSeries = repos.seriesRepo.listActive(100);
        const startsWith = allSeries.filter((series) => series.name.toLowerCase().startsWith(query));
        const includes = allSeries.filter(
          (series) => !startsWith.includes(series) && series.name.toLowerCase().includes(query)
        );
        const choices = [...startsWith, ...includes].slice(0, 25).map((series) => ({
          name: series.name,
          value: series.name
        }));

        await interaction.respond(
          choices.length > 0
            ? choices
            : [{ name: "(単発イベントとして作成)", value: " " }]
        );
        return;
      }

      if (interaction.isChatInputCommand()) {
        const command = commandMap.get(interaction.commandName);
        if (!command) {
          await interaction.reply({ content: "未登録のコマンドです。", ephemeral: true });
          return;
        }
        await command.execute(interaction);
        return;
      }

      if (interaction.isMessageContextMenuCommand()) {
        if (
          interaction.commandName === REGISTER_ANNOUNCEMENT_COMMAND_NAME ||
          interaction.commandName === REGISTER_ANNOUNCEMENT_COMMAND_JA_NAME
        ) {
          await handleRegisterAnnouncementCommand(interaction);
          return;
        }

        if (
          interaction.commandName === SET_PARTICIPANTS_TARGET_COMMAND_NAME ||
          interaction.commandName === SET_PARTICIPANTS_TARGET_COMMAND_JA_NAME
        ) {
          await handleSetParticipantsTargetCommand(interaction);
          return;
        }
        return;
      }

      if (interaction.isButton()) {
        const parts = interaction.customId.split(":");
        const [namespace, action, threadId] = parts;
        if (!threadId) {
          return;
        }

        const repos = createRepos(getDb());

        if (namespace === "admin") {
          assertOwner(interaction.user.id);
          const settings = repos.settingsRepo.all();

          if (action === "base") {
            await interaction.showModal(buildAdminBaseModal(settings));
            return;
          }

          if (action === "channels1") {
            await interaction.showModal(buildAdminChannels1Modal(settings));
            return;
          }

          if (action === "channels2") {
            await interaction.showModal(buildAdminChannels2Modal(settings));
            return;
          }

          if (action === "roles") {
            await interaction.showModal(buildAdminRolesModal(settings));
            return;
          }
        }

        if (namespace === "events") {
          const service = new OverviewService(
            repos.eventsRepo,
            repos.expensesRepo,
            repos.rolesRepo
          );

          if (action === "calendar") {
            const panel = service.calendar(threadId);
            await interaction.update({
              embeds: [buildEventsCalendarEmbed(panel.bounds.monthKey, panel.events)],
              components: buildEventsOverviewComponents(panel.bounds.monthKey)
            });
            return;
          }

          if (action === "stats") {
            const stats = service.stats(threadId);
            await interaction.update({
              embeds: [buildEventsStatsEmbed(stats)],
              components: buildEventsOverviewComponents(threadId)
            });
            return;
          }
        }

        if (namespace === "role") {
          const event = repos.eventsRepo.get(threadId);
          if (!event) {
            await interaction.reply({ content: "イベントが見つかりませんでした", ephemeral: true });
            return;
          }

          if (action === "change-main") {
            await interaction.update({
              content: "主担当にするユーザーを選んでください。",
              embeds: [],
              components: buildRoleAssignUserSelect(threadId, "main", "主担当")
            });
            return;
          }

          if (action === "bulk") {
            const roles = repos.rolesRepo.listSlots(threadId, event.series_id);
            const session = createRoleBulkSession(interaction.user.id, threadId, roles);
            await interaction.update({
              content: roleBulkContent(session),
              embeds: [],
              components: buildRoleBulkComponents(threadId, session.roles, session.selections, session.page)
            });
            return;
          }

          if (action === "bulk-page") {
            const direction = parts[3];
            const session = requireRoleBulkSession(interaction.user.id, threadId);
            session.page += direction === "prev" ? -1 : 1;
            session.page = Math.min(Math.max(session.page, 0), Math.max(0, Math.ceil(session.roles.length / 4) - 1));
            await interaction.update({
              content: roleBulkContent(session),
              embeds: [],
              components: buildRoleBulkComponents(threadId, session.roles, session.selections, session.page)
            });
            return;
          }

          if (action === "bulk-confirm") {
            const session = requireRoleBulkSession(interaction.user.id, threadId);
            await interaction.deferUpdate();
            const member = await fetchGuildMember(interaction);
            const service = new EventRolesService(
              interaction.client,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.seriesRepo,
              repos.settingsRepo
            );
            const assignments = session.roles
              .map((role) => ({
                roleKey: roleKeyFor(role),
                userId: session.selections[roleKeyFor(role)] ?? null
              }))
              .filter((assignment): assignment is { roleKey: string; userId: string } => Boolean(assignment.userId));
            const summary = await service.bulkAssignRoles(member, threadId, assignments);
            roleBulkSessions.delete(roleBulkSessionKey(interaction.user.id, threadId));
            const updatedRoles = repos.rolesRepo.listSlots(threadId, event.series_id);
            await interaction.editReply({
              content: `担当を更新しました: ${summary}`,
              embeds: [buildFlexibleRolePanelEmbed(event, updatedRoles)],
              components: buildRolePanelComponents(threadId, updatedRoles)
            });
            return;
          }

          if (action === "change") {
            const roleKey = parts[3];
            if (!roleKey) {
              throw new Error("指定された役割が無効です");
            }
            const label = parseRoleKey(roleKey).roleLabel ?? "主担当";
            await interaction.update({
              content: `${label}にするユーザーを選んでください。`,
              embeds: [],
              components: buildRoleAssignUserSelect(threadId, roleKey, label)
            });
            return;
          }

          if (action === "add") {
            await interaction.showModal(buildRoleAddModal(threadId));
            return;
          }

          if (action === "handover") {
            const roles = repos.rolesRepo.listSlots(threadId, event.series_id);
            await interaction.update({
              content: "引き継ぐ役割を選んでください。",
              embeds: [],
              components: buildRoleHandoverSelect(threadId, roles)
            });
            return;
          }

          if (action === "delete") {
            const roleKey = parts[3];
            if (!roleKey) {
              throw new Error("指定された役割が無効です");
            }
            const label = parseRoleKey(roleKey).roleLabel ?? "主担当";
            await interaction.update({
              content: `${label}を削除しますか？`,
              embeds: [],
              components: buildRoleDeleteConfirm(threadId, roleKey, label)
            });
            return;
          }

          if (action === "delete-cancel") {
            const roles = repos.rolesRepo.listSlots(threadId, event.series_id);
            await interaction.update({
              content: "",
              embeds: [buildFlexibleRolePanelEmbed(event, roles)],
              components: buildRolePanelComponents(threadId, roles)
            });
            return;
          }

          if (action === "delete-confirm") {
            const roleKey = parts[3];
            if (!roleKey) {
              throw new Error("指定された役割が無効です");
            }
            await interaction.deferUpdate();
            const member = await fetchGuildMember(interaction);
            const service = new EventRolesService(
              interaction.client,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.seriesRepo,
              repos.settingsRepo
            );
            await service.deleteRole(member, threadId, roleKey);
            const roles = repos.rolesRepo.listSlots(threadId, event.series_id);
            await interaction.editReply({
              content: "役割を削除しました。",
              embeds: [buildFlexibleRolePanelEmbed(event, roles)],
              components: buildRolePanelComponents(threadId, roles)
            });
            return;
          }
        }

        if (namespace === "event") {
          const event = repos.eventsRepo.get(threadId);
          if (!event) {
            await interaction.reply({ content: "イベントが DB に見つかりません。", ephemeral: true });
            return;
          }

          if (action === "roles") {
            const roles = repos.rolesRepo.listSlots(threadId, event.series_id);
            await interaction.reply({
              embeds: [buildFlexibleRolePanelEmbed(event, roles)],
              components: buildRolePanelComponents(threadId, roles),
              ephemeral: true
            });
            return;
          }

          if (action === "status") {
            const components = buildStatusSelect(event);
            if (components.length === 0) {
              await interaction.reply({ content: "この状態から変更できる遷移はありません。", ephemeral: true });
              return;
            }
            await interaction.reply({
              content: `現在の状態: **${statusLabels[event.status]}**`,
              components,
              ephemeral: true
            });
            return;
          }

          if (action === "handover") {
            const roles = repos.rolesRepo.listSlots(threadId, event.series_id);
            await interaction.reply({
              content: "どの役割を引き継ぎますか？",
              components: buildRoleHandoverSelect(threadId, roles),
              ephemeral: true
            });
            return;
          }

          if (action === "schedule") {
            await interaction.showModal(buildEventScheduleModal(threadId));
            return;
          }

          if (action === "announcements") {
            const announcements = repos.announcementsRepo.listByThread(threadId);
            await interaction.reply({
              content: buildAnnouncementPanelContent(event.title, announcements, interaction.guildId),
              components: buildAnnouncementPanelComponents(threadId, announcements),
              ephemeral: true
            });
            return;
          }

          if (action === "timer") {
            const timer = repos.timersRepo.latestSchedule(threadId);
            const sections = timer ? repos.timersRepo.listSections(timer.id) : [];
            await interaction.reply({
              embeds: [buildTimerPanelEmbed(event, timer, sections)],
              components: buildTimerPanelComponents(threadId, timer),
              ephemeral: true
            });
            return;
          }

          if (action === "participants") {
            const panel = new ParticipantsService(
              interaction.client,
              repos.participantsRepo,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.settingsRepo
            ).getPanel(threadId);
            if (!panel.config) {
              await interaction.reply({
                content: [
                  "リアクション方式は、対象メッセージを右クリック → アプリ → 参加者カウント対象に設定 から指定してください。",
                  "投稿方式にする場合は下のボタンからチャンネル/スレッドを選べます。"
                ].join("\n"),
                components: buildParticipantsSetupGuideComponents(threadId),
                ephemeral: true
              });
              return;
            }
            await interaction.reply({
              embeds: [buildParticipantsPanelEmbed(event, panel.config, panel.counts)],
              components: buildParticipantsPanelComponents(threadId, panel.config),
              ephemeral: true
            });
            return;
          }

          if (action === "todos") {
            const todos = repos.todosRepo.listByThread(threadId);
            await interaction.reply({
              embeds: [buildTodoPanelEmbed(event, todos)],
              components: buildTodoPanelComponents(threadId, todos),
              ephemeral: true
            });
            return;
          }

          if (action === "expenses") {
            const service = new ExpenseService(
              interaction.client,
              repos.expensesRepo,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.jobsRepo,
              repos.settingsRepo
            );
            const panel = service.getPanel(threadId);
            await interaction.reply({
              embeds: [
                buildExpensePanelEmbed(
                  event,
                  panel.expenses,
                  panel.totalOut,
                  panel.totalIn,
                  panel.pendingProofCount
                )
              ],
              components: buildExpensePanelComponents(threadId),
              ephemeral: true
            });
            return;
          }
        }

        if (namespace === "ann") {
          if (action === "custom-time") {
            requireAnnouncementDraftSession(threadId, interaction.user.id);
            await interaction.showModal(buildAnnouncementCustomTimeModal(threadId));
            return;
          }

          if (action === "preset") {
            const preset = parts[3];
            const session = requireAnnouncementDraftSession(threadId, interaction.user.id);
            if (!session.threadId || !session.targetChannelId) {
              throw new Error("予約するイベントまたは投稿先チャンネルが未選択です。");
            }
            const scheduledAt = announcementPresetUnix(preset ?? "");
            setAnnouncementScheduledAt(threadId, interaction.user.id, scheduledAt);
            await interaction.update({
              content: buildAnnouncementParticipantsPrompt(session.targetChannelId, scheduledAt),
              components: buildAnnouncementParticipantsConfirmComponents(threadId)
            });
            return;
          }

          if (action === "participants") {
            const decision = parts[3];
            if (decision !== "yes" && decision !== "no") {
              throw new Error("未知の告知予約オプションです。");
            }

            await interaction.deferUpdate();
            const member = await fetchGuildMember(interaction);
            const announcementService = new AnnouncementService(
              interaction.client,
              repos.announcementsRepo,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.jobsRepo,
              repos.settingsRepo
            );

            if (decision === "no") {
              const scheduledAt = requireAnnouncementScheduledAt(threadId, interaction.user.id);
              const announcement = await scheduleAnnouncementDraft(
                threadId,
                interaction.user.id,
                member,
                announcementService,
                false,
                null
              );
              await interaction.editReply({
                content: buildAnnouncementReservedContent(announcement, scheduledAt, false),
                components: []
              });
              return;
            }

            const session = requireAnnouncementDraftSession(threadId, interaction.user.id);
            if (!session.threadId) {
              throw new Error("予約するイベントが未選択です。");
            }
            const participantsService = new ParticipantsService(
              interaction.client,
              repos.participantsRepo,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.settingsRepo
            );
            const configuredEmojis = participantsService.getConfiguredReactionEmojis(session.threadId);
            if (configuredEmojis) {
              const scheduledAt = requireAnnouncementScheduledAt(threadId, interaction.user.id);
              const announcement = await scheduleAnnouncementDraft(
                threadId,
                interaction.user.id,
                member,
                announcementService,
                true,
                configuredEmojis
              );
              await interaction.editReply({
                content: [
                  buildAnnouncementReservedContent(announcement, scheduledAt, true),
                  "既存の参加者カウント絵文字を使います。"
                ].join("\n"),
                components: []
              });
              return;
            }

            const setupMessage = await participantsService.beginAnnouncementEmojiSetup(
              member,
              session.threadId,
              threadId
            );
            await interaction.editReply({
              content: [
                `絵文字セットアップメッセージを投稿しました: ${setupMessage.url}`,
                "参加用・不参加用の絵文字を押して、セットアップメッセージの [これで確定] を押してください。"
              ].join("\n"),
              components: []
            });
            return;
          }

          if (action === "emoji-confirm") {
            const sessionId = threadId;
            const setupThreadId = parts[3];
            const setupMsg = parts[4];
            if (!setupThreadId || !setupMsg) {
              throw new Error("絵文字セットアップ情報が不完全です。");
            }
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            const participantsService = new ParticipantsService(
              interaction.client,
              repos.participantsRepo,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.settingsRepo
            );
            const emojis = await participantsService.confirmAnnouncementEmojiSetup(member, setupThreadId, setupMsg);
            const announcementService = new AnnouncementService(
              interaction.client,
              repos.announcementsRepo,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.jobsRepo,
              repos.settingsRepo
            );
            const scheduledAt = requireAnnouncementScheduledAt(sessionId, interaction.user.id);
            const announcement = await scheduleAnnouncementDraft(
              sessionId,
              interaction.user.id,
              member,
              announcementService,
              true,
              emojis
            );
            await interaction.editReply({
              content: buildAnnouncementReservedContent(announcement, scheduledAt, true)
            });
            return;
          }

          if (action === "emoji-cancel") {
            const sessionId = threadId;
            const setupThreadId = parts[3];
            const setupMsg = parts[4];
            if (!setupThreadId || !setupMsg) {
              return;
            }
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            const participantsService = new ParticipantsService(
              interaction.client,
              repos.participantsRepo,
              repos.eventsRepo,
              repos.rolesRepo,
              repos.settingsRepo
            );
            await participantsService.cancelAnnouncementEmojiSetup(member, setupThreadId, setupMsg);
            discardAnnouncementDraftSession(sessionId);
            announcementScheduleSessions.delete(sessionId);
            await interaction.editReply({ content: "告知予約をキャンセルしました。" });
            return;
          }
        }

        if (namespace === "timer") {
          const scheduleId = Number(interaction.customId.split(":")[3] ?? 0);
          const service = new TimekeeperService(
            interaction.client,
            repos.timersRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.seriesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );

          if (action === "setup") {
            await interaction.showModal(buildTimerSetupModal(threadId));
            return;
          }

          if (action === "panel") {
            const event = repos.eventsRepo.get(threadId);
            const timer = repos.timersRepo.latestSchedule(threadId);
            const sections = timer ? repos.timersRepo.listSections(timer.id) : [];
            await interaction.reply({
              embeds: event ? [buildTimerPanelEmbed(event, timer, sections)] : [],
              components: buildTimerPanelComponents(threadId, timer),
              ephemeral: true
            });
            return;
          }

          if (action === "next") {
            if (!scheduleId) {
              throw new Error("タイマー設定 ID が不正です。");
            }
            await interaction.deferReply({ ephemeral: true });
            if (parts[4] === "notice") {
              await interaction.message.edit({
                components: buildTimerNotificationComponents(threadId, scheduleId, false, true)
              }).catch(() => null);
            }
            const member = await fetchGuildMember(interaction);
            const message = await service.next(member, threadId, scheduleId);
            const event = repos.eventsRepo.get(threadId);
            const timer = repos.timersRepo.getSchedule(scheduleId);
            const sections = repos.timersRepo.listSections(scheduleId);
            await interaction.editReply({
              content: message,
              embeds: event && timer ? [buildTimerPanelEmbed(event, timer, sections)] : []
            });
            return;
          }

          if (action === "finish") {
            if (!scheduleId) {
              throw new Error("タイマー設定 ID が不正です。");
            }
            await interaction.deferReply({ ephemeral: true });
            if (parts[4] === "notice") {
              await interaction.message.edit({
                components: buildTimerNotificationComponents(threadId, scheduleId, true, true)
              }).catch(() => null);
            }
            const member = await fetchGuildMember(interaction);
            const message = await service.finish(member, threadId, scheduleId);
            const event = repos.eventsRepo.get(threadId);
            const timer = repos.timersRepo.getSchedule(scheduleId);
            const sections = repos.timersRepo.listSections(scheduleId);
            await interaction.editReply({
              content: message,
              embeds: event && timer ? [buildTimerPanelEmbed(event, timer, sections)] : []
            });
            return;
          }
        }

        if (namespace === "participants") {
          const service = new ParticipantsService(
            interaction.client,
            repos.participantsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.settingsRepo
          );

          if (action === "target-confirm") {
            const targetChannel = parts[3];
            const targetMsg = parts[4];
            if (!targetChannel || !targetMsg) {
              throw new Error("対象メッセージ情報が不完全です。");
            }
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            const setupMessage = await service.beginReactionEmojiSetup(member, threadId, targetChannel, targetMsg);
            await interaction.editReply({
              content: `セットアップメッセージを投稿しました: ${setupMessage.url}`
            });
            return;
          }

          if (action === "setup") {
            await interaction.reply({
              content: [
                "リアクション方式は、対象メッセージを右クリック → アプリ → 参加者カウント対象に設定 から指定してください。",
                "投稿方式にする場合は下のボタンからチャンネル/スレッドを選べます。"
              ].join("\n"),
              components: buildParticipantsSetupGuideComponents(threadId),
              ephemeral: true
            });
            return;
          }

          if (action === "setup-post") {
            await interaction.update({
              content: "投稿数を数えるチャンネル/スレッドを選んでください。",
              embeds: [],
              components: buildParticipantsPostChannelSelect(threadId)
            });
            return;
          }

          if (action === "setup-confirm") {
            const setupMsg = parts[3];
            if (!setupMsg) {
              throw new Error("セットアップ情報が見つかりませんでした。");
            }
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            await service.confirmReactionEmojiSetup(member, threadId, setupMsg);
            const event = repos.eventsRepo.get(threadId);
            const panel = service.getPanel(threadId);
            await interaction.editReply({
              content: "設定完了。対象メッセージのリアクションをカウントし始めます。",
              embeds: event ? [buildParticipantsPanelEmbed(event, panel.config, panel.counts)] : [],
              components: buildParticipantsPanelComponents(threadId, panel.config)
            });
            return;
          }

          if (action === "setup-cancel") {
            const setupMsg = parts[3];
            if (!setupMsg) {
              return;
            }
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            await service.cancelReactionEmojiSetup(member, threadId, setupMsg);
            await interaction.editReply({ content: "参加者カウントのセットアップをキャンセルしました。" });
            return;
          }

          if (action === "refresh") {
            await interaction.deferReply({ ephemeral: true });
            await service.refresh(threadId);
            const event = repos.eventsRepo.get(threadId);
            const panel = service.getPanel(threadId);
            await interaction.editReply({
              content: "参加者カウントを再集計しました。",
              embeds: event ? [buildParticipantsPanelEmbed(event, panel.config, panel.counts)] : [],
              components: buildParticipantsPanelComponents(threadId, panel.config)
            });
            return;
          }
        }

        if (namespace === "expense") {
          if (action === "new") {
            await interaction.reply({
              content: "出費カテゴリを選んでください。",
              components: buildExpenseCategorySelect(threadId),
              ephemeral: true
            });
            return;
          }
        }

        if (namespace === "todo") {
          const parts = interaction.customId.split(":");
          const primaryId = parts[2];
          const secondaryId = parts[3];
          if (!primaryId) {
            return;
          }
          const service = new TodoService(
            interaction.client,
            repos.todosRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );

          if (action === "minutes") {
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            const candidates = service.listMinutesCandidates(member, primaryId);
            await interaction.editReply({
              embeds: [buildMinutesTodoReviewEmbed(primaryId, candidates)],
              components: buildMinutesTodoReviewComponents(primaryId, candidates)
            });
            return;
          }

          if (action === "minutes-discard") {
            const todoId = Number(secondaryId ?? 0);
            if (!todoId) {
              throw new Error("ToDo 候補 ID が不正です。");
            }
            await interaction.deferUpdate();
            const member = await fetchGuildMember(interaction);
            service.discardMinutesCandidate(member, todoId);
            const candidates = service.listMinutesCandidates(member, primaryId);
            await interaction.editReply({
              content: "候補を破棄しました。",
              embeds: [buildMinutesTodoReviewEmbed(primaryId, candidates)],
              components: buildMinutesTodoReviewComponents(primaryId, candidates)
            });
            return;
          }

          if (action === "add") {
            await interaction.showModal(buildTodoAddModal(threadId));
            return;
          }

          const todoId = Number(secondaryId ?? 0);
          if (!todoId) {
            throw new Error("ToDo ID が不正です。");
          }

          if (action === "toggle") {
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            const current = repos.todosRepo.get(todoId);
            if (!current) {
              throw new Error("ToDo が DB に見つかりません。");
            }
            const todo = service.setDone(member, todoId, current.status !== "done");
            await interaction.editReply({
              embeds: [buildTodoDetailEmbed(todo)],
              components: buildTodoActions(threadId, todo)
            });
            return;
          }

          if (action === "delete") {
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            service.delete(member, todoId);
            const event = repos.eventsRepo.get(threadId);
            const todos = service.list(threadId);
            await interaction.editReply({
              content: "ToDo を削除しました。",
              embeds: event ? [buildTodoPanelEmbed(event, todos)] : [],
              components: buildTodoPanelComponents(threadId, todos)
            });
            return;
          }
        }

        return;
      }

      if (interaction.isStringSelectMenu()) {
        const parts = interaction.customId.split(":");
        const [namespace, action, threadId] = parts;

        const value = interaction.values[0];
        if (!value) {
          return;
        }

        if (namespace === "help" && action === "topic") {
          if (!isHelpTopic(value)) {
            throw new Error("未知のヘルプ項目です。");
          }
          await interaction.update({
            embeds: [buildHelpTopicEmbed(value)],
            components: [buildHelpSelectMenu()]
          });
          return;
        }

        if (!threadId) {
          return;
        }

        const repos = createRepos(getDb());

        if (namespace === "event" && action === "status-select") {
          if (!isEventStatus(value)) {
            throw new Error("未知の状態です。");
          }
          await interaction.deferUpdate();
          const member = await fetchGuildMember(interaction);
          const service = new EventLifecycleService(
            interaction.client,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.seriesRepo,
            repos.jobsRepo,
            repos.timersRepo,
            repos.settingsRepo
          );
          await service.changeStatus(member, threadId, value);
          await interaction.followUp({
            content: `状態を **${statusLabels[value]}** に変更しました。`,
            ephemeral: true
          });
          return;
        }

        if (namespace === "event" && action === "role-type") {
          if (!isRoleType(value)) {
            throw new Error("未知の担当種別です。");
          }
          await interaction.update({
            content: `${roleLabels[value]} にするユーザーを選んでください。`,
            embeds: [],
            components: buildRoleUserSelect(threadId, value)
          });
          return;
        }

        if (namespace === "event" && action === "handover-role") {
          if (!isRoleType(value)) {
            throw new Error("未知の役割です。");
          }
          await interaction.showModal(buildHandoverModal(threadId, value));
          return;
        }

        if (namespace === "role" && action === "handover-select") {
          await interaction.showModal(buildHandoverModal(threadId, value));
          return;
        }

        if (namespace === "role" && action === "change-select") {
          const label = parseRoleKey(value).roleLabel ?? "主担当";
          await interaction.update({
            content: `${label}にするユーザーを選んでください。`,
            embeds: [],
            components: buildRoleAssignUserSelect(threadId, value, label)
          });
          return;
        }

        if (namespace === "role" && action === "delete-select") {
          const label = parseRoleKey(value).roleLabel ?? "主担当";
          await interaction.update({
            content: `${label}を削除しますか？`,
            embeds: [],
            components: buildRoleDeleteConfirm(threadId, value, label)
          });
          return;
        }

        if (namespace === "expense" && action === "new-category") {
          if (!isExpenseCategory(value)) {
            throw new Error("未知の出費カテゴリです。");
          }
          await interaction.update({
            content: "出費か補填・返金かを選んでください。",
            components: buildExpenseDirectionSelect(threadId, value)
          });
          return;
        }

        if (namespace === "expense" && action === "new-direction") {
          const category = parts[3];
          if (!category || !isExpenseCategory(category)) {
            throw new Error("未知の出費カテゴリです。");
          }
          if (!isExpenseDirection(value)) {
            throw new Error("未知の出費方向です。");
          }
          await interaction.showModal(buildExpenseCreateModal(threadId, category, value));
          return;
        }

        if (namespace === "participants" && action === "target-event") {
          const targetChannel = threadId;
          const targetMsg = parts[3];
          if (!targetMsg) {
            throw new Error("対象メッセージ情報が不完全です。");
          }
          await interaction.deferReply({ ephemeral: true });
          const member = await fetchGuildMember(interaction);
          const service = new ParticipantsService(
            interaction.client,
            repos.participantsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.settingsRepo
          );
          const setupMessage = await service.beginReactionEmojiSetup(member, value, targetChannel, targetMsg);
          await interaction.editReply({
            content: `セットアップメッセージを投稿しました: ${setupMessage.url}`
          });
          return;
        }

        if (namespace === "ann" && action === "target-event") {
          const event = repos.eventsRepo.get(value);
          if (!event) {
            throw new Error("イベントが見つかりませんでした");
          }
          setAnnouncementDraftEvent(threadId, interaction.user.id, value);
          await interaction.update({
            content: buildTargetChannelPrompt(event, repos),
            components: buildAnnouncementTargetChannelSelect(threadId)
          });
          return;
        }

        if (namespace === "ann" && action === "cancel-select") {
          const announcementId = Number(value);
          await interaction.deferUpdate();
          const member = await fetchGuildMember(interaction);
          const service = new AnnouncementService(
            interaction.client,
            repos.announcementsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          service.cancel(member, announcementId);
          const event = repos.eventsRepo.get(threadId);
          const announcements = repos.announcementsRepo.listByThread(threadId);
          await interaction.editReply({
            content: event
              ? `予約を取り消しました。\n\n${buildAnnouncementPanelContent(event.title, announcements, interaction.guildId)}`
              : "予約を取り消しました。",
            components: event ? buildAnnouncementPanelComponents(threadId, announcements) : []
          });
          return;
        }

        if (namespace === "todo" && action === "select") {
          const todoId = Number(value);
          const todo = repos.todosRepo.get(todoId);
          if (!todo) {
            throw new Error("ToDo が DB に見つかりません。");
          }
          await interaction.update({
            embeds: [buildTodoDetailEmbed(todo)],
            components: buildTodoActions(threadId, todo)
          });
        }

        if (namespace === "todo" && action === "minutes-candidate") {
          const todoId = Number(value);
          const member = await fetchGuildMember(interaction);
          const service = new TodoService(
            interaction.client,
            repos.todosRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const todo = service.getMinutesCandidate(member, todoId);
          const events = repos.eventsRepo.listOpen(25);
          await interaction.update({
            embeds: [buildMinutesTodoCandidateEmbed(todo)],
            components: buildMinutesTodoCandidateComponents(threadId, todo, events)
          });
        }

        if (namespace === "todo" && action === "minutes-event") {
          const todoId = Number(threadId);
          if (!todoId) {
            throw new Error("ToDo 候補 ID が不正です。");
          }
          const member = await fetchGuildMember(interaction);
          const service = new TodoService(
            interaction.client,
            repos.todosRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const todo = service.getMinutesCandidate(member, todoId);
          await interaction.showModal(buildMinutesTodoAdoptModal(value, todo));
        }
        return;
      }

      if (interaction.isUserSelectMenu()) {
        const [namespace, action, threadId, roleType] = interaction.customId.split(":");
        if (namespace === "role" && action === "bulk-select" && threadId && roleType) {
          const userId = interaction.values[0];
          if (!userId) {
            return;
          }
          const session = requireRoleBulkSession(interaction.user.id, threadId);
          session.selections[roleType] = userId;
          await interaction.deferUpdate();
          return;
        }

        if (namespace === "role" && action === "assign" && threadId && roleType) {
          const userId = interaction.values[0];
          if (!userId) {
            return;
          }

          await interaction.deferUpdate();
          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new EventRolesService(
            interaction.client,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.seriesRepo,
            repos.settingsRepo
          );
          await service.assignRole(member, threadId, roleType, userId);
          const event = repos.eventsRepo.get(threadId);
          const roles = repos.rolesRepo.listSlots(threadId, event?.series_id ?? null);
          await interaction.editReply({
            content: `${parseRoleKey(roleType).roleLabel ?? "主担当"}を <@${userId}> に設定しました。`,
            embeds: event ? [buildFlexibleRolePanelEmbed(event, roles)] : [],
            components: event ? buildRolePanelComponents(threadId, roles) : []
          });
          return;
        }

        if (namespace !== "event" || action !== "role-user" || !threadId || !roleType) {
          return;
        }
        if (!isRoleType(roleType)) {
          throw new Error("未知の担当種別です。");
        }

        const userId = interaction.values[0];
        if (!userId) {
          return;
        }

        await interaction.deferUpdate();
        const member = await fetchGuildMember(interaction);
        const repos = createRepos(getDb());
        const service = new EventRolesService(
          interaction.client,
          repos.eventsRepo,
          repos.rolesRepo,
          repos.seriesRepo,
          repos.settingsRepo
        );
        await service.assignRole(member, threadId, roleType, userId);
        await interaction.followUp({
          content: `${roleLabels[roleType]} を <@${userId}> に設定しました。`,
          ephemeral: true
        });
        return;
      }

      if (interaction.isChannelSelectMenu()) {
        const [namespace, action, threadId] = interaction.customId.split(":");
        if (!threadId) {
          return;
        }
        const channelId = interaction.values[0];
        if (!channelId) {
          return;
        }

        if (namespace === "ann" && action === "target-channel") {
          setAnnouncementDraftTargetChannel(threadId, interaction.user.id, channelId);
          await interaction.update({
            content: buildSchedulePrompt(channelId),
            components: buildAnnouncementSchedulePresetComponents(threadId)
          });
          return;
        }

        if (namespace !== "participants" || action !== "setup-post-channel") {
          return;
        }

        await interaction.deferUpdate();
        const member = await fetchGuildMember(interaction);
        const repos = createRepos(getDb());
        const service = new ParticipantsService(
          interaction.client,
          repos.participantsRepo,
          repos.eventsRepo,
          repos.rolesRepo,
          repos.settingsRepo
        );
        await service.setupPostChannel(member, threadId, channelId);
        const event = repos.eventsRepo.get(threadId);
        const panel = service.getPanel(threadId);
        await interaction.editReply({
          content: "設定完了。投稿数を参加者数としてカウントします。",
          embeds: event ? [buildParticipantsPanelEmbed(event, panel.config, panel.counts)] : [],
          components: buildParticipantsPanelComponents(threadId, panel.config)
        });
        return;
      }

      if (interaction.isModalSubmit()) {
        const parts = interaction.customId.split(":");
        const [namespace, action, threadId] = parts;
        if (!threadId) {
          return;
        }

        if (namespace === "admin") {
          assertOwner(interaction.user.id);
          await interaction.deferReply({ ephemeral: true });
          const repos = createRepos(getDb());
          const idsByAction: Record<string, SettingKey[]> = {
            "base-submit": ["guildId"],
            "channels1-submit": ["eventForum", "eventAnnounce", "internalAnnounce", "expenseLog"],
            "channels2-submit": ["minutes", "freeChat", "meetingVc"],
            "roles-submit": ["eventLeadRole", "eventerRole"]
          };
          const keys = action ? (idsByAction[action] ?? []) : [];
          if (keys.length === 0) {
            throw new Error("未知の管理パネル操作です。");
          }

          const values: Partial<Record<SettingKey, string>> = {};
          keys.forEach((key: SettingKey) => {
            values[key] = interaction.fields.getTextInputValue(key);
          });
          repos.settingsRepo.setMany(values, Math.floor(Date.now() / 1000));
          await interaction.editReply({
            content: "設定を保存しました。",
            embeds: [buildAdminPanelEmbed(repos.settingsRepo.all())],
            components: buildAdminPanelComponents()
          });
          return;
        }

        if (namespace === "role" && action === "add-submit") {
          await interaction.deferReply({ ephemeral: true });
          const label = normalizeRoleLabel(interaction.fields.getTextInputValue("role_label"));
          if (!label) {
            throw new Error("役割名を入力してください");
          }
          const roleKey = customRoleKey(label);
          await interaction.editReply({
            content: `${label}にするユーザーを選んでください。`,
            components: buildRoleAssignUserSelect(threadId, roleKey, label)
          });
          return;
        }

        if (namespace === "event" && action === "handover-submit") {
          await interaction.deferReply({ ephemeral: true });
          const rawRoleType = interaction.customId.split(":")[3];
          const rawUser = interaction.fields.getTextInputValue("new_user").trim();
          const pendingTasks = interaction.fields.getTextInputValue("pending_tasks").trim();
          const reason = interaction.fields.getTextInputValue("reason").trim();

          if (!rawRoleType) {
            throw new Error("未知の役割です。");
          }

          const newUserId = parseDiscordUserId(rawUser);
          if (!newUserId) {
            throw new Error("新担当は @ユーザー またはユーザーIDで入力してください。");
          }

          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new EventRolesService(
            interaction.client,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.seriesRepo,
            repos.settingsRepo
          );
          await service.handover(member, threadId, rawRoleType, newUserId, pendingTasks, reason);
          const handoverRoleLabel = parseRoleKey(rawRoleType).roleLabel ?? "主担当";
          await interaction.editReply({
            content: `${handoverRoleLabel} を <@${newUserId}> に引き継ぎました。`
          });
          return;
        }

        if (namespace === "event" && action === "schedule-submit") {
          await interaction.deferReply({ ephemeral: true });
          const scheduledAt = interaction.fields.getTextInputValue("scheduled_at");
          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new EventLifecycleService(
            interaction.client,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.seriesRepo,
            repos.jobsRepo,
            repos.timersRepo,
            repos.settingsRepo
          );
          const event = await service.setSchedule(member, threadId, scheduledAt);
          await interaction.editReply({
            content: `開催日時を ${event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定"} に設定しました。`
          });
          return;
        }

        if (namespace === "ann" && action === "custom-time-submit") {
          await interaction.deferReply({ ephemeral: true });
          const session = requireAnnouncementDraftSession(threadId, interaction.user.id);
          if (!session.threadId || !session.targetChannelId) {
            throw new Error("予約するイベントまたは投稿先チャンネルが未選択です。");
          }
          const scheduledAt = interaction.fields.getTextInputValue("scheduled_at");
          const scheduledUnix = jstDateTimeToUnix(scheduledAt);
          setAnnouncementScheduledAt(threadId, interaction.user.id, scheduledUnix);
          await interaction.editReply({
            content: buildAnnouncementParticipantsPrompt(session.targetChannelId, scheduledUnix),
            components: buildAnnouncementParticipantsConfirmComponents(threadId)
          });
          return;
        }

        if (namespace === "timer" && action === "setup-submit") {
          await interaction.deferReply({ ephemeral: true });
          const notifyInput = interaction.fields.getTextInputValue("notify_channel").trim();
          const mentionInput = interaction.fields.getTextInputValue("mention_role").trim();
          const preNoticeInput = interaction.fields.getTextInputValue("pre_notice_min").trim();
          const timetable = interaction.fields.getTextInputValue("timetable");

          const notifyChannel = notifyInput ? parseDiscordUserId(notifyInput) : null;
          const mentionRole = mentionInput ? parseDiscordUserId(mentionInput) : null;
          if (notifyInput && !notifyChannel) {
            throw new Error("通知先チャンネルは ID または #チャンネルで入力してください。");
          }
          if (mentionInput && !mentionRole) {
            throw new Error("メンション対象ロールは ID または @ロールで入力してください。");
          }

          const preNoticeMin = preNoticeInput ? Number(preNoticeInput) : 3;
          if (!Number.isInteger(preNoticeMin) || preNoticeMin < 0 || preNoticeMin > 60) {
            throw new Error("事前通知分は 0 から 60 の整数で入力してください。");
          }

          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new TimekeeperService(
            interaction.client,
            repos.timersRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.seriesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const schedule = service.setup(member, threadId, {
            notifyChannel,
            mentionRole,
            preNoticeMin,
            timetable
          });
          const event = repos.eventsRepo.get(threadId);
          const sections = repos.timersRepo.listSections(schedule.id);
          await interaction.editReply({
            content: "タイマーを設定しました。",
            embeds: event ? [buildTimerPanelEmbed(event, schedule, sections)] : [],
            components: buildTimerPanelComponents(threadId, schedule)
          });
          return;
        }

        if (namespace === "expense" && action === "new-submit") {
          await interaction.deferReply({ ephemeral: true });
          const rawCategory = interaction.customId.split(":")[3];
          const rawDirection = interaction.customId.split(":")[4];
          if (!rawCategory || !isExpenseCategory(rawCategory)) {
            throw new Error("未知の出費カテゴリです。");
          }
          if (!rawDirection || !isExpenseDirection(rawDirection)) {
            throw new Error("未知の出費方向です。");
          }
          const amount = interaction.fields.getTextInputValue("amount");
          const recipient = interaction.fields.getTextInputValue("recipient");
          const occurredMemo = interaction.fields.getTextInputValue("occurred_at_and_memo");
          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new ExpenseService(
            interaction.client,
            repos.expensesRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const expense = await service.create(member, threadId, {
            category: rawCategory,
            direction: rawDirection,
            amount,
            recipient,
            occurredMemo
          });
          const event = repos.eventsRepo.get(threadId);
          const panel = service.getPanel(threadId);
          await interaction.editReply({
            content: `出費 #${expense.id} を記録しました。5分以内に画像付きメッセージを投稿すると証明画像として紐付けます。`,
            embeds: event
              ? [
                  buildExpensePanelEmbed(
                    event,
                    panel.expenses,
                    panel.totalOut,
                    panel.totalIn,
                    panel.pendingProofCount
                  )
                ]
              : [],
            components: buildExpensePanelComponents(threadId)
          });
          return;
        }

        if (namespace === "todo" && action === "add-submit") {
          await interaction.deferReply({ ephemeral: true });
          const content = interaction.fields.getTextInputValue("content");
          const assignee = interaction.fields.getTextInputValue("assignee");
          const dueDate = interaction.fields.getTextInputValue("due_date");
          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new TodoService(
            interaction.client,
            repos.todosRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const todo = service.create(member, threadId, { content, assignee, dueDate });
          await interaction.editReply({
            embeds: [buildTodoDetailEmbed(todo)],
            components: buildTodoActions(threadId, todo)
          });
          return;
        }

        if (namespace === "todo" && action === "minutes-adopt-submit") {
          await interaction.deferReply({ ephemeral: true });
          const todoId = Number(interaction.customId.split(":")[3] ?? 0);
          if (!todoId) {
            throw new Error("ToDo 候補 ID が不正です。");
          }
          const content = interaction.fields.getTextInputValue("content");
          const assignee = interaction.fields.getTextInputValue("assignee");
          const dueDate = interaction.fields.getTextInputValue("due_date");
          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new TodoService(
            interaction.client,
            repos.todosRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const todo = service.adoptMinutesCandidate(member, todoId, threadId, {
            content,
            assignee,
            dueDate
          });
          await interaction.editReply({
            content: "議事録 ToDo 候補を採用しました。",
            embeds: [buildTodoDetailEmbed(todo)],
            components: buildTodoActions(threadId, todo)
          });
        }
      }
    } catch (error) {
      await replyError(interaction, error);
    }
  });
}

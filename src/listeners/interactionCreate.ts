import { Events, type Client, type Interaction } from "discord.js";
import { commandMap } from "../commands/index.js";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { AnnouncementService } from "../features/announcement/service.js";
import { EventLifecycleService } from "../features/event-lifecycle/service.js";
import { ExpenseService } from "../features/expense/service.js";
import { OverviewService } from "../features/overview/service.js";
import { ParticipantsService } from "../features/participants/service.js";
import { EventRolesService } from "../features/roles/service.js";
import { TodoService } from "../features/todo/service.js";
import { TimekeeperService } from "../features/timekeeper/service.js";
import { fetchGuildMember, PermissionError } from "../lib/permission.js";
import { parseDiscordUserId } from "../lib/parser.js";
import { formatJstDateTime } from "../lib/time.js";
import { logger } from "../lib/logger.js";
import {
  eventStatuses,
  expenseCategories,
  expenseDirections,
  roleTypes,
  type EventStatus,
  type ExpenseCategory,
  type ExpenseDirection,
  type ParticipantsMode,
  type RoleType,
  type SettingKey
} from "../types/index.js";
import {
  buildAnnouncementActions,
  buildAnnouncementPanelComponents,
  buildAdminPanelComponents,
  buildEventsOverviewComponents,
  buildExpenseCategorySelect,
  buildExpenseDirectionSelect,
  buildExpensePanelComponents,
  buildHandoverRoleSelect,
  buildMinutesTodoCandidateComponents,
  buildMinutesTodoReviewComponents,
  buildParticipantsModeSelect,
  buildParticipantsPanelComponents,
  buildRoleTypeSelect,
  buildRoleUserSelect,
  buildStatusSelect,
  buildTimerPanelComponents,
  buildTodoActions,
  buildTodoPanelComponents
} from "../ui/buttons.js";
import {
  buildAnnouncementPanelEmbed,
  buildAnnouncementPreviewEmbed,
  buildAdminPanelEmbed,
  buildEventsCalendarEmbed,
  buildEventsStatsEmbed,
  buildExpensePanelEmbed,
  buildMinutesTodoCandidateEmbed,
  buildMinutesTodoReviewEmbed,
  buildParticipantsPanelEmbed,
  buildRolePanelEmbed,
  buildTodoDetailEmbed,
  buildTodoPanelEmbed,
  buildTimerPanelEmbed
} from "../ui/embeds.js";
import {
  buildAnnouncementCreateModal,
  buildAnnouncementScheduleModal,
  buildAdminBaseModal,
  buildAdminChannels1Modal,
  buildAdminChannels2Modal,
  buildAdminRolesModal,
  buildEventScheduleModal,
  buildExpenseCreateModal,
  buildHandoverModal,
  buildMinutesTodoAdoptModal,
  buildParticipantsSetupModal,
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

function isParticipantsMode(value: string): value is ParticipantsMode {
  return value === "reaction" || value === "post";
}

function assertOwner(userId: string): void {
  if (userId !== config.ownerId) {
    throw new PermissionError("この管理パネルは OWNER_ID のユーザーのみ使えます。");
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
      if (interaction.isChatInputCommand()) {
        const command = commandMap.get(interaction.commandName);
        if (!command) {
          await interaction.reply({ content: "未登録のコマンドです。", ephemeral: true });
          return;
        }
        await command.execute(interaction);
        return;
      }

      if (interaction.isButton()) {
        const [namespace, action, threadId] = interaction.customId.split(":");
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

        if (namespace === "event") {
          const event = repos.eventsRepo.get(threadId);
          if (!event) {
            await interaction.reply({ content: "イベントが DB に見つかりません。", ephemeral: true });
            return;
          }

          if (action === "roles") {
            const roles = repos.rolesRepo.list(threadId);
            await interaction.reply({
              embeds: [buildRolePanelEmbed(event, roles)],
              components: buildRoleTypeSelect(threadId),
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
            await interaction.reply({
              content: "どの役割を引き継ぎますか？",
              components: buildHandoverRoleSelect(threadId),
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
              embeds: [buildAnnouncementPanelEmbed(event, announcements)],
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
                content: "参加者カウント方式を選んでください。",
                components: buildParticipantsModeSelect(threadId),
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
          const announcementId = Number(interaction.customId.split(":")[3] ?? 0);
          const service = new AnnouncementService(
            interaction.client,
            repos.announcementsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );

          if (action === "new") {
            await interaction.showModal(buildAnnouncementCreateModal(threadId));
            return;
          }

          if (!announcementId) {
            throw new Error("告知文 ID が不正です。");
          }

          if (action === "preview") {
            const announcement = repos.announcementsRepo.get(announcementId);
            if (!announcement) {
              throw new Error("告知文が DB に見つかりません。");
            }
            await interaction.reply({
              embeds: [buildAnnouncementPreviewEmbed(announcement)],
              ephemeral: true
            });
            return;
          }

          if (action === "post") {
            await interaction.deferReply({ ephemeral: true });
            const member = await fetchGuildMember(interaction);
            const posted = await service.postNow(member, announcementId);
            await interaction.editReply({
              content: `公式告知チャンネルへ転送しました。message_id=${posted.posted_msg_id}`
            });
            return;
          }

          if (action === "schedule") {
            await interaction.showModal(buildAnnouncementScheduleModal(threadId, announcementId));
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

          if (action === "next") {
            if (!scheduleId) {
              throw new Error("タイマー設定 ID が不正です。");
            }
            await interaction.deferReply({ ephemeral: true });
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
        }

        if (namespace === "participants") {
          const service = new ParticipantsService(
            interaction.client,
            repos.participantsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.settingsRepo
          );

          if (action === "setup") {
            await interaction.reply({
              content: "参加者カウント方式を選んでください。",
              components: buildParticipantsModeSelect(threadId),
              ephemeral: true
            });
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
        if (!threadId) {
          return;
        }

        const value = interaction.values[0];
        if (!value) {
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

        if (namespace === "participants" && action === "mode-select") {
          if (!isParticipantsMode(value)) {
            throw new Error("未知の参加者カウント方式です。");
          }
          await interaction.showModal(buildParticipantsSetupModal(threadId, value));
          return;
        }

        if (namespace === "ann" && action === "select") {
          const announcementId = Number(value);
          const announcement = repos.announcementsRepo.get(announcementId);
          if (!announcement) {
            throw new Error("告知文が DB に見つかりません。");
          }
          await interaction.update({
            embeds: [buildAnnouncementPreviewEmbed(announcement)],
            components: buildAnnouncementActions(threadId, announcement.id, Boolean(announcement.posted_at))
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

      if (interaction.isModalSubmit()) {
        const [namespace, action, threadId] = interaction.customId.split(":");
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

        if (namespace === "event" && action === "handover-submit") {
          await interaction.deferReply({ ephemeral: true });
          const rawRoleType = interaction.customId.split(":")[3];
          const rawUser = interaction.fields.getTextInputValue("new_user").trim();
          const pendingTasks = interaction.fields.getTextInputValue("pending_tasks").trim();
          const reason = interaction.fields.getTextInputValue("reason").trim();

          if (!rawRoleType || !isRoleType(rawRoleType)) {
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
          await interaction.editReply({
            content: `${roleLabels[rawRoleType]} を <@${newUserId}> に引き継ぎました。`
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
            repos.settingsRepo
          );
          const event = await service.setSchedule(member, threadId, scheduledAt);
          await interaction.editReply({
            content: `開催日時を ${event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定"} に設定しました。`
          });
          return;
        }

        if (namespace === "ann" && action === "create-submit") {
          await interaction.deferReply({ ephemeral: true });
          const body = interaction.fields.getTextInputValue("body");
          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new AnnouncementService(
            interaction.client,
            repos.announcementsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const announcement = service.createDraft(member, threadId, body);
          await interaction.editReply({
            embeds: [buildAnnouncementPreviewEmbed(announcement)],
            components: buildAnnouncementActions(threadId, announcement.id, false)
          });
          return;
        }

        if (namespace === "ann" && action === "schedule-submit") {
          await interaction.deferReply({ ephemeral: true });
          const announcementId = Number(interaction.customId.split(":")[3] ?? 0);
          if (!announcementId) {
            throw new Error("告知文 ID が不正です。");
          }
          const scheduledAt = interaction.fields.getTextInputValue("scheduled_at");
          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new AnnouncementService(
            interaction.client,
            repos.announcementsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.jobsRepo,
            repos.settingsRepo
          );
          const announcement = service.schedule(member, announcementId, scheduledAt);
          await interaction.editReply({
            embeds: [buildAnnouncementPreviewEmbed(announcement)],
            content: "告知文を予約しました。"
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

        if (namespace === "participants" && (action === "setup-reaction" || action === "setup-post")) {
          await interaction.deferReply({ ephemeral: true });
          const modeInput: ParticipantsMode = action === "setup-reaction" ? "reaction" : "post";
          const target = interaction.fields.getTextInputValue("target").trim();
          const emojis = modeInput === "reaction" ? interaction.fields.getTextInputValue("emojis").trim() : "";
          const deadline = interaction.fields.getTextInputValue("deadline").trim();

          if (modeInput === "reaction" && !emojis) {
            throw new Error("リアクション方式では絵文字設定が必要です。");
          }

          const member = await fetchGuildMember(interaction);
          const repos = createRepos(getDb());
          const service = new ParticipantsService(
            interaction.client,
            repos.participantsRepo,
            repos.eventsRepo,
            repos.rolesRepo,
            repos.settingsRepo
          );
          await service.setup(member, threadId, {
            mode: modeInput,
            target,
            emojis,
            deadline
          });
          const event = repos.eventsRepo.get(threadId);
          const panel = service.getPanel(threadId);
          await interaction.editReply({
            content: "参加者カウントを設定しました。",
            embeds: event ? [buildParticipantsPanelEmbed(event, panel.config, panel.counts)] : [],
            components: buildParticipantsPanelComponents(threadId, panel.config)
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

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder
} from "discord.js";
import {
  expenseCategories,
  expenseDirections,
  roleTypes,
  type AnnouncementRecord,
  type EventRecord,
  type EventStatus,
  type ExpenseCategory,
  type ExpenseDirection,
  type ExpenseRecord,
  type RoleSlot,
  type RoleType,
  type TodoRecord
} from "../types/index.js";
import type { ParticipantsConfigRecord } from "../types/index.js";
import type { TimerScheduleRecord } from "../types/index.js";
import {
  expenseCategoryLabels,
  expenseDirectionLabels,
  roleLabels,
  statusLabels
} from "./labels.js";
import { shiftMonthKey } from "../features/overview/calendar.js";
import { mainRoleKey, roleKeyFor, roleLabel } from "../db/repos/roles.js";
import { formatJstDateTime } from "../lib/time.js";

function selectText(value: string, maxLength: number): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return (trimmed || "(空)").slice(0, maxLength);
}

export function buildControlPanelComponents(
  event: EventRecord
): ActionRowBuilder<ButtonBuilder>[] {
  const isClosed = event.status === "done" || event.status === "cancelled";

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:roles:${event.thread_id}`)
        .setEmoji("👥")
        .setLabel("担当")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isClosed),
      new ButtonBuilder()
        .setCustomId(`event:status:${event.thread_id}`)
        .setEmoji("🔄")
        .setLabel("状態")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`event:schedule:${event.thread_id}`)
        .setEmoji("📅")
        .setLabel("日時")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed),
      new ButtonBuilder()
        .setCustomId(`event:handover:${event.thread_id}`)
        .setEmoji("🤝")
        .setLabel("引き継ぎ")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:announcements:${event.thread_id}`)
        .setEmoji("📢")
        .setLabel("告知文")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed),
      new ButtonBuilder()
        .setCustomId(`event:timer:${event.thread_id}`)
        .setEmoji("⏱️")
        .setLabel("タイマー")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed),
      new ButtonBuilder()
        .setCustomId(`event:participants:${event.thread_id}`)
        .setEmoji("👤")
        .setLabel("参加者")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed),
      new ButtonBuilder()
        .setCustomId(`event:todos:${event.thread_id}`)
        .setEmoji("✅")
        .setLabel("ToDo")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed),
      new ButtonBuilder()
        .setCustomId(`event:expenses:${event.thread_id}`)
        .setEmoji("💰")
        .setLabel("出費")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:more:${event.thread_id}`)
        .setEmoji("⚙️")
        .setLabel("その他")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function allowedStatusTransitions(status: EventStatus): EventStatus[] {
  switch (status) {
    case "planning":
      return ["announcing", "cancelled"];
    case "announcing":
      return ["announced", "cancelled"];
    case "announced":
    case "in_progress":
      return ["done", "cancelled"];
    case "done":
    case "cancelled":
      return [];
  }
}

export function rollbackStatusTarget(status: EventStatus): EventStatus | null {
  switch (status) {
    case "announced":
      return "announcing";
    case "announcing":
      return "planning";
    case "in_progress":
      return "announced";
    case "done":
      return "announced";
    case "cancelled":
      return "planning";
    case "planning":
      return null;
  }
}

export function buildStatusSelect(
  event: EventRecord
): Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> {
  const transitions = allowedStatusTransitions(event.status);
  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [];

  if (transitions.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`event:status-select:${event.thread_id}`)
          .setPlaceholder("変更後の状態")
          .addOptions(
            transitions.map((status) => ({
              label: statusLabels[status],
              value: status,
              description: `${statusLabels[event.status]} から ${statusLabels[status]} へ変更`
            }))
          )
      )
    );
  }

  const rollback = rollbackStatusTarget(event.status);
  if (rollback) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`event:rollback:${event.thread_id}`)
          .setEmoji("↩️")
          .setLabel(`1つ前に戻す (${statusLabels[rollback]})`.slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
      )
    );
  }

  return rows;
}

export function buildEventMoreComponents(threadId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:delete-choice:${threadId}:data`)
        .setLabel("削除する (データのみ)")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`event:delete-choice:${threadId}:thread`)
        .setLabel("削除する (スレッドごと)")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`event:delete-cancel:${threadId}`)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildEventDeleteConfirmComponents(
  threadId: string,
  mode: "data" | "thread"
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:delete-confirm:${threadId}:${mode}`)
        .setLabel("はい、削除します")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`event:delete-cancel:${threadId}`)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildStatusRollbackConfirmComponents(threadId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`event:rollback-confirm:${threadId}`)
        .setLabel("戻す")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`event:rollback-cancel:${threadId}`)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildParticipantsPanelComponents(
  threadId: string,
  config: ParticipantsConfigRecord | null
): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`participants:setup:${threadId}`)
      .setEmoji(config ? "🔁" : "➕")
      .setLabel(config ? "再設定" : "設定")
      .setStyle(config ? ButtonStyle.Secondary : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`participants:refresh:${threadId}`)
      .setEmoji("🔄")
      .setLabel("再集計")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!config)
  );

  if (config) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`participants:clear:${threadId}`)
        .setEmoji("🧹")
        .setLabel("設定を解除")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`participants:change-target:${threadId}`)
        .setLabel("対象を変更")
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return [row];
}

export function buildParticipantsClearConfirmComponents(threadId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`participants:clear-confirm:${threadId}`)
        .setLabel("解除する")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`participants:clear-cancel:${threadId}`)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildExpensePanelComponents(
  threadId: string,
  expenses: ExpenseRecord[] = []
): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const rows: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`expense:new:${threadId}`)
        .setEmoji("➕")
        .setLabel("記録追加")
        .setStyle(ButtonStyle.Primary)
    )
  ];

  const activeExpenses = expenses.filter((expense) => !expense.voided);
  if (activeExpenses.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`expense:select:${threadId}`)
          .setPlaceholder("訂正・取り消しする記録を選択")
          .addOptions(
            activeExpenses.slice(0, 25).map((expense) => ({
              label: `#${expense.id} ${expense.amount.toLocaleString("ja-JP")} Land`.slice(0, 100),
              value: String(expense.id),
              description: selectText(expense.memo ?? "用途メモなし", 80)
            }))
          )
      )
    );
  }

  return rows;
}

export function buildExpenseActions(threadId: string, expense: ExpenseRecord): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`expense:correct:${threadId}:${expense.id}`)
        .setEmoji("✏️")
        .setLabel("訂正")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(Boolean(expense.voided)),
      new ButtonBuilder()
        .setCustomId(`expense:void:${threadId}:${expense.id}`)
        .setEmoji("🗑️")
        .setLabel("取り消し")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(Boolean(expense.voided))
    )
  ];
}

export function buildExpenseVoidConfirmComponents(
  threadId: string,
  expenseId: number
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`expense:void-confirm:${threadId}:${expenseId}`)
        .setLabel("取り消す")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`expense:void-cancel:${threadId}`)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildExpenseCategorySelect(threadId: string): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`expense:new-category:${threadId}`)
        .setPlaceholder("出費カテゴリを選択")
        .addOptions(
          ...expenseCategories.map((category) => ({
            label: expenseCategoryLabels[category] ?? category,
            value: category
          })),
          {
            label: "補填・返金",
            value: "reimbursement",
            description: "入金として記録"
          }
        )
    )
  ];
}

export function buildExpenseProofEventSelect(
  targetChannelId: string,
  targetMessageId: string,
  events: EventRecord[],
  includeExternal: boolean
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const options: Array<{ label: string; value: string; description?: string }> = events.slice(0, includeExternal ? 24 : 25).map((event) => ({
    label: event.title.slice(0, 100),
    value: event.thread_id,
    description: event.scheduled_at
      ? `開催 ${formatJstDateTime(event.scheduled_at)}`.slice(0, 100)
      : "開催日時未定"
  }));

  if (includeExternal) {
    options.push({
      label: "イベント外の出費",
      value: "external",
      description: "イベントに紐付けず記録"
    });
  }

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`expense:proof-event:${targetChannelId}:${targetMessageId}`)
        .setPlaceholder("紐付けるイベントを選択")
        .addOptions(options)
    )
  ];
}

export function buildExpenseProofCategorySelect(
  threadKey: string,
  targetChannelId: string,
  targetMessageId: string
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`expense:proof-category:${threadKey}:${targetChannelId}:${targetMessageId}`)
        .setPlaceholder("出費カテゴリを選択")
        .addOptions(
          ...expenseCategories.map((category) => ({
            label: expenseCategoryLabels[category] ?? category,
            value: category
          })),
          {
            label: "補填・返金",
            value: "reimbursement",
            description: "入金として記録"
          }
        )
    )
  ];
}

export function buildExpenseProofRecipientSelect(
  sessionId: string
): Array<ActionRowBuilder<UserSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`expense:proof-recipient:${sessionId}`)
        .setPlaceholder("対象者を選択")
        .setMinValues(1)
        .setMaxValues(1)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`expense:proof-skip:${sessionId}`)
        .setLabel("対象者なしで保存")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function expenseCategoryChoiceToCategoryDirection(value: string): {
  category: ExpenseCategory;
  direction: ExpenseDirection;
} | null {
  if (value === "reimbursement") {
    return { category: "other", direction: "in" };
  }
  if ((expenseCategories as readonly string[]).includes(value)) {
    return { category: value as ExpenseCategory, direction: "out" };
  }
  return null;
}

export function buildRoleTypeSelect(threadId: string): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`event:role-type:${threadId}`)
        .setPlaceholder("変更する担当")
        .addOptions(
          roleTypes.map((roleType) => ({
            label: roleLabels[roleType] ?? roleType,
            value: roleType
          }))
        )
    )
  ];
}

export function buildHandoverRoleSelect(threadId: string): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`event:handover-role:${threadId}`)
        .setPlaceholder("引き継ぐ役割を選択")
        .addOptions(
          roleTypes.map((roleType) => ({
            label: roleLabels[roleType] ?? roleType,
            value: roleType
          }))
        )
    )
  ];
}

export function buildRoleUserSelect(
  threadId: string,
  roleType: RoleType
): ActionRowBuilder<UserSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`event:role-user:${threadId}:${roleType}`)
        .setPlaceholder(`${roleLabels[roleType] ?? roleType}にするユーザー`)
        .setMinValues(1)
        .setMaxValues(1)
    )
  ];
}

export function buildRolePanelComponents(
  threadId: string,
  roles: RoleSlot[]
): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const rows: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [];
  const main = roles.find((role) => role.role_kind === "main" || role.role_type === mainRoleKey);
  const custom = roles.filter((role) => role.role_kind !== "main" && role.role_type !== mainRoleKey);
  const deletable = custom.filter((role) => role.user_id);

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`role:change-main:${threadId}`)
        .setLabel("主担当を変更")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!main)
    )
  );

  if (custom.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`role:change-select:${threadId}`)
          .setPlaceholder("変更する役割を選択")
          .addOptions(
            custom.slice(0, 25).map((role) => ({
              label: roleLabel(role).slice(0, 100),
              value: roleKeyFor(role),
              description: role.user_id ? `<@${role.user_id}>` : "未設定"
            }))
          )
      )
    );
  }

  if (deletable.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`role:delete-select:${threadId}`)
          .setPlaceholder("削除する役割を選択")
          .addOptions(
            deletable.slice(0, 25).map((role) => ({
              label: roleLabel(role).slice(0, 100),
              value: roleKeyFor(role),
              description: role.user_id ? `<@${role.user_id}>` : "未設定"
            }))
          )
      )
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`role:add:${threadId}`)
        .setLabel("役割を追加")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`role:bulk:${threadId}`)
        .setLabel("まとめて設定")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`role:handover:${threadId}`)
        .setLabel("引き継ぎ")
        .setStyle(ButtonStyle.Secondary)
    )
  );

  return rows.slice(0, 5);
}

export function buildRoleBulkComponents(
  threadId: string,
  roles: RoleSlot[],
  selections: Record<string, string | null>,
  page: number
): Array<ActionRowBuilder<UserSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> {
  const pageSize = 4;
  const maxPage = Math.max(0, Math.ceil(roles.length / pageSize) - 1);
  const currentPage = Math.min(Math.max(page, 0), maxPage);
  const visibleRoles = roles.slice(currentPage * pageSize, currentPage * pageSize + pageSize);
  const rows: Array<ActionRowBuilder<UserSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> =
    visibleRoles.map((role) => {
      const roleKey = roleKeyFor(role);
      const selected = selections[roleKey] ?? role.user_id ?? null;
      const menu = new UserSelectMenuBuilder()
        .setCustomId(`role:bulk-select:${threadId}:${roleKey}`)
        .setPlaceholder(`${roleLabel(role)}を選択`.slice(0, 100))
        .setMinValues(1)
        .setMaxValues(1);

      if (selected) {
        menu.setDefaultUsers(selected);
      }

      return new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(menu);
    });

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`role:bulk-page:${threadId}:prev`)
        .setLabel("前へ")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage <= 0),
      new ButtonBuilder()
        .setCustomId(`role:bulk-confirm:${threadId}`)
        .setLabel("確定")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`role:bulk-page:${threadId}:next`)
        .setLabel("次へ")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(currentPage >= maxPage)
    )
  );

  return rows;
}

export function buildRoleAssignUserSelect(
  threadId: string,
  roleKey: string,
  label: string
): ActionRowBuilder<UserSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<UserSelectMenuBuilder>().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId(`role:assign:${threadId}:${roleKey}`)
        .setPlaceholder(`${label}にするユーザー`.slice(0, 100))
        .setMinValues(1)
        .setMaxValues(1)
    )
  ];
}

export function buildRoleHandoverSelect(
  threadId: string,
  roles: RoleSlot[]
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`role:handover-select:${threadId}`)
        .setPlaceholder("引き継ぐ役割を選択")
        .addOptions(
          roles.slice(0, 25).map((role) => ({
            label: roleLabel(role).slice(0, 100),
            value: roleKeyFor(role),
            description: role.user_id ? `<@${role.user_id}>` : "未設定"
          }))
        )
    )
  ];
}

export function buildRoleDeleteConfirm(
  threadId: string,
  roleKey: string,
  label: string
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`role:delete-confirm:${threadId}:${roleKey}`)
        .setLabel(`${label}を削除`.slice(0, 80))
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`role:delete-cancel:${threadId}`)
        .setLabel("キャンセル")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildAnnouncementPanelComponents(
  threadId: string,
  announcements: AnnouncementRecord[]
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const scheduled = announcements.filter((announcement) => announcement.scheduled_at && !announcement.posted_at);

  if (scheduled.length === 0) {
    return [];
  }

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ann:cancel-select:${threadId}`)
        .setPlaceholder("取り消す予約を選択")
        .addOptions(
          scheduled.slice(0, 25).map((announcement) => ({
            label: `予約 ${formatJstDateTime(announcement.scheduled_at ?? 0)}`.slice(0, 100),
            value: String(announcement.id),
            description: selectText(announcement.body, 80)
          }))
        )
    )
  ];
}

export function buildAnnouncementTargetEventSelect(
  sessionId: string,
  events: EventRecord[]
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`ann:target-event:${sessionId}`)
        .setPlaceholder("紐付けるイベントを選択")
        .addOptions(
          events.slice(0, 25).map((event) => ({
            label: selectText(event.title, 90),
            value: event.thread_id,
            description: selectText(
              `${statusLabels[event.status]} / ${event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "開催日時未定"}`,
              100
            )
          }))
        )
    )
  ];
}

export function buildAnnouncementTargetChannelSelect(sessionId: string): ActionRowBuilder<ChannelSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`ann:target-channel:${sessionId}`)
        .setPlaceholder("投稿先チャンネルを選択")
        .setChannelTypes(
          ChannelType.GuildText,
          ChannelType.GuildAnnouncement,
          ChannelType.PublicThread,
          ChannelType.PrivateThread
        )
        .setMinValues(1)
        .setMaxValues(1)
    )
  ];
}

export function buildAnnouncementSchedulePresetComponents(sessionId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ann:preset:${sessionId}:now`)
        .setLabel("今すぐ")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("📣"),
      new ButtonBuilder()
        .setCustomId(`ann:preset:${sessionId}:1h`)
        .setLabel("1時間後")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⏱️"),
      new ButtonBuilder()
        .setCustomId(`ann:preset:${sessionId}:21`)
        .setLabel("今夜21時")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🌙"),
      new ButtonBuilder()
        .setCustomId(`ann:custom-time:${sessionId}`)
        .setLabel("日時指定")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📅")
    )
  ];
}

export function buildAnnouncementParticipantsConfirmComponents(sessionId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ann:participants:${sessionId}:yes`)
        .setLabel("はい、対象にする")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ann:participants:${sessionId}:no`)
        .setLabel("いいえ")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildTimerPanelComponents(
  threadId: string,
  schedule: TimerScheduleRecord | null
): ActionRowBuilder<ButtonBuilder>[] {
  if (!schedule) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`timer:setup:${threadId}`)
          .setEmoji("➕")
          .setLabel("新規セットアップ")
          .setStyle(ButtonStyle.Primary)
      )
    ];
  }

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`timer:next:${threadId}:${schedule.id}`)
        .setEmoji("⏭️")
        .setLabel(schedule.state === "idle" ? "開始" : "次へ")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(schedule.state === "finished"),
      new ButtonBuilder()
        .setCustomId(`timer:setup:${threadId}`)
        .setEmoji("🔁")
        .setLabel("再セットアップ")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildTimerNotificationComponents(
  threadId: string,
  scheduleId: number,
  isLastSection: boolean,
  disabled = false
): ActionRowBuilder<ButtonBuilder>[] {
  const actionButton = isLastSection
    ? new ButtonBuilder()
        .setCustomId(`timer:finish:${threadId}:${scheduleId}:notice`)
        .setEmoji("✅")
        .setLabel("タイムキーパー終了")
        .setStyle(ButtonStyle.Success)
    : new ButtonBuilder()
        .setCustomId(`timer:next:${threadId}:${scheduleId}:notice`)
        .setEmoji("▶️")
        .setLabel("次のセクションへ")
        .setStyle(ButtonStyle.Primary);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      actionButton.setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`timer:panel:${threadId}:${scheduleId}:notice`)
        .setEmoji("⏸")
        .setLabel("タイマー確認")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled)
    )
  ];
}

export function buildParticipantsSetupGuideComponents(threadId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`participants:setup-post:${threadId}`)
        .setLabel("投稿方式に切り替え")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildParticipantsPostChannelSelect(threadId: string): ActionRowBuilder<ChannelSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(`participants:setup-post-channel:${threadId}`)
        .setPlaceholder("投稿数を数えるチャンネル/スレッドを選択")
        .setChannelTypes(ChannelType.GuildText, ChannelType.PublicThread, ChannelType.PrivateThread)
        .setMinValues(1)
        .setMaxValues(1)
    )
  ];
}

export function buildTodoPanelComponents(
  threadId: string,
  todos: TodoRecord[]
): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const rows: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`todo:add:${threadId}`)
        .setEmoji("➕")
        .setLabel("追加")
        .setStyle(ButtonStyle.Primary)
    )
  ];

  if (todos.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`todo:select:${threadId}`)
          .setPlaceholder("操作する ToDo")
          .addOptions(
            todos.slice(0, 25).map((todo) => ({
              label: `#${todo.id} ${todo.status === "done" ? "完了" : "未完了"}`,
              value: String(todo.id),
              description: todo.content.slice(0, 80)
            }))
          )
      )
    );
  }

  return rows;
}

export function buildTodoActions(threadId: string, todo: TodoRecord): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`todo:toggle:${threadId}:${todo.id}`)
        .setEmoji(todo.status === "done" ? "↩️" : "✅")
        .setLabel(todo.status === "done" ? "未完了に戻す" : "完了")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`todo:delete:${threadId}:${todo.id}`)
        .setEmoji("🗑️")
        .setLabel("削除")
        .setStyle(ButtonStyle.Danger)
    )
  ];
}

export function buildMinutesTodoNoticeComponents(sourceMsgId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`todo:minutes:${sourceMsgId}`)
        .setEmoji("🧭")
        .setLabel("振り分け開始")
        .setStyle(ButtonStyle.Primary)
    )
  ];
}

export function buildMinutesTodoReviewComponents(
  sourceMsgId: string,
  candidates: TodoRecord[]
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  if (candidates.length === 0) {
    return [];
  }

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`todo:minutes-candidate:${sourceMsgId}`)
        .setPlaceholder("振り分ける候補")
        .addOptions(
          candidates.slice(0, 25).map((todo) => ({
            label: `#${todo.id}`,
            value: String(todo.id),
            description: selectText(todo.content, 80)
          }))
        )
    )
  ];
}

export function buildMinutesTodoCandidateComponents(
  sourceMsgId: string,
  todo: TodoRecord,
  events: EventRecord[]
): Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> {
  const rows: Array<ActionRowBuilder<StringSelectMenuBuilder> | ActionRowBuilder<ButtonBuilder>> = [];

  if (events.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`todo:minutes-event:${todo.id}`)
          .setPlaceholder("紐付けるイベント")
          .addOptions(
            events.slice(0, 25).map((event) => ({
              label: selectText(event.title, 90),
              value: event.thread_id,
              description: selectText(
                `${statusLabels[event.status]} / ${event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "開催日時未定"}`,
                100
              )
            }))
          )
      )
    );
  }

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`todo:minutes-discard:${sourceMsgId}:${todo.id}`)
        .setEmoji("🗑️")
        .setLabel("破棄")
        .setStyle(ButtonStyle.Danger)
    )
  );

  return rows;
}

export function buildExpenseDirectionSelect(
  threadId: string,
  category: string
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`expense:new-direction:${threadId}:${category}`)
        .setPlaceholder("出費か補填・返金かを選択")
        .addOptions(
          expenseDirections.map((direction) => ({
            label: expenseDirectionLabels[direction] ?? direction,
            value: direction,
            default: direction === "out"
          }))
        )
    )
  ];
}

export function buildEventsOverviewComponents(monthKey: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`events:calendar:${monthKey}`)
        .setEmoji("📅")
        .setLabel("カレンダー")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`events:stats:${monthKey}`)
        .setEmoji("📊")
        .setLabel("統計")
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`events:calendar:${shiftMonthKey(monthKey, -1)}`)
        .setEmoji("◀️")
        .setLabel("前月")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`events:calendar:${shiftMonthKey(monthKey, 1)}`)
        .setEmoji("▶️")
        .setLabel("来月")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildAdminPanelComponents(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("admin:base:panel")
        .setEmoji("🏠")
        .setLabel("基本")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("admin:channels1:panel")
        .setEmoji("📺")
        .setLabel("チャンネル1")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("admin:channels2:panel")
        .setEmoji("📺")
        .setLabel("チャンネル2")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("admin:roles:panel")
        .setEmoji("🛡️")
        .setLabel("ロール")
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

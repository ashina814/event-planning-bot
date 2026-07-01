import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder
} from "discord.js";
import type { AnnouncementRecord, EventRecord, EventStatus, RoleType, TodoRecord } from "../types/index.js";
import type { ParticipantsConfigRecord } from "../types/index.js";
import type { TimerScheduleRecord } from "../types/index.js";
import { roleLabels, statusLabels } from "./labels.js";
import { shiftMonthKey } from "../features/overview/calendar.js";

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
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isClosed),
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

export function buildStatusSelect(
  event: EventRecord
): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const transitions = allowedStatusTransitions(event.status);
  if (transitions.length === 0) {
    return [];
  }

  return [
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
  ];
}

export function buildRoleTypeSelect(threadId: string): ActionRowBuilder<StringSelectMenuBuilder>[] {
  const roleTypes: RoleType[] = ["main", "mc", "announce", "record", "prize", "support"];
  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`event:role-type:${threadId}`)
        .setPlaceholder("変更する担当")
        .addOptions(
          roleTypes.map((roleType) => ({
            label: roleLabels[roleType],
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
        .setPlaceholder(`${roleLabels[roleType]}にするユーザー`)
        .setMinValues(1)
        .setMaxValues(1)
    )
  ];
}

export function buildAnnouncementPanelComponents(
  threadId: string,
  announcements: AnnouncementRecord[]
): Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> {
  const rows: Array<ActionRowBuilder<ButtonBuilder> | ActionRowBuilder<StringSelectMenuBuilder>> = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ann:new:${threadId}`)
        .setEmoji("➕")
        .setLabel("新規作成")
        .setStyle(ButtonStyle.Primary)
    )
  ];

  if (announcements.length > 0) {
    rows.push(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`ann:select:${threadId}`)
          .setPlaceholder("操作する告知文")
          .addOptions(
            announcements.slice(0, 25).map((announcement, index) => ({
              label: announcement.posted_at
                ? `v${announcements.length - index} 転送済`
                : announcement.scheduled_at
                  ? `v${announcements.length - index} 予約済`
                  : `v${announcements.length - index} 下書き`,
              value: String(announcement.id),
              description: announcement.body.replace(/\s+/g, " ").trim().slice(0, 80) || "(本文なし)"
            }))
          )
      )
    );
  }

  return rows;
}

export function buildAnnouncementActions(
  threadId: string,
  announcementId: number,
  posted: boolean
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`ann:preview:${threadId}:${announcementId}`)
        .setEmoji("👁️")
        .setLabel("プレビュー")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`ann:post:${threadId}:${announcementId}`)
        .setEmoji("📣")
        .setLabel("今すぐ転送")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(posted),
      new ButtonBuilder()
        .setCustomId(`ann:schedule:${threadId}:${announcementId}`)
        .setEmoji("⏱️")
        .setLabel("予約")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(posted)
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

export function buildParticipantsPanelComponents(
  threadId: string,
  config: ParticipantsConfigRecord | null
): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
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
              description: selectText(event.thread_id, 100)
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

export function buildExpensePanelComponents(threadId: string): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`expense:new:${threadId}`)
        .setEmoji("➕")
        .setLabel("記録追加")
        .setStyle(ButtonStyle.Primary)
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

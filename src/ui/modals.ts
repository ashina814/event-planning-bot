import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { BotSettings, ExpenseCategory, ExpenseDirection, ExpenseRecord, TodoRecord } from "../types/index.js";

export function buildHandoverModal(threadId: string, roleType: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`event:handover-submit:${threadId}:${roleType}`)
    .setTitle("引き継ぎ宣言")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("new_user")
          .setLabel("新担当")
          .setPlaceholder("@ユーザー または ユーザーID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("pending_tasks")
          .setLabel("残タスク")
          .setPlaceholder("ここから引き継ぐ作業")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("reason")
          .setLabel("理由")
          .setPlaceholder("任意")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

export function buildRoleAddModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`role:add-submit:${threadId}`)
    .setTitle("役割を追加")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("role_label")
          .setLabel("役割名")
          .setPlaceholder("例: 司会・進行 / 告知担当 / 賞金・景品対応")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(15)
      )
    );
}

export function buildEventScheduleModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`event:schedule-submit:${threadId}`)
    .setTitle("開催日時設定")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("scheduled_at")
          .setLabel("開催日時")
          .setPlaceholder("例: 明日 22:00 / 6/29 22:00 / 2026-06-29 22:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

function settingInput(customId: string, label: string, value: string | undefined, required = false): TextInputBuilder {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(TextInputStyle.Short)
    .setRequired(required);
  if (value) {
    input.setValue(value);
  }
  return input;
}

export function buildAdminBaseModal(settings: BotSettings): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("admin:base-submit:panel")
    .setTitle("管理パネル 基本")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("guildId", "Guild ID", settings.guildId, true)
      )
    );
}

export function buildAdminChannels1Modal(settings: BotSettings): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("admin:channels1-submit:panel")
    .setTitle("管理パネル チャンネル1")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("eventForum", "イベントフォーラム", settings.eventForum, true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("eventAnnounce", "公式告知", settings.eventAnnounce)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("internalAnnounce", "内部お知らせ", settings.internalAnnounce)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("expenseLog", "出費ログ", settings.expenseLog)
      )
    );
}

export function buildAdminChannels2Modal(settings: BotSettings): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("admin:channels2-submit:panel")
    .setTitle("管理パネル チャンネル2")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("minutes", "議事録", settings.minutes)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("freeChat", "自由チャット", settings.freeChat)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("meetingVc", "会議VC", settings.meetingVc)
      )
    );
}

export function buildAdminRolesModal(settings: BotSettings): ModalBuilder {
  return new ModalBuilder()
    .setCustomId("admin:roles-submit:panel")
    .setTitle("管理パネル ロール")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("eventLeadRole", "イベント統括ロール", settings.eventLeadRole, true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        settingInput("eventerRole", "イベンターロール", settings.eventerRole, true)
      )
    );
}

export function buildAnnouncementCustomTimeModal(sessionId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ann:custom-time-submit:${sessionId}`)
    .setTitle("告知文 予約投稿")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("scheduled_at")
          .setLabel("投稿日時")
          .setPlaceholder("例: 明日 22:00 / 6/29 22:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

export function buildTimerSetupModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`timer:setup-submit:${threadId}`)
    .setTitle("タイマー セットアップ")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("notify_channel")
          .setLabel("通知先チャンネル")
          .setPlaceholder("空ならイベントスレッド。チャンネルIDまたは #チャンネル")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("mention_role")
          .setLabel("メンション対象ロール")
          .setPlaceholder("空なら主担当。ロールIDまたは @ロール")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("pre_notice_min")
          .setLabel("事前通知分")
          .setPlaceholder("3")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("timetable")
          .setLabel("タイムテーブル")
          .setPlaceholder("22:00 集合\n22:05 告知\n22:15 自己紹介")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(2000)
      )
    );
}

export function buildTodoAddModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`todo:add-submit:${threadId}`)
    .setTitle("ToDo 追加")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel("内容")
          .setPlaceholder("やること")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("assignee")
          .setLabel("担当者")
          .setPlaceholder("任意。@ユーザー または ユーザーID")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("due_date")
          .setLabel("期限")
          .setPlaceholder("任意。例: 明日 / 6/29 / 6/29 18:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

export function buildMinutesTodoAdoptModal(threadId: string, todo: TodoRecord): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`todo:minutes-adopt-submit:${threadId}:${todo.id}`)
    .setTitle("議事録 ToDo 採用")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("content")
          .setLabel("内容")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setValue(todo.content.slice(0, 1000))
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("assignee")
          .setLabel("担当者")
          .setPlaceholder("任意。@ユーザー または ユーザーID")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("due_date")
          .setLabel("期限")
          .setPlaceholder("任意。例: 明日 / 6/29 / 6/29 18:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

export function buildExpenseCreateModal(
  threadId: string,
  category: ExpenseCategory,
  direction: ExpenseDirection
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`expense:new-submit:${threadId}:${category}:${direction}`)
    .setTitle("出費記録")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("金額 Land")
          .setPlaceholder("例: 18000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("recipient")
          .setLabel("対象者")
          .setPlaceholder("任意。@ユーザー または ユーザーID")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("occurred_at_and_memo")
          .setLabel("発生日とメモ")
          .setPlaceholder("1行目: 発生日 (例: 今日 / 6/29 / 2026-06-29)\n2行目以降: 用途メモ")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
      )
    );
}

export function buildExpenseProofModal(
  threadKey: string,
  targetChannelId: string,
  targetMessageId: string,
  category: ExpenseCategory,
  direction: ExpenseDirection
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`expense:proof-submit:${threadKey}:${targetChannelId}:${targetMessageId}:${category}:${direction}`)
    .setTitle("出費記録")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("金額 Land")
          .setPlaceholder("例: 18000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("memo")
          .setLabel("メモ")
          .setPlaceholder("任意。用途や補足")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
      )
    );
}

export function buildExpenseCorrectModal(threadId: string, expense: ExpenseRecord): ModalBuilder {
  const recipientInput = new TextInputBuilder()
    .setCustomId("recipient")
    .setLabel("訂正後の対象者")
    .setPlaceholder("任意。@ユーザー または ユーザーID")
    .setStyle(TextInputStyle.Short)
    .setRequired(false);
  if (expense.recipient_id) {
    recipientInput.setValue(expense.recipient_id);
  }

  const memoInput = new TextInputBuilder()
    .setCustomId("memo")
    .setLabel("訂正後のメモ")
    .setPlaceholder("任意")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(1000);
  if (expense.memo) {
    memoInput.setValue(expense.memo.slice(0, 1000));
  }

  return new ModalBuilder()
    .setCustomId(`expense:correct-submit:${threadId}:${expense.id}`)
    .setTitle(`出費 #${expense.id} 訂正`)
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("訂正後の金額 Land")
          .setPlaceholder("例: 18000")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(expense.amount))
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        recipientInput
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        memoInput
      )
    );
}

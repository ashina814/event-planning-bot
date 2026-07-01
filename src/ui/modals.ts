import {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from "discord.js";
import type { TodoRecord } from "../types/index.js";

export function buildHandoverModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`event:handover-submit:${threadId}`)
    .setTitle("引き継ぎ宣言")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("role_type")
          .setLabel("役割")
          .setPlaceholder("main / mc / announce / record / prize / support")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
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

export function buildEventScheduleModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`event:schedule-submit:${threadId}`)
    .setTitle("開催日時設定")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("scheduled_at")
          .setLabel("開催日時 JST")
          .setPlaceholder("2026-07-01 22:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

export function buildAnnouncementCreateModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ann:create-submit:${threadId}`)
    .setTitle("告知文 新規作成")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("body")
          .setLabel("本文")
          .setPlaceholder("Discord 記法や外部絵文字を含めて、そのまま投稿されます。")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(4000)
      )
    );
}

export function buildAnnouncementScheduleModal(
  threadId: string,
  announcementId: number
): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`ann:schedule-submit:${threadId}:${announcementId}`)
    .setTitle("告知文 予約投稿")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("scheduled_at")
          .setLabel("投稿日時 JST")
          .setPlaceholder("2026-07-01 22:00")
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

export function buildParticipantsSetupModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`participants:setup-submit:${threadId}`)
    .setTitle("参加者カウント設定")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("mode")
          .setLabel("方式")
          .setPlaceholder("reaction または post")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("target")
          .setLabel("対象")
          .setPlaceholder("リアクション: メッセージURL / 投稿: チャンネル・スレッドID")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("emojis")
          .setLabel("絵文字設定")
          .setPlaceholder("reactionのみ 例: ⭕:参加,✨:興味,❌:不参加")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("deadline")
          .setLabel("締切 JST")
          .setPlaceholder("空なら開催日時。例: 2026-07-01 22:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
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
          .setLabel("期限 JST")
          .setPlaceholder("任意。2026-07-01 または 2026-07-01 18:00")
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
          .setLabel("期限 JST")
          .setPlaceholder("任意。2026-07-01 または 2026-07-01 18:00")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

export function buildExpenseCreateModal(threadId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`expense:create-submit:${threadId}`)
    .setTitle("出費記録")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("category")
          .setLabel("カテゴリ")
          .setPlaceholder("prize / gift / operation / other")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("direction")
          .setLabel("方向")
          .setPlaceholder("out または in")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue("out")
      ),
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
          .setCustomId("occurred_memo")
          .setLabel("発生日とメモ")
          .setPlaceholder("1行目: 2026-07-01\n2行目以降: 用途メモ")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(1000)
      )
    );
}

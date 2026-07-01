import { EmbedBuilder } from "discord.js";
import { renderMonthCalendar } from "../features/overview/calendar.js";
import type { OverviewStats } from "../features/overview/service.js";
import { formatJstDateTime, formatJstTime } from "../lib/time.js";
import type {
  AnnouncementRecord,
  BotSettings,
  EventRecord,
  EventRoleRecord,
  ExpenseRecord,
  ParticipantsConfigRecord,
  ParticipantsCountRecord,
  SeriesRecord,
  TodoRecord,
  TimerScheduleRecord,
  TimerSectionRecord
} from "../types/index.js";
import { mentionUser, roleLabels, statusLabels } from "./labels.js";

function roleUser(roles: EventRoleRecord[], roleType: EventRoleRecord["role_type"]): string {
  return mentionUser(roles.find((role) => role.role_type === roleType)?.user_id);
}

export function buildControlPanelEmbed(
  event: EventRecord,
  roles: EventRoleRecord[],
  series: SeriesRecord | null
): EmbedBuilder {
  const scheduled = event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定";
  const seriesName = series?.name ?? "単発";
  const isClosed = event.status === "done" || event.status === "cancelled";

  return new EmbedBuilder()
    .setTitle(`${isClosed ? "📁 " : ""}${event.title}`)
    .setDescription(
      [
        `状態: **${statusLabels[event.status]}**`,
        `開催: **${scheduled}**`,
        `シリーズ: **${seriesName}**`
      ].join("\n")
    )
    .addFields(
      {
        name: "担当",
        value: [
          `主担当: ${roleUser(roles, "main")}`,
          `司会: ${roleUser(roles, "mc")}`,
          `告知: ${roleUser(roles, "announce")}`,
          `記録: ${roleUser(roles, "record")}`,
          `賞金: ${roleUser(roles, "prize")}`,
          `サポート: ${roleUser(roles, "support")}`
        ].join("\n"),
        inline: true
      },
      {
        name: "操作",
        value: ["担当変更", "状態変更", "引き継ぎ宣言", "告知文", "タイマー", "参加者", "ToDo", "出費"].join("\n"),
        inline: true
      }
    )
    .setFooter({ text: "Event Planning Bot v0.1" })
    .setTimestamp(new Date(event.updated_at * 1000));
}

export function buildParentPost(
  event: Pick<EventRecord, "title" | "status" | "scheduled_at" | "created_by">,
  roles: EventRoleRecord[],
  series: SeriesRecord | null
): string {
  return [
    `【イベント名】：${event.title}`,
    `【状態】：${statusLabels[event.status]}`,
    `【シリーズ】：${series?.name ?? "単発"}`,
    "",
    `【企画者】：<@${event.created_by}>`,
    `【主担当】：${roleUser(roles, "main")}`,
    `【司会・進行】：${roleUser(roles, "mc")}`,
    `【告知担当】：${roleUser(roles, "announce")}`,
    `【集計・記録担当】：${roleUser(roles, "record")}`,
    `【賞金・景品対応】：${roleUser(roles, "prize")}`,
    `【サポート】：${roleUser(roles, "support")}`,
    "",
    `【開催日時】：${event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定"}`,
    "【概要・ルール】：",
    "",
    "【次にやること】",
    "- [ ] エントリーシート作成",
    "- [ ] 告知文作成",
    "- [ ] 呼びかけ"
  ].join("\n");
}

export function buildHelpEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Event Planning Bot")
    .setDescription("イベント企画室の prefix・担当・引き継ぎ事故を減らすための bot です。")
    .addFields(
      {
        name: "/event new <タイトル> [シリーズ]",
        value: "イベントフォーラムに企画スレッドとコントロールパネルを作ります。"
      },
      {
        name: "/events",
        value: "進行中イベントの一覧を表示します。"
      },
      {
        name: "/admin",
        value: "OWNER_ID のユーザーだけが開ける管理パネルです。"
      },
      {
        name: "コントロールパネル",
        value: "スレッド内の常駐ボタンから担当変更、状態変更、告知文、タイマー、参加者カウント、ToDo、出費を操作します。"
      }
    );
}

function settingLine(label: string, value: string | undefined): string {
  return `${value ? "✓" : "○"} ${label}: ${value ? `\`${value}\`` : "未設定"}`;
}

export function buildAdminPanelEmbed(settings: BotSettings): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("管理パネル")
    .setDescription("`.env` は DISCORD_TOKEN / CLIENT_ID / OWNER_ID だけにし、Discord 側のIDはここで設定します。")
    .addFields(
      {
        name: "基本",
        value: [settingLine("Guild ID", settings.guildId)].join("\n"),
        inline: false
      },
      {
        name: "チャンネル",
        value: [
          settingLine("イベントフォーラム", settings.eventForum),
          settingLine("公式告知", settings.eventAnnounce),
          settingLine("内部お知らせ", settings.internalAnnounce),
          settingLine("出費ログ", settings.expenseLog),
          settingLine("議事録", settings.minutes),
          settingLine("自由チャット", settings.freeChat),
          settingLine("会議VC", settings.meetingVc)
        ].join("\n"),
        inline: false
      },
      {
        name: "ロール",
        value: [
          settingLine("イベント統括", settings.eventLeadRole),
          settingLine("イベンター", settings.eventerRole)
        ].join("\n"),
        inline: false
      }
    );
}

export function buildEventsListEmbed(events: EventRecord[], guildId?: string | null): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle("イベント一覧");

  if (events.length === 0) {
    return embed.setDescription("進行中のイベントはありません。");
  }

  return embed.setDescription(
    events
      .map((event) => {
        const scheduled = event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定";
        const location = guildId
          ? `https://discord.com/channels/${guildId}/${event.thread_id}`
          : `thread_id=${event.thread_id}`;
        return `• **${event.title}** / ${statusLabels[event.status]} / ${scheduled}\n  ${location}`;
      })
      .join("\n")
  );
}

export function buildEventsCalendarEmbed(monthKey: string, events: EventRecord[]): EmbedBuilder {
  const eventLines =
    events.length > 0
      ? events
          .slice(0, 20)
          .map((event) => {
            const scheduled = event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定";
            return `• ${scheduled} ${event.title}`;
          })
          .join("\n")
      : "この月に開催日時が設定されたイベントはありません。";

  return new EmbedBuilder()
    .setTitle(`イベントカレンダー ${monthKey}`)
    .setDescription(`\`\`\`\n${renderMonthCalendar(monthKey, events)}\n\`\`\``)
    .addFields({ name: "予定", value: eventLines.slice(0, 1024) });
}

function listOrEmpty(lines: string[]): string {
  return lines.length > 0 ? lines.join("\n").slice(0, 1024) : "なし";
}

function categoryLabel(category: string): string {
  switch (category) {
    case "prize":
      return "賞金";
    case "gift":
      return "景品";
    case "operation":
      return "運営費";
    case "other":
      return "その他";
    default:
      return category;
  }
}

export function buildEventsStatsEmbed(stats: OverviewStats): EmbedBuilder {
  const statusLines = stats.statusCounts.map(
    (item) => `• ${statusLabels[item.status]}: ${item.count}件`
  );
  const expenseLines = stats.expenseCategoryTotals.map(
    (item) => `• ${categoryLabel(item.category)}: ${item.total.toLocaleString("ja-JP")} Land`
  );
  const rankingLines = stats.eventExpenseRanking.map(
    (item, index) => `${index + 1}. ${item.title}: ${item.total.toLocaleString("ja-JP")} Land`
  );
  const seriesLines = stats.seriesCounts.map((item) => `• ${item.name}: ${item.count}回`);
  const roleLines = stats.roleCounts.map((item) => `• <@${item.user_id}>: ${item.count}件`);

  return new EmbedBuilder()
    .setTitle(`イベント統計 ${stats.monthKey}`)
    .addFields(
      { name: "イベント数", value: listOrEmpty(statusLines), inline: true },
      { name: "出費カテゴリ", value: listOrEmpty(expenseLines), inline: true },
      { name: "イベント別出費", value: listOrEmpty(rankingLines), inline: false },
      { name: "シリーズ開催回数", value: listOrEmpty(seriesLines), inline: true },
      { name: "担当回数", value: listOrEmpty(roleLines), inline: true }
    );
}

export function buildRolePanelEmbed(event: EventRecord, roles: EventRoleRecord[]): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`担当管理: ${event.title}`)
    .setDescription("変更する担当を選んでから、次の画面でユーザーを選択してください。")
    .addFields(
      (["main", "mc", "announce", "record", "prize", "support"] as const).map((roleType) => ({
        name: roleLabels[roleType],
        value: roleUser(roles, roleType),
        inline: true
      }))
    );
}

function announcementState(announcement: AnnouncementRecord): string {
  if (announcement.posted_at) {
    return `転送済 ${formatJstDateTime(announcement.posted_at)}`;
  }
  if (announcement.scheduled_at) {
    return `予約済 ${formatJstDateTime(announcement.scheduled_at)}`;
  }
  return "下書き";
}

export function buildAnnouncementPanelEmbed(
  event: EventRecord,
  announcements: AnnouncementRecord[]
): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(`告知文: ${event.title}`);

  if (announcements.length === 0) {
    return embed.setDescription("このイベントの告知文はまだありません。");
  }

  return embed.setDescription(
    announcements
      .slice(0, 10)
      .map((announcement, index) => {
        const label = `v${announcements.length - index}`;
        const firstLine = announcement.body.split(/\r?\n/)[0]?.slice(0, 80) || "(本文なし)";
        return `• **${label}** / ${announcementState(announcement)}\n  ${firstLine}`;
      })
      .join("\n")
  );
}

export function buildAnnouncementPreviewEmbed(
  announcement: AnnouncementRecord
): EmbedBuilder {
  const body =
    announcement.body.length > 1000
      ? `${announcement.body.slice(0, 997)}...`
      : announcement.body;

  return new EmbedBuilder()
    .setTitle(`告知文 #${announcement.id}`)
    .setDescription(body)
    .addFields({ name: "状態", value: announcementState(announcement) });
}

function timerStateLabel(schedule: TimerScheduleRecord): string {
  switch (schedule.state) {
    case "idle":
      return "待機中";
    case "running":
      return "進行中";
    case "finished":
      return "終了";
  }
}

export function buildTimerPanelEmbed(
  event: EventRecord,
  schedule: TimerScheduleRecord | null,
  sections: TimerSectionRecord[]
): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(`タイマー: ${event.title}`);

  if (!schedule) {
    return embed.setDescription("タイマーはまだ設定されていません。");
  }

  const active = sections.find(
    (section) => section.actual_start !== null && section.actual_end === null
  );
  const next = sections.find((section) => section.actual_start === null);
  const currentLine = active
    ? `現在: **${active.name}**`
    : next
      ? `次: **${next.name}**`
      : "全セクション終了";

  return embed
    .setDescription(
      [
        `状態: **${timerStateLabel(schedule)}**`,
        `通知先: <#${schedule.notify_channel}>`,
        `事前通知: ${schedule.pre_notice_min} 分前`,
        currentLine
      ].join("\n")
    )
    .addFields({
      name: "タイムテーブル",
      value:
        sections
          .map((section) => {
            const mark =
              section.actual_end !== null ? "✓" : section.actual_start !== null ? "▶" : "○";
            return `${mark} ${formatJstTime(section.planned_start)} ${section.name} (${section.planned_minutes}分)`;
          })
          .join("\n")
          .slice(0, 1024) || "未設定"
    });
}

function participantModeLabel(config: ParticipantsConfigRecord): string {
  return config.mode === "reaction" ? "リアクション方式" : "投稿方式";
}

export function buildParticipantsPanelEmbed(
  event: EventRecord,
  config: ParticipantsConfigRecord | null,
  counts: ParticipantsCountRecord[]
): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(`参加者カウント: ${event.title}`);

  if (!config) {
    return embed.setDescription("参加者カウントはまだ設定されていません。");
  }

  const countLines =
    counts.length > 0
      ? counts
          .map((count) => {
            const label = count.label === "_post" ? "投稿数" : count.label;
            const total = count.count_normal + count.count_late;
            return `• ${label}: ${count.count_normal}名（+遅刻${count.count_late}）= 計${total}名`;
          })
          .join("\n")
      : "まだ集計がありません。";

  const target =
    config.mode === "reaction"
      ? `message=${config.reaction_target_msg}`
      : `channel/thread=${config.post_target_thread ?? config.post_target_channel}`;

  return embed
    .setDescription(
      [
        `方式: **${participantModeLabel(config)}**`,
        `対象: ${target}`,
        `締切: ${config.deadline_at ? formatJstDateTime(config.deadline_at) : "未設定"}`
      ].join("\n")
    )
    .addFields({ name: "集計", value: countLines.slice(0, 1024) });
}

function todoStatusLabel(todo: TodoRecord): string {
  switch (todo.status) {
    case "open":
      return "未完了";
    case "done":
      return "完了";
    case "cancelled":
      return "取消";
  }
}

export function buildTodoPanelEmbed(event: EventRecord, todos: TodoRecord[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle(`ToDo: ${event.title}`);

  if (todos.length === 0) {
    return embed.setDescription("このイベントの ToDo はまだありません。");
  }

  return embed.setDescription(
    todos
      .slice(0, 20)
      .map((todo) => {
        const mark = todo.status === "done" ? "✓" : "○";
        const assignee = todo.assignee ? ` <@${todo.assignee}>` : "";
        const due = todo.due_at ? ` 期限: ${formatJstDateTime(todo.due_at)}` : "";
        return `${mark} #${todo.id} ${todo.content}${assignee}${due}`;
      })
      .join("\n")
      .slice(0, 4000)
  );
}

export function buildTodoDetailEmbed(todo: TodoRecord): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`ToDo #${todo.id}`)
    .setDescription(todo.content)
    .addFields(
      { name: "状態", value: todoStatusLabel(todo), inline: true },
      { name: "担当", value: todo.assignee ? `<@${todo.assignee}>` : "未設定", inline: true },
      {
        name: "期限",
        value: todo.due_at ? formatJstDateTime(todo.due_at) : "未設定",
        inline: true
      }
    );
}

export function buildMinutesTodoReviewEmbed(sourceMsgId: string, candidates: TodoRecord[]): EmbedBuilder {
  const embed = new EmbedBuilder().setTitle("議事録 ToDo 候補").setFooter({
    text: `source_msg_id=${sourceMsgId}`
  });

  if (candidates.length === 0) {
    return embed.setDescription("未処理の候補はありません。");
  }

  return embed.setDescription(
    candidates
      .slice(0, 20)
      .map((todo) => `○ #${todo.id} ${todo.content}`)
      .join("\n")
      .slice(0, 4000)
  );
}

export function buildMinutesTodoCandidateEmbed(todo: TodoRecord): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`議事録 ToDo 候補 #${todo.id}`)
    .setDescription(todo.content)
    .addFields({
      name: "次の操作",
      value: "採用する場合はイベントを選び、内容・担当・期限を確認してください。不要なら破棄できます。"
    });
}

function expenseCategoryLabel(expense: ExpenseRecord): string {
  switch (expense.category) {
    case "prize":
      return "賞金";
    case "gift":
      return "景品";
    case "operation":
      return "運営費";
    case "other":
      return "その他";
  }
}

function expenseDirectionLabel(expense: ExpenseRecord): string {
  return expense.direction === "out" ? "出費" : "補填・返金";
}

export function buildExpensePanelEmbed(
  event: EventRecord,
  expenses: ExpenseRecord[],
  totalOut: number,
  totalIn: number,
  pendingProofCount: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(`出費: ${event.title}`)
    .setDescription(
      [
        `出費合計: **${totalOut.toLocaleString("ja-JP")} Land**`,
        `補填・返金合計: **${totalIn.toLocaleString("ja-JP")} Land**`,
        `証明画像待ち: **${pendingProofCount} 件**`
      ].join("\n")
    );

  if (expenses.length === 0) {
    return embed.addFields({ name: "履歴", value: "このイベントの出費記録はまだありません。" });
  }

  return embed.addFields({
    name: "履歴",
    value: expenses
      .slice(0, 15)
      .map((expense) => {
        const proof = expense.proof_status === "attached" ? "証明済" : "証明待ち";
        const recipient = expense.recipient_id ? ` / <@${expense.recipient_id}>` : "";
        return `• #${expense.id} ${expenseDirectionLabel(expense)} ${expense.amount.toLocaleString("ja-JP")} Land / ${expenseCategoryLabel(expense)}${recipient} / ${formatJstDateTime(expense.occurred_at)} / ${proof}`;
      })
      .join("\n")
      .slice(0, 1024)
  });
}

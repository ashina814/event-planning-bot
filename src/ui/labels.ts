import type { EventStatus } from "../types/index.js";

export const statusLabels: Record<EventStatus, string> = {
  planning: "企画中",
  announcing: "告知中",
  announced: "告知済",
  in_progress: "開催中",
  done: "完了",
  cancelled: "見送り"
};

export const roleLabels: Record<string, string> = {
  main: "主担当",
  mc: "司会・進行",
  announce: "告知担当",
  record: "集計・記録担当",
  prize: "賞金・景品対応",
  support: "サポート"
};

export const defaultCustomRoleLabels = [
  "司会・進行",
  "告知担当",
  "集計・記録担当",
  "賞金・景品対応",
  "サポート"
] as const;

export const expenseCategoryLabels: Record<string, string> = {
  prize: "賞金",
  gift: "景品",
  operation: "運営費",
  other: "その他"
};

export const expenseDirectionLabels: Record<string, string> = {
  out: "出費",
  in: "補填・返金"
};

export const participantsModeLabels: Record<string, string> = {
  reaction: "リアクション方式",
  post: "投稿方式"
};

export const participantsLabels = ["参加", "不参加"] as const;
export type ParticipantsLabel = (typeof participantsLabels)[number];

export function mentionUser(userId: string | null | undefined): string {
  return userId ? `<@${userId}>` : "未定";
}

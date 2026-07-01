import type { EventStatus, RoleType } from "../types/index.js";

export const statusLabels: Record<EventStatus, string> = {
  planning: "企画中",
  announcing: "告知中",
  announced: "告知済",
  in_progress: "開催中",
  done: "完了",
  cancelled: "見送り"
};

export const roleLabels: Record<RoleType, string> = {
  main: "主担当",
  mc: "司会・進行",
  announce: "告知担当",
  record: "集計・記録担当",
  prize: "賞金・景品対応",
  support: "サポート"
};

export function mentionUser(userId: string | null | undefined): string {
  return userId ? `<@${userId}>` : "未定";
}

import { EmbedBuilder } from "discord.js";
import type { MonthlyReport, RoleBiasResult } from "./service.js";

function biasLine(result: RoleBiasResult): string {
  const share = Math.round(result.topShare * 100);
  const top = result.topUserId ? `最多 <@${result.topUserId}> ${result.topCount}回 (${share}%)` : "";
  const warn = result.flagged ? " ⚠️ 集中傾向" : "";
  return `• ${result.label}: 合計 ${result.total}回 / ${top}${warn}`.trim();
}

export function buildMonthlyReportEmbed(report: MonthlyReport): EmbedBuilder {
  const biasLines = report.roleBias.map(biasLine);
  if (report.backstageBias) {
    biasLines.push(biasLine(report.backstageBias));
  }

  const payrollStatus =
    report.payroll.status === "finalized"
      ? "確定済み"
      : report.payroll.status === "draft"
        ? "下書き (未確定)"
        : "未生成";
  const nearCap =
    report.payroll.nearCapUserIds.length > 0
      ? report.payroll.nearCapUserIds.map((id) => `<@${id}>`).join(" ")
      : "なし";
  const inactive =
    report.inactiveUserIds.length > 0
      ? report.inactiveUserIds.map((id) => `<@${id}>`).join(" ")
      : "なし";

  return new EmbedBuilder()
    .setTitle(`📈 月次レポート ${report.monthKey}`)
    .setDescription(`偏り検知のしきい値: 1 人が ${Math.round(report.biasThreshold * 100)}% 以上で ⚠️`)
    .addFields(
      {
        name: "イベント",
        value: [
          `完了 ${report.events.done}`,
          `進行中 ${report.events.inProgress}`,
          `延期 ${report.events.postponed}`,
          `見送り ${report.events.cancelled}`
        ].join(" / "),
        inline: false
      },
      {
        name: "担当の偏り",
        value: biasLines.length > 0 ? biasLines.join("\n").slice(0, 1024) : "対象イベントがありません。",
        inline: false
      },
      {
        name: "未完了",
        value: [
          `期限超過 ToDo: ${report.pending.overdueTodos} 件`,
          `出費・証明未添付: ${report.pending.pendingProofExpenses} 件`,
          `担当未確認: ${report.pending.unconfirmedRoles} 件`
        ].join("\n"),
        inline: false
      },
      {
        name: "支給",
        value: [
          `支給案: ${payrollStatus}`,
          `総支給見込み: ${report.payroll.total.toLocaleString("ja-JP")} Land`,
          `上限接近 (90%以上): ${nearCap}`,
          `本人振り返り提出: ${report.selfReview.submitted}/${report.selfReview.expected}`
        ].join("\n"),
        inline: false
      },
      {
        name: "活動",
        value: `30 日以上活動記録なし: ${inactive}`,
        inline: false
      }
    );
}

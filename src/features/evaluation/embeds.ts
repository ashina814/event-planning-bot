import { EmbedBuilder } from "discord.js";
import type { PayrollItemRecord, PayrollRunRecord } from "../payroll/service.js";
import type { EvaluationMaterial } from "./service.js";
import { formatJstDateTime } from "../../lib/time.js";

export function buildEvaluationMaterialEmbed(
  run: PayrollRunRecord,
  item: PayrollItemRecord,
  material: EvaluationMaterial,
  index: number,
  total: number
): EmbedBuilder {
  const roles = Object.entries(material.roleCounts)
    .filter(([, count]) => count > 0)
    .map(([label, count]) => `${label}x${count}`)
    .join("、") || "なし";
  const completedEvents = Object.values(material.roleCounts).reduce((sum, count) => sum + count, 0);
  const confirmRate = material.confirmRate === null
    ? "対象なし"
    : `${Math.round(material.confirmRate * 100)}% (${material.confirmDone}/${material.confirmAssigned})`;
  const lastActive = material.lastActiveAt ? formatJstDateTime(material.lastActiveAt) : "記録なし";
  const currentEval = item.eval_bonus > 0 ? `${item.eval_bonus.toLocaleString("ja-JP")} Land` : "未入力 (0扱い)";

  return new EmbedBuilder()
    .setTitle(`評価材料 ${run.month_key}`)
    .setDescription(`<@${item.user_id}> (${index + 1}/${Math.max(1, total)})`)
    .addFields(
      { name: "担当", value: `${roles}\n完了イベント ${completedEvents} 件`, inline: false },
      { name: "ToDo", value: `完了 ${material.todoDone} / 期限超過 ${material.todoOverdue}`, inline: true },
      { name: "担当確認率", value: confirmRate, inline: true },
      { name: "引き継ぎ引受", value: `${material.handoverCount} 回`, inline: true },
      { name: "振り返り提出", value: material.retroSubmitted ? "提出済み" : "未提出", inline: true },
      { name: "最終活動", value: lastActive, inline: true },
      { name: "現在の評価ボーナス", value: currentEval, inline: true }
    );
}

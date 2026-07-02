import { EmbedBuilder } from "discord.js";
import type { PayrollItemRecord, PayrollRunRecord } from "./service.js";

export function buildPayrollRunEmbed(run: PayrollRunRecord, items: PayrollItemRecord[], page = 0): EmbedBuilder {
  const pageSize = 8;
  const visible = items.slice(page * pageSize, page * pageSize + pageSize);
  const total = items.reduce((sum, item) => sum + item.total, 0);
  const unresolved = items.filter((item) => item.cap_action === "unresolved").length;
  const lines = visible.map((item) => {
    const cap = item.cap_action === "unresolved" ? " / 上限未処理" : item.cap_action ? ` / ${item.cap_action}` : "";
    return `• <@${item.user_id}> ${item.total.toLocaleString("ja-JP")} Land${cap}`;
  });

  return new EmbedBuilder()
    .setTitle(`支給案 ${run.month_key}`)
    .setDescription(
      [
        `状態: **${run.status === "finalized" ? "確定済み" : "下書き"}**`,
        `対象者: **${items.length}人**`,
        `合計: **${total.toLocaleString("ja-JP")} Land**`,
        `上限未処理: **${unresolved}件**`,
        "",
        ...(lines.length > 0 ? lines : ["明細はありません。"])
      ].join("\n")
    )
    .setFooter({ text: `${page + 1} / ${Math.max(1, Math.ceil(items.length / pageSize))}` });
}

export function buildPayrollItemEmbed(run: PayrollRunRecord, item: PayrollItemRecord): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`支給明細 ${run.month_key}`)
    .setDescription(`<@${item.user_id}>`)
    .addFields(
      { name: "基本給", value: `${item.base_salary.toLocaleString("ja-JP")} Land`, inline: true },
      { name: "実務報酬", value: `${item.work_total.toLocaleString("ja-JP")} Land`, inline: true },
      { name: "評価", value: `${item.eval_bonus.toLocaleString("ja-JP")} Land`, inline: true },
      { name: "特別", value: `${item.special_bonus.toLocaleString("ja-JP")} Land`, inline: true },
      { name: "上限", value: item.cap ? `${item.cap.toLocaleString("ja-JP")} Land` : "なし", inline: true },
      { name: "合計", value: `${item.total.toLocaleString("ja-JP")} Land`, inline: true }
    );
}

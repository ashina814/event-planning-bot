import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { buildPayrollRunEmbed } from "../features/payroll/embeds.js";
import { PayrollService } from "../features/payroll/service.js";
import { assertLeadOrSub, fetchGuildMember } from "../lib/permission.js";
import { buildPayrollRunComponents } from "../ui/buttons.js";
import type { CommandModule } from "../types/index.js";

export const monthlyCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("monthly")
    .setDescription("支給案を表示・生成")
    .addStringOption((option) =>
      option
        .setName("month")
        .setDescription("YYYY-MM。省略時は前月")
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const repos = createRepos(getDb());
    const member = await fetchGuildMember(interaction);
    assertLeadOrSub(member, repos.settingsRepo);

    const service = new PayrollService(getDb());
    const monthKey = interaction.options.getString("month")?.trim() || service.defaultMonthKey();
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new Error("月は YYYY-MM で指定してください。");
    }
    const run = service.generateDraft(interaction.user.id, monthKey);
    const items = service.listItems(run.id);
    await interaction.editReply({
      embeds: [buildPayrollRunEmbed(run, items, 0)],
      components: buildPayrollRunComponents(run, items, 0)
    });
  }
};

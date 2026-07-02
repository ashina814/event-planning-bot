import { SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { fetchGuildMember, isLeadOrSub } from "../lib/permission.js";
import { buildAdminPanelComponents } from "../ui/buttons.js";
import { buildAdminPanelEmbed } from "../ui/embeds.js";
import type { CommandModule } from "../types/index.js";

export const adminCommand: CommandModule = {
  data: new SlashCommandBuilder().setName("admin").setDescription("bot 管理パネルを開く"),
  async execute(interaction) {
    const repos = createRepos(getDb());
    if (interaction.user.id !== config.ownerId) {
      const member = await fetchGuildMember(interaction);
      if (!isLeadOrSub(member, repos.settingsRepo)) {
        await interaction.reply({ content: "この管理パネルはイベント統括またはサブ統括のみ使えます。", ephemeral: true });
        return;
      }
    }

    await interaction.reply({
      embeds: [buildAdminPanelEmbed(repos.settingsRepo.all())],
      components: buildAdminPanelComponents(),
      ephemeral: true
    });
  }
};

import { SlashCommandBuilder } from "discord.js";
import { config } from "../config.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { buildAdminPanelComponents } from "../ui/buttons.js";
import { buildAdminPanelEmbed } from "../ui/embeds.js";
import type { CommandModule } from "../types/index.js";

export const adminCommand: CommandModule = {
  data: new SlashCommandBuilder().setName("admin").setDescription("bot 管理パネルを開く"),
  async execute(interaction) {
    if (interaction.user.id !== config.ownerId) {
      await interaction.reply({ content: "この管理パネルは OWNER_ID のユーザーのみ使えます。", ephemeral: true });
      return;
    }

    const repos = createRepos(getDb());
    await interaction.reply({
      embeds: [buildAdminPanelEmbed(repos.settingsRepo.all())],
      components: buildAdminPanelComponents(),
      ephemeral: true
    });
  }
};

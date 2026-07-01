import { SlashCommandBuilder } from "discord.js";
import { buildHelpEmbed } from "../ui/embeds.js";
import type { CommandModule } from "../types/index.js";

export const helpCommand: CommandModule = {
  data: new SlashCommandBuilder().setName("help").setDescription("Event Planning Bot の使い方"),
  async execute(interaction) {
    await interaction.reply({
      embeds: [buildHelpEmbed()],
      ephemeral: true
    });
  }
};

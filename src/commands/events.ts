import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { currentJstMonthKey } from "../features/overview/calendar.js";
import { buildEventsOverviewComponents } from "../ui/buttons.js";
import { buildEventsListEmbed } from "../ui/embeds.js";
import type { CommandModule } from "../types/index.js";

export const eventsCommand: CommandModule = {
  data: new SlashCommandBuilder().setName("events").setDescription("進行中イベントの一覧を表示"),
  async execute(interaction) {
    const repos = createRepos(getDb());
    const events = repos.eventsRepo.listOpen(25);
    const series = repos.seriesRepo.listActive(10);
    const guildId = repos.settingsRepo.get("guildId") ?? interaction.guildId;
    const embed = buildEventsListEmbed(events, guildId);
    if (series.length > 0) {
      embed.addFields({
        name: "登録済みシリーズ",
        value: series.map((item) => `• ${item.name}`).join("\n"),
        inline: false
      });
    }
    await interaction.reply({
      embeds: [embed],
      components: buildEventsOverviewComponents(currentJstMonthKey()),
      ephemeral: true
    });
  }
};

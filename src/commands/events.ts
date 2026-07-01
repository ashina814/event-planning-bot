import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../db/connection.js";
import { EventsRepo } from "../db/repos/events.js";
import { SeriesRepo } from "../db/repos/series.js";
import { currentJstMonthKey } from "../features/overview/calendar.js";
import { buildEventsOverviewComponents } from "../ui/buttons.js";
import { buildEventsListEmbed } from "../ui/embeds.js";
import type { CommandModule } from "../types/index.js";

export const eventsCommand: CommandModule = {
  data: new SlashCommandBuilder().setName("events").setDescription("進行中イベントの一覧を表示"),
  async execute(interaction) {
    const db = getDb();
    const repo = new EventsRepo(db);
    const seriesRepo = new SeriesRepo(db);
    const events = repo.listOpen(25);
    const series = seriesRepo.listActive(10);
    const embed = buildEventsListEmbed(events);
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

import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { EventLifecycleService } from "../features/event-lifecycle/service.js";
import type { CommandModule } from "../types/index.js";

export const eventCommand: CommandModule = {
  data: new SlashCommandBuilder()
    .setName("event")
    .setDescription("イベント操作")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("new")
        .setDescription("新規イベントを作成")
        .addStringOption((option) =>
          option
            .setName("title")
            .setDescription("イベント名")
            .setRequired(true)
            .setMaxLength(80)
        )
        .addStringOption((option) =>
          option
            .setName("series")
            .setDescription("シリーズ名。単発の場合は空で OK")
            .setRequired(false)
            .setMaxLength(80)
        )
    ),
  async execute(interaction) {
    if (interaction.options.getSubcommand() !== "new") {
      await interaction.reply({ content: "未対応のサブコマンドです。", ephemeral: true });
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const repos = createRepos(getDb());
    const service = new EventLifecycleService(
      interaction.client,
      repos.eventsRepo,
      repos.rolesRepo,
      repos.seriesRepo,
      repos.jobsRepo,
      repos.settingsRepo
    );

    const event = await service.createFromCommand(interaction);
    const eventUrl = `https://discord.com/channels/${interaction.guildId}/${event.thread_id}`;
    await interaction.editReply({
      content: `作成しました: ${eventUrl}`
    });
  }
};

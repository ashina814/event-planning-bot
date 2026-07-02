import { SlashCommandBuilder } from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { EventLifecycleService } from "../features/event-lifecycle/service.js";
import { formatJstDateTime, parseFlexibleDateTime } from "../lib/time.js";
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
            .setAutocomplete(true)
        )
        .addStringOption((option) =>
          option
            .setName("datetime")
            .setDescription("開催日時 (例: 明日 22:00 / 6/29 22:00)。未定なら空欄")
            .setDescriptionLocalizations({ ja: "開催日時 (例: 明日 22:00)。未定なら空欄" })
            .setRequired(false)
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
      repos.timersRepo,
      repos.settingsRepo
    );

    const event = await service.createFromCommand(interaction);
    const datetimeInput = interaction.options.getString("datetime")?.trim();
    let scheduledLine = "";
    let warningLine = "";

    if (datetimeInput) {
      try {
        const scheduledAt = parseFlexibleDateTime(datetimeInput);
        const updated = await service.changeScheduledAt(event.thread_id, scheduledAt);
        scheduledLine = `\n開催日時: ${updated.scheduled_at ? formatJstDateTime(updated.scheduled_at) : "未定"}`;
      } catch {
        warningLine = "\n⚠️ イベントは作成しましたが日時が読めませんでした。コントロールパネルの [日時] から設定してください。";
      }
    }

    const eventUrl = `https://discord.com/channels/${interaction.guildId}/${event.thread_id}`;
    await interaction.editReply({
      content: `作成しました: ${eventUrl}${scheduledLine}${warningLine}`
    });
  }
};

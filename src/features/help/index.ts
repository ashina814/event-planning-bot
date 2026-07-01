import {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder
} from "discord.js";
import { buildHelpTopicEmbed, helpTopics } from "./content.js";
import type { HelpTopic } from "./content.js";

export { buildHelpTopicEmbed, helpTopics };
export type { HelpTopic };

export function buildHelpSelectMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("help:topic")
      .setPlaceholder("知りたい機能を選んでください")
      .addOptions(
        helpTopics.map((topic) => ({
          label: topic.label,
          value: topic.value,
          description: topic.description,
          emoji: topic.emoji
        }))
      )
  );
}

export function buildHelpInitialEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle("Event Planning Bot ヘルプ")
    .setDescription(
      [
        "何について知りたいですか？",
        "下のセレクトメニューから機能を選ぶと、このメッセージ内で詳しい使い方に切り替わります。"
      ].join("\n")
    )
    .addFields({
      name: "トピック",
      value: helpTopics
        .map((topic) => `${topic.emoji} **${topic.label}** - ${topic.description}`)
        .join("\n")
    });
}

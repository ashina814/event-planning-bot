import {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  ContextMenuCommandBuilder,
  StringSelectMenuBuilder,
  type GuildMember,
  type MessageContextMenuCommandInteraction
} from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos, type Repos } from "../db/repos/index.js";
import { fetchGuildMember, isEventLead } from "../lib/permission.js";
import { formatJstDateTime } from "../lib/time.js";
import type { EventRecord } from "../types/index.js";

export const SET_PARTICIPANTS_TARGET_COMMAND_NAME = "set_participants_target";
export const SET_PARTICIPANTS_TARGET_COMMAND_JA_NAME = "参加者カウント対象に設定";

const targetEventStatuses = new Set(["planning", "announcing", "announced"]);

export const setParticipantsTargetCommandData = new ContextMenuCommandBuilder()
  .setName(SET_PARTICIPANTS_TARGET_COMMAND_NAME)
  .setNameLocalizations({ ja: SET_PARTICIPANTS_TARGET_COMMAND_JA_NAME })
  .setType(ApplicationCommandType.Message);

export async function handleSetParticipantsTargetCommand(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  const repos = createRepos(getDb());
  const member = await fetchGuildMember(interaction);
  const targetMessage = interaction.targetMessage;
  const events = findTargetEvents(member, repos).slice(0, 25);

  if (events.length === 0) {
    throw new Error("紐付けるイベントが見つかりません");
  }

  if (events.length === 1) {
    const event = events[0];
    if (!event) {
      throw new Error("紐付けるイベントが見つかりません");
    }
    await interaction.reply({
      content: `このメッセージを **${event.title}** の参加者カウント対象に設定しますか？`,
      components: [
        buildParticipantsTargetConfirmButton(
          event.thread_id,
          targetMessage.channelId,
          targetMessage.id
        )
      ],
      ephemeral: true
    });
    return;
  }

  await interaction.reply({
    content: "紐付けるイベントを選んでください。",
    components: [
      buildParticipantsTargetEventSelect(
        targetMessage.channelId,
        targetMessage.id,
        events
      )
    ],
    ephemeral: true
  });
}

function buildParticipantsTargetConfirmButton(
  threadId: string,
  targetChannel: string,
  targetMsg: string
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`participants:target-confirm:${threadId}:${targetChannel}:${targetMsg}`)
      .setLabel("このイベントに設定")
      .setStyle(ButtonStyle.Primary)
  );
}

function buildParticipantsTargetEventSelect(
  targetChannel: string,
  targetMsg: string,
  events: EventRecord[]
): ActionRowBuilder<StringSelectMenuBuilder> {
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`participants:target-event:${targetChannel}:${targetMsg}`)
      .setPlaceholder("イベントを選択")
      .addOptions(
        events.map((event) => ({
          label: truncate(event.title, 100),
          description: truncate(event.scheduled_at
            ? `開催 ${formatJstDateTime(event.scheduled_at)}`
            : `作成 ${formatJstDateTime(event.created_at)}`, 100),
          value: event.thread_id
        }))
      )
  );
}

function findTargetEvents(member: GuildMember, repos: Repos): EventRecord[] {
  const isLead = isEventLead(member, repos.settingsRepo);
  return repos.eventsRepo
    .listOpen(100)
    .filter((event) => targetEventStatuses.has(event.status))
    .filter((event) => {
      if (isLead) {
        return true;
      }
      return repos.rolesRepo
        .list(event.thread_id)
        .some((role) => (role.role_kind === "main" || role.role_type === "main") && role.user_id === member.id);
    });
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength - 1) + "…" : value;
}

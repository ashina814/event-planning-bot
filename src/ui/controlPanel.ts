import type { Client } from "discord.js";
import type { EventsRepo } from "../db/repos/events.js";
import type { RolesRepo } from "../db/repos/roles.js";
import type { SeriesRepo } from "../db/repos/series.js";
import { buildControlPanelComponents } from "./buttons.js";
import { buildControlPanelEmbed } from "./embeds.js";

export async function renderControlPanel(
  client: Client,
  eventsRepo: EventsRepo,
  rolesRepo: RolesRepo,
  seriesRepo: SeriesRepo,
  threadId: string
): Promise<void> {
  const event = eventsRepo.get(threadId);
  if (!event) {
    throw new Error("イベントが見つかりませんでした。");
  }

  const roles = rolesRepo.list(threadId);
  const series = event.series_id ? seriesRepo.findById(event.series_id) : null;
  const payload = {
    embeds: [buildControlPanelEmbed(event, roles, series)],
    components: buildControlPanelComponents(event)
  };

  const channel = await client.channels.fetch(threadId);
  if (!channel || !("send" in channel) || !("messages" in channel)) {
    throw new Error("このスレッドにコントロールパネルを投稿できませんでした。");
  }

  if (event.control_msg_id) {
    const existing = await channel.messages.fetch(event.control_msg_id).catch(() => null);
    if (existing) {
      await existing.edit(payload);
      return;
    }
  }

  const sent = await channel.send(payload);
  eventsRepo.updateControlMessageId(threadId, sent.id);
}

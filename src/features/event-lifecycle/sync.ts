import type { Client } from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SeriesRepo } from "../../db/repos/series.js";
import { buildParentPost } from "../../ui/embeds.js";
import { renderControlPanel } from "../../ui/controlPanel.js";

export async function syncParentPost(
  client: Client,
  eventsRepo: EventsRepo,
  rolesRepo: RolesRepo,
  seriesRepo: SeriesRepo,
  threadId: string
): Promise<void> {
  const event = eventsRepo.get(threadId);
  if (!event || !event.parent_msg_id) {
    return;
  }

  const channel = (await client.channels.fetch(threadId)) as any;
  if (!channel?.messages) {
    return;
  }

  const series = event.series_id ? seriesRepo.findById(event.series_id) : null;
  const roles = rolesRepo.listSlots(threadId, event.series_id);
  const message = await channel.messages.fetch(event.parent_msg_id).catch(() => null);

  if (!message) {
    eventsRepo.updateParentMessageId(threadId, null);
    return;
  }

  await message.edit(buildParentPost(event, roles, series));
}

export async function syncEventArtifacts(
  client: Client,
  eventsRepo: EventsRepo,
  rolesRepo: RolesRepo,
  seriesRepo: SeriesRepo,
  threadId: string
): Promise<void> {
  await syncParentPost(client, eventsRepo, rolesRepo, seriesRepo, threadId);
  await renderControlPanel(client, eventsRepo, rolesRepo, seriesRepo, threadId);
}

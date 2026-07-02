import type { Client } from "discord.js";
import type { EventsRepo } from "../../db/repos/events.js";
import { roleLabel } from "../../db/repos/roles.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { SeriesRepo } from "../../db/repos/series.js";
import { logger } from "../../lib/logger.js";
import { formatJstDateTime } from "../../lib/time.js";
import { renderControlPanel } from "../../ui/controlPanel.js";
import { statusLabels } from "../../ui/labels.js";

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

  const nextContent = updateParentPostLines(message.content, [
    { label: "状態", value: statusLabels[event.status] },
    {
      label: "開催日時",
      value: event.scheduled_at ? formatJstDateTime(event.scheduled_at) : "未定"
    },
    ...roles.map((role) => ({
      label: roleLabel(role),
      value: role.user_id ? `<@${role.user_id}>` : "未定"
    }))
  ]);

  if (nextContent !== message.content) {
    await message.edit(nextContent);
  }
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

function updateParentPostLines(
  currentContent: string,
  replacements: Array<{ label: string; value: string }>
): string {
  const marker = "【概要・ルール】：";
  const markerIndex = currentContent.indexOf(marker);
  const editableHead = markerIndex >= 0 ? currentContent.slice(0, markerIndex) : currentContent;
  const protectedTail = markerIndex >= 0 ? currentContent.slice(markerIndex) : "";

  let updatedHead = editableHead;
  for (const replacement of replacements) {
    updatedHead = replaceParentLine(updatedHead, replacement.label, replacement.value);
  }

  return `${updatedHead}${protectedTail}`;
}

function replaceParentLine(content: string, label: string, value: string): string {
  const prefix = `【${label}】：`;
  const pattern = new RegExp(`^${escapeRegExp(prefix)}.*$`, "m");
  if (!pattern.test(content)) {
    logger.warn({ label }, "parent post managed line not found; skipping");
    return content;
  }
  return content.replace(pattern, `${prefix}${value}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

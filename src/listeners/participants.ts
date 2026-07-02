import { Events, type Client } from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { ParticipantsService } from "../features/participants/service.js";
import { logger } from "../lib/logger.js";

function createService(client: Client): ParticipantsService {
  const repos = createRepos(getDb());
  return new ParticipantsService(
    client,
    repos.participantsRepo,
    repos.eventsRepo,
    repos.rolesRepo,
    repos.settingsRepo
  );
}

export function registerParticipantsListeners(client: Client): void {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      await createService(client).handleReactionAdd(reaction, user);
    } catch (error) {
      logger.error({ error }, "participant reaction add handling failed");
    }
  });

  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
      await createService(client).handleReactionRemove(reaction, user);
    } catch (error) {
      logger.error({ error }, "participant reaction remove handling failed");
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) {
        return;
      }
      await createService(client).handleMessageChange(message);
    } catch (error) {
      logger.error({ error }, "participant message create handling failed");
    }
  });

  client.on(Events.MessageDelete, async (message) => {
    try {
      const service = createService(client);
      await service.handleTargetMessageDelete(message);
      await service.handleMessageChange(message);
    } catch (error) {
      logger.error({ error }, "participant message delete handling failed");
    }
  });
}

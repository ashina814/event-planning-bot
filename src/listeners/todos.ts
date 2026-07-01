import { Events, type Client } from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { TodoService } from "../features/todo/service.js";
import { logger } from "../lib/logger.js";

function createService(client: Client): TodoService {
  const repos = createRepos(getDb());
  return new TodoService(
    client,
    repos.todosRepo,
    repos.eventsRepo,
    repos.rolesRepo,
    repos.jobsRepo,
    repos.settingsRepo
  );
}

export function registerTodoListeners(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    try {
      await createService(client).handleMinutesMessage(message);
    } catch (error) {
      logger.error({ error }, "todo minutes handling failed");
    }
  });
}

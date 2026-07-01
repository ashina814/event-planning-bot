import { Events, type Client } from "discord.js";
import { getDb } from "../db/connection.js";
import { createRepos } from "../db/repos/index.js";
import { ExpenseService } from "../features/expense/service.js";
import { logger } from "../lib/logger.js";

function createService(client: Client): ExpenseService {
  const repos = createRepos(getDb());
  return new ExpenseService(
    client,
    repos.expensesRepo,
    repos.eventsRepo,
    repos.rolesRepo,
    repos.jobsRepo
  );
}

export function registerExpenseListeners(client: Client): void {
  client.on(Events.MessageCreate, async (message) => {
    try {
      await createService(client).handleProofMessage(message);
    } catch (error) {
      logger.error({ error }, "expense proof handling failed");
    }
  });
}

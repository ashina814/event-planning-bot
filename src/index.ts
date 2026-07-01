import { Events } from "discord.js";
import { config } from "./config.js";
import { createClient } from "./client.js";
import { closeDb, getDb } from "./db/connection.js";
import { createRepos } from "./db/repos/index.js";
import { logger } from "./lib/logger.js";
import { registerExpenseListeners } from "./listeners/expenses.js";
import { registerInteractionCreateListener } from "./listeners/interactionCreate.js";
import { registerParticipantsListeners } from "./listeners/participants.js";
import { registerReadyListener } from "./listeners/ready.js";
import { registerTodoListeners } from "./listeners/todos.js";
import { SchedulerRunner } from "./scheduler/runner.js";

const db = getDb();
const repos = createRepos(db);
const client = createClient();
const scheduler = new SchedulerRunner(
  client,
  repos.jobsRepo,
  repos.announcementsRepo,
  repos.eventsRepo,
  repos.rolesRepo,
  repos.seriesRepo,
  repos.timersRepo,
  repos.todosRepo,
  repos.expensesRepo,
  repos.settingsRepo
);

registerReadyListener(client, scheduler);
registerInteractionCreateListener(client);
registerParticipantsListeners(client);
registerTodoListeners(client);
registerExpenseListeners(client);

client.on(Events.Error, (error) => {
  logger.error({ error }, "discord client error");
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await client.login(config.discordToken);

function shutdown(): void {
  logger.info("shutting down");
  scheduler.stop();
  closeDb();
  client.destroy();
  process.exit(0);
}

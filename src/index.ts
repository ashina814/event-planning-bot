import { Events } from "discord.js";
import { config } from "./config.js";
import { createClient } from "./client.js";
import { closeDb, getDb } from "./db/connection.js";
import { createRepos } from "./db/repos/index.js";
import { RewardsService } from "./features/rewards/service.js";
import { SelfReviewService } from "./features/retrospective/selfReview.js";
import { currentJstMonthKey } from "./features/overview/calendar.js";
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
  repos.participantsRepo,
  repos.settingsRepo
);

registerReadyListener(client, scheduler);
registerInteractionCreateListener(client);
registerParticipantsListeners(client);
registerTodoListeners(client);
registerExpenseListeners(client);

client.once(Events.ClientReady, () => {
  scheduler.ensureStaleEventCheckScheduled();
  scheduler.ensurePayrollDraftScheduled();
  scheduler.ensureSelfReviewPanelScheduled();
  const rewards = new RewardsService(db, repos.settingsRepo, repos.eventsRepo);
  void rewards.ensureLeadDashboard(client);
  const selfReview = new SelfReviewService(db, repos.settingsRepo);
  void selfReview.ensurePanel(client, currentJstMonthKey());
  void reportOrphanEventThreads();
});

client.on(Events.Error, (error) => {
  logger.error({ error }, "discord client error");
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await client.login(config.discordToken);

async function reportOrphanEventThreads(): Promise<void> {
  const orphans = [];
  const events = repos.eventsRepo.listAll(1000);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    const channel = await client.channels.fetch(event.thread_id).catch(() => null);
    if (!channel) {
      orphans.push(event);
    }
    if ((index + 1) % 5 === 0) {
      await sleep(1000);
    }
  }

  if (orphans.length === 0) {
    return;
  }

  const owner = await client.users.fetch(config.ownerId).catch(() => null);
  if (!owner) {
    return;
  }

  await owner.send(
    [
      "以下のイベントのスレッドが見つかりません:",
      ...orphans.slice(0, 25).map((event) => `- ${event.title} (${event.thread_id})`),
      "",
      "削除するには /admin から整理してください。"
    ].join("\n")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shutdown(): void {
  logger.info("shutting down");
  scheduler.stop();
  closeDb();
  client.destroy();
  process.exit(0);
}

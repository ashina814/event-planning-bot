import type { Client } from "discord.js";
import type { AnnouncementsRepo } from "../db/repos/announcements.js";
import type { EventsRepo } from "../db/repos/events.js";
import type { ExpensesRepo } from "../db/repos/expenses.js";
import type { JobsRepo } from "../db/repos/jobs.js";
import type { RolesRepo } from "../db/repos/roles.js";
import type { SeriesRepo } from "../db/repos/series.js";
import type { SettingsRepo } from "../db/repos/settings.js";
import type { TimersRepo } from "../db/repos/timers.js";
import type { TodosRepo } from "../db/repos/todos.js";
import { logger } from "../lib/logger.js";
import { unixNow } from "../lib/time.js";
import { handleScheduledJob } from "./handlers.js";

export class SchedulerRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly client: Client,
    private readonly jobsRepo: JobsRepo,
    private readonly announcementsRepo: AnnouncementsRepo,
    private readonly eventsRepo: EventsRepo,
    private readonly rolesRepo: RolesRepo,
    private readonly seriesRepo: SeriesRepo,
    private readonly timersRepo: TimersRepo,
    private readonly todosRepo: TodosRepo,
    private readonly expensesRepo: ExpensesRepo,
    private readonly settingsRepo: SettingsRepo
  ) {}

  start(): void {
    if (this.timer) {
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, 1000);

    logger.info("scheduler started");
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    try {
      const now = unixNow();
      const jobs = this.jobsRepo.claimDue(now, 10);
      for (const job of jobs) {
        try {
          await handleScheduledJob(job, {
            client: this.client,
            announcementsRepo: this.announcementsRepo,
            eventsRepo: this.eventsRepo,
            rolesRepo: this.rolesRepo,
            seriesRepo: this.seriesRepo,
            timersRepo: this.timersRepo,
            todosRepo: this.todosRepo,
            expensesRepo: this.expensesRepo,
            settingsRepo: this.settingsRepo,
            jobsRepo: this.jobsRepo
          });
          this.jobsRepo.markFired(job.id, unixNow());
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error({ error: message, job }, "scheduled job failed");
          this.jobsRepo.markFailed(job.id, message);
        }
      }
    } finally {
      this.running = false;
    }
  }
}

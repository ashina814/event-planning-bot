import type { Client } from "discord.js";
import type { AnnouncementsRepo } from "../db/repos/announcements.js";
import type { EventsRepo } from "../db/repos/events.js";
import type { ExpensesRepo } from "../db/repos/expenses.js";
import type { JobsRepo } from "../db/repos/jobs.js";
import type { ParticipantsRepo } from "../db/repos/participants.js";
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
    private readonly participantsRepo: ParticipantsRepo,
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

  ensureStaleEventCheckScheduled(): void {
    if (this.jobsRepo.hasPendingKind("stale_event_check")) {
      return;
    }
    const now = unixNow();
    this.jobsRepo.create({
      kind: "stale_event_check",
      payload: {},
      fireAt: nextMondayTenJst(now),
      now
    });
  }

  ensurePayrollDraftScheduled(): void {
    if (this.jobsRepo.hasPendingKind("payroll_draft")) {
      return;
    }
    const now = unixNow();
    this.jobsRepo.create({
      kind: "payroll_draft",
      payload: {},
      fireAt: nextMonthFirstTenJst(now),
      now
    });
  }

  ensureSelfReviewPanelScheduled(): void {
    if (this.jobsRepo.hasPendingKind("self_review_panel")) {
      return;
    }
    const now = unixNow();
    this.jobsRepo.create({
      kind: "self_review_panel",
      payload: {},
      fireAt: nextMonthFirstTenJst(now),
      now
    });
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
            participantsRepo: this.participantsRepo,
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

export function nextMondayTenJst(now: number): number {
  const jst = new Date((now + 9 * 60 * 60) * 1000);
  const day = jst.getUTCDay();
  let daysUntilMonday = (8 - day) % 7;
  const candidate = Date.UTC(
    jst.getUTCFullYear(),
    jst.getUTCMonth(),
    jst.getUTCDate() + daysUntilMonday,
    1,
    0,
    0
  ) / 1000;

  if (candidate <= now) {
    daysUntilMonday += 7;
    return Date.UTC(
      jst.getUTCFullYear(),
      jst.getUTCMonth(),
      jst.getUTCDate() + daysUntilMonday,
      1,
      0,
      0
    ) / 1000;
  }

  return candidate;
}

export function nextMonthFirstTenJst(now: number): number {
  const jst = new Date((now + 9 * 60 * 60) * 1000);
  let year = jst.getUTCFullYear();
  let month = jst.getUTCMonth();
  let candidate = Date.UTC(year, month, 1, 1, 0, 0) / 1000;
  if (candidate <= now) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    candidate = Date.UTC(year, month, 1, 1, 0, 0) / 1000;
  }
  return candidate;
}

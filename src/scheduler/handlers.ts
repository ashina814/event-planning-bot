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
import { AnnouncementService } from "../features/announcement/service.js";
import { EventLifecycleService } from "../features/event-lifecycle/service.js";
import { ExpenseService } from "../features/expense/service.js";
import { TimekeeperService } from "../features/timekeeper/service.js";
import { TodoService } from "../features/todo/service.js";
import type { ScheduledJobRecord } from "../types/index.js";

interface SchedulerDeps {
  client: Client;
  announcementsRepo: AnnouncementsRepo;
  eventsRepo: EventsRepo;
  rolesRepo: RolesRepo;
  seriesRepo: SeriesRepo;
  timersRepo: TimersRepo;
  todosRepo: TodosRepo;
  expensesRepo: ExpensesRepo;
  settingsRepo: SettingsRepo;
  jobsRepo: JobsRepo;
}

export async function handleScheduledJob(job: ScheduledJobRecord, deps: SchedulerDeps): Promise<void> {
  const payload = JSON.parse(job.payload) as Record<string, unknown>;

  switch (job.kind) {
    case "event_auto_progress": {
      const threadId = String(payload.threadId ?? "");
      const scheduledAt = payload.scheduledAt ? Number(payload.scheduledAt) : null;
      if (!threadId) {
        throw new Error("event_auto_progress payload.threadId is required");
      }
      const service = new EventLifecycleService(
        deps.client,
        deps.eventsRepo,
        deps.rolesRepo,
        deps.seriesRepo,
        deps.jobsRepo,
        deps.settingsRepo
      );
      await service.autoProgress(threadId, scheduledAt);
      return;
    }
    case "announcement_post": {
      const announcementId = Number(payload.announcementId ?? 0);
      const channelId = String(payload.channelId ?? "");
      const scheduledAt = payload.scheduledAt ? Number(payload.scheduledAt) : null;
      if (!announcementId) {
        throw new Error("announcement_post payload.announcementId is required");
      }
      const service = new AnnouncementService(
        deps.client,
        deps.announcementsRepo,
        deps.eventsRepo,
        deps.rolesRepo,
        deps.jobsRepo,
        deps.settingsRepo
      );
      await service.postFromJob(announcementId, channelId, scheduledAt);
      return;
    }
    case "timer_section_prenotice":
    case "timer_section_start": {
      const scheduleId = Number(payload.scheduleId ?? 0);
      const sectionId = Number(payload.sectionId ?? 0);
      const minutes = Number(payload.minutes ?? 0);
      if (!scheduleId || !sectionId) {
        throw new Error(`${job.kind} payload.scheduleId and payload.sectionId are required`);
      }
      const service = new TimekeeperService(
        deps.client,
        deps.timersRepo,
        deps.eventsRepo,
        deps.rolesRepo,
        deps.seriesRepo,
        deps.jobsRepo,
        deps.settingsRepo
      );
      await service.notifySection(
        scheduleId,
        sectionId,
        job.kind === "timer_section_prenotice" ? "prenotice" : "start",
        minutes
      );
      return;
    }
    case "todo_due_reminder": {
      const todoId = Number(payload.todoId ?? 0);
      if (!todoId) {
        throw new Error("todo_due_reminder payload.todoId is required");
      }
      const service = new TodoService(
        deps.client,
        deps.todosRepo,
        deps.eventsRepo,
        deps.rolesRepo,
        deps.jobsRepo,
        deps.settingsRepo
      );
      await service.handleDueReminder(todoId);
      return;
    }
    case "expense_proof_timeout": {
      const expenseId = Number(payload.expenseId ?? 0);
      if (!expenseId) {
        throw new Error("expense_proof_timeout payload.expenseId is required");
      }
      const service = new ExpenseService(
        deps.client,
        deps.expensesRepo,
        deps.eventsRepo,
        deps.rolesRepo,
        deps.jobsRepo,
        deps.settingsRepo
      );
      await service.handleProofTimeout(expenseId);
      return;
    }
    case "event_reminder_retrospective": {
      const threadId = String(payload.threadId ?? "");
      const scheduledAt = payload.scheduledAt ? Number(payload.scheduledAt) : null;
      if (!threadId) {
        throw new Error("event_reminder_retrospective payload.threadId is required");
      }
      const service = new EventLifecycleService(
        deps.client,
        deps.eventsRepo,
        deps.rolesRepo,
        deps.seriesRepo,
        deps.jobsRepo,
        deps.settingsRepo
      );
      await service.handleRetrospectiveReminder(threadId, scheduledAt);
      return;
    }
    default:
      logger.warn({ job }, "scheduled job kind has no handler yet");
      throw new Error(`handler not implemented: ${job.kind}`);
  }
}

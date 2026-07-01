import type Database from "better-sqlite3";
import { AnnouncementsRepo } from "./announcements.js";
import { EventsRepo } from "./events.js";
import { ExpensesRepo } from "./expenses.js";
import { JobsRepo } from "./jobs.js";
import { ParticipantsRepo } from "./participants.js";
import { RolesRepo } from "./roles.js";
import { SeriesRepo } from "./series.js";
import { SettingsRepo } from "./settings.js";
import { TimersRepo } from "./timers.js";
import { TodosRepo } from "./todos.js";

export function createRepos(db: Database.Database) {
  return {
    announcementsRepo: new AnnouncementsRepo(db),
    eventsRepo: new EventsRepo(db),
    expensesRepo: new ExpensesRepo(db),
    jobsRepo: new JobsRepo(db),
    participantsRepo: new ParticipantsRepo(db),
    rolesRepo: new RolesRepo(db),
    seriesRepo: new SeriesRepo(db),
    settingsRepo: new SettingsRepo(db),
    timersRepo: new TimersRepo(db),
    todosRepo: new TodosRepo(db)
  };
}

export type Repos = ReturnType<typeof createRepos>;

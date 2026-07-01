import type { EventsRepo } from "../../db/repos/events.js";
import type { ExpensesRepo } from "../../db/repos/expenses.js";
import type { RolesRepo } from "../../db/repos/roles.js";
import type { EventStatus } from "../../types/index.js";
import { monthBounds } from "./calendar.js";

export interface OverviewStats {
  monthKey: string;
  statusCounts: Array<{ status: EventStatus; count: number }>;
  expenseCategoryTotals: Array<{ category: string; total: number }>;
  eventExpenseRanking: Array<{ title: string; total: number }>;
  seriesCounts: Array<{ name: string; count: number }>;
  roleCounts: Array<{ user_id: string; count: number }>;
}

export class OverviewService {
  constructor(
    private readonly eventsRepo: EventsRepo,
    private readonly expensesRepo: ExpensesRepo,
    private readonly rolesRepo: RolesRepo
  ) {}

  calendar(monthKey: string) {
    const bounds = monthBounds(monthKey);
    return {
      bounds,
      events: this.eventsRepo.listScheduledBetween(bounds.startAt, bounds.endAt, 100)
    };
  }

  stats(monthKey: string): OverviewStats {
    const bounds = monthBounds(monthKey);
    return {
      monthKey,
      statusCounts: this.eventsRepo.countByStatusBetween(bounds.startAt, bounds.endAt),
      expenseCategoryTotals: this.expensesRepo.totalsByCategoryBetween(
        bounds.startAt,
        bounds.endAt,
        "out"
      ),
      eventExpenseRanking: this.expensesRepo.rankingByEventBetween(bounds.startAt, bounds.endAt, 10),
      seriesCounts: this.eventsRepo.countBySeriesBetween(bounds.startAt, bounds.endAt, 10),
      roleCounts: this.rolesRepo.countAssignmentsBetween(bounds.startAt, bounds.endAt, 10)
    };
  }
}

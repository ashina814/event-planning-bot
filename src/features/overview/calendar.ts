import { formatJstPlainDate, jstDateToUnixAtMidnight, unixNow } from "../../lib/time.js";
import type { EventRecord } from "../../types/index.js";

export interface MonthBounds {
  monthKey: string;
  year: number;
  month: number;
  startAt: number;
  endAt: number;
}

export function currentJstMonthKey(): string {
  return formatJstPlainDate(unixNow()).slice(0, 7);
}

export function parseMonthKey(monthKey: string): { year: number; month: number } {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) {
    throw new Error("月は YYYY-MM 形式で指定してください。");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("月は YYYY-MM 形式で指定してください。");
  }

  return { year, month };
}

export function monthBounds(monthKey: string): MonthBounds {
  const { year, month } = parseMonthKey(monthKey);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return {
    monthKey,
    year,
    month,
    startAt: jstDateToUnixAtMidnight(`${monthKey}-01`),
    endAt: jstDateToUnixAtMidnight(`${nextYear}-${String(nextMonth).padStart(2, "0")}-01`)
  };
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const { year, month } = parseMonthKey(monthKey);
  const zeroBased = year * 12 + (month - 1) + delta;
  const shiftedYear = Math.floor(zeroBased / 12);
  const shiftedMonth = (zeroBased % 12) + 1;
  return `${shiftedYear}-${String(shiftedMonth).padStart(2, "0")}`;
}

export function renderMonthCalendar(monthKey: string, events: EventRecord[]): string {
  const { year, month } = parseMonthKey(monthKey);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const eventDays = new Set(
    events
      .filter((event) => event.scheduled_at)
      .map((event) => Number(formatJstPlainDate(event.scheduled_at ?? 0).slice(8, 10)))
  );

  const rows: string[] = [`${year}年 ${month}月`, " 日  月  火  水  木  金  土"];
  let current = 1;

  while (current <= daysInMonth) {
    const cells: string[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      if ((rows.length === 2 && weekday < firstWeekday) || current > daysInMonth) {
        cells.push("    ");
        continue;
      }

      const day = String(current).padStart(2, " ");
      cells.push(eventDays.has(current) ? `[${day}]` : ` ${day} `);
      current += 1;
    }
    rows.push(cells.join(""));
  }

  return rows.join("\n");
}

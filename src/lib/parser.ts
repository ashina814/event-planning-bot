import type { EventStatus } from "../types/index.js";
import { jstDateTimeToUnix } from "./time.js";

const prefixes: Record<EventStatus, string> = {
  planning: "【企画中】",
  announcing: "【告知中】",
  announced: "【告知済】",
  in_progress: "【告知済】",
  postponed: "【延期】",
  done: "【完了】",
  cancelled: "【見送り】"
};

const prefixPattern = /^【(?:企画中|告知中|告知済|延期|完了|見送り)】\s*/;

export function statusPrefix(status: EventStatus): string {
  return prefixes[status];
}

export function stripStatusPrefix(title: string): string {
  return title.replace(prefixPattern, "").trim();
}

export function titleWithStatusPrefix(status: EventStatus, title: string): string {
  return `${statusPrefix(status)}${stripStatusPrefix(title)}`;
}

export function parseDiscordUserId(input: string): string | null {
  const match = input.match(/\d{15,25}/);
  return match?.[0] ?? null;
}

export function parseDiscordSnowflake(input: string, position: "first" | "last" = "first"): string | null {
  const matches = input.match(/\d{15,25}/g);
  if (!matches || matches.length === 0) {
    return null;
  }

  return position === "last" ? matches[matches.length - 1] ?? null : matches[0] ?? null;
}

export function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface ParsedTimetableLine {
  name: string;
  plannedStart: number;
}

export function parseTimetable(input: string, baseDate: string): ParsedTimetableLine[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let dayOffset = 0;
  let previousMinuteOfDay: number | null = null;

  return lines.map((line) => {
    const match = line.match(/^(\d{1,2}):(\d{1,2})\s+(.+)$/);
    if (!match) {
      throw new Error(`タイムテーブル行の形式が不正です: ${line}`);
    }

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const name = match[3]?.trim();
    if (
      !name ||
      !Number.isInteger(hour) ||
      !Number.isInteger(minute) ||
      hour < 0 ||
      hour > 23 ||
      minute < 0 ||
      minute > 59
    ) {
      throw new Error(`タイムテーブル行の形式が不正です: ${line}`);
    }

    const minuteOfDay = hour * 60 + minute;
    if (previousMinuteOfDay !== null && minuteOfDay < previousMinuteOfDay) {
      dayOffset += 1;
    }
    previousMinuteOfDay = minuteOfDay;

    const date = addDaysToPlainDate(baseDate, dayOffset);
    return {
      name,
      plannedStart: jstDateTimeToUnix(
        `${date} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      )
    };
  });
}

function addDaysToPlainDate(plainDate: string, offset: number): string {
  if (offset === 0) {
    return plainDate;
  }

  const match = plainDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("baseDate must be YYYY-MM-DD");
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + offset));
  return date.toISOString().slice(0, 10);
}

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ja } from "date-fns/locale/ja";

export const JST = "Asia/Tokyo";

export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

export function unixToDate(unixSeconds: number): Date {
  return new Date(unixSeconds * 1000);
}

const DATE_PARSE_ERROR = "日付が読めませんでした。例: 明日、今日、6/29、2026/6/29";
const TIME_PARSE_ERROR = "時刻が読めませんでした。例: 22:00、2200、22時";
const DATETIME_PARSE_ERROR = "日時が読めませんでした。例: 明日 22:00、6/29 22時、22:00";

interface JstDateParts {
  year: number;
  month: number;
  day: number;
}

interface JstDateTimeParts extends JstDateParts {
  hour: number;
  minute: number;
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function getJstParts(date: Date): JstDateTimeParts {
  const text = formatInTimeZone(date, JST, "yyyy-MM-dd-HH-mm");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error(DATETIME_PARSE_ERROR);
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5])
  };
}

function tryJstUnix(year: number, month: number, day: number, hour = 0, minute = 0): number | null {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const local = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00`;
  const date = fromZonedTime(local, JST);
  const time = date.getTime();
  if (!Number.isFinite(time)) {
    return null;
  }

  const expected = `${pad(year, 4)}-${pad(month)}-${pad(day)}-${pad(hour)}-${pad(minute)}`;
  const actual = formatInTimeZone(date, JST, "yyyy-MM-dd-HH-mm");
  if (actual !== expected) {
    return null;
  }

  return Math.floor(time / 1000);
}

function requireJstUnix(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  message: string
): number {
  const unix = tryJstUnix(year, month, day, hour, minute);
  if (unix === null) {
    throw new Error(message);
  }
  return unix;
}

function addDays(parts: JstDateParts, days: number): JstDateParts {
  const base = requireJstUnix(parts.year, parts.month, parts.day, 0, 0, DATE_PARSE_ERROR);
  return getJstParts(new Date((base + days * 24 * 60 * 60) * 1000));
}

function addMonths(year: number, month: number, months: number): Pick<JstDateParts, "year" | "month"> {
  const zeroBased = year * 12 + (month - 1) + months;
  return {
    year: Math.floor(zeroBased / 12),
    month: (zeroBased % 12) + 1
  };
}

function parseDateParts(input: string, now: Date): JstDateParts {
  const text = input.trim();
  const current = getJstParts(now);
  const nowUnix = Math.floor(now.getTime() / 1000);

  if (text === "今日") {
    return { year: current.year, month: current.month, day: current.day };
  }
  if (text === "明日") {
    return addDays(current, 1);
  }
  if (text === "明後日") {
    return addDays(current, 2);
  }

  let match =
    text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/) ??
    text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/);
  if (match) {
    return {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3])
    };
  }

  match =
    text.match(/^(\d{1,2})[/-](\d{1,2})$/) ??
    text.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    let year = current.year;
    let candidate = requireJstUnix(year, month, day, 0, 0, DATE_PARSE_ERROR);
    if (candidate < nowUnix) {
      year += 1;
      candidate = requireJstUnix(year, month, day, 0, 0, DATE_PARSE_ERROR);
    }
    return getJstParts(new Date(candidate * 1000));
  }

  match = text.match(/^(\d{1,2})日?$/);
  if (match) {
    const day = Number(match[1]);
    let { year, month } = current;
    let candidate = requireJstUnix(year, month, day, 0, 0, DATE_PARSE_ERROR);
    if (candidate < nowUnix) {
      ({ year, month } = addMonths(year, month, 1));
      candidate = requireJstUnix(year, month, day, 0, 0, DATE_PARSE_ERROR);
    }
    return getJstParts(new Date(candidate * 1000));
  }

  throw new Error(DATE_PARSE_ERROR);
}

function parseTimeParts(input: string): { hour: number; minute: number } | null {
  const text = input.trim();
  let match = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) {
    match = text.match(/^(\d{1,2})\s+(\d{1,2})$/);
  }
  if (!match) {
    match = text.match(/^(\d{1,2})時(?:(\d{1,2})分?)?$/);
  }

  if (match) {
    return validateTime(Number(match[1]), match[2] === undefined ? 0 : Number(match[2]));
  }

  if (/^\d{3,4}$/.test(text)) {
    const hourText = text.length === 3 ? text.slice(0, 1) : text.slice(0, 2);
    const minuteText = text.slice(-2);
    return validateTime(Number(hourText), Number(minuteText));
  }

  return null;
}

function validateTime(hour: number, minute: number): { hour: number; minute: number } | null {
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  return { hour, minute };
}

export function parseFlexibleDate(input: string, now = new Date()): number {
  const parts = parseDateParts(input, now);
  return requireJstUnix(parts.year, parts.month, parts.day, 0, 0, DATE_PARSE_ERROR);
}

export function parseFlexibleTime(input: string): { hour: number; minute: number } {
  const time = parseTimeParts(input);
  if (!time) {
    throw new Error(TIME_PARSE_ERROR);
  }
  return time;
}

export function parseFlexibleDateTime(input: string, now = new Date()): number {
  const text = input.trim();
  if (!text) {
    throw new Error(DATETIME_PARSE_ERROR);
  }

  try {
    const timeOnly = parseTimeParts(text);
    if (timeOnly) {
      const current = getJstParts(now);
      let candidate = requireJstUnix(
        current.year,
        current.month,
        current.day,
        timeOnly.hour,
        timeOnly.minute,
        DATETIME_PARSE_ERROR
      );
      if (candidate < Math.floor(now.getTime() / 1000)) {
        const tomorrow = addDays(current, 1);
        candidate = requireJstUnix(
          tomorrow.year,
          tomorrow.month,
          tomorrow.day,
          timeOnly.hour,
          timeOnly.minute,
          DATETIME_PARSE_ERROR
        );
      }
      return candidate;
    }

    const dateTimeMatch = text.match(/^(.+?)[\sT]+(.+)$/);
    if (dateTimeMatch) {
      const datePart = dateTimeMatch[1]?.trim() ?? "";
      const timePart = dateTimeMatch[2]?.trim() ?? "";
      if (datePart && timePart) {
        const date = getJstParts(new Date(parseFlexibleDate(datePart, now) * 1000));
        const time = parseFlexibleTime(timePart);
        return requireJstUnix(
          date.year,
          date.month,
          date.day,
          time.hour,
          time.minute,
          DATETIME_PARSE_ERROR
        );
      }
    }

    return parseFlexibleDate(text, now);
  } catch {
    throw new Error(DATETIME_PARSE_ERROR);
  }
}

export function jstDateTimeToUnix(input: string): number {
  return parseFlexibleDateTime(input);
}

export function formatJstDate(unixSeconds: number): string {
  return formatInTimeZone(unixToDate(unixSeconds), JST, "yyyy-MM-dd (E)", { locale: ja });
}

export function formatJstTime(unixSeconds: number): string {
  return formatInTimeZone(unixToDate(unixSeconds), JST, "HH:mm", { locale: ja });
}

export function formatJstPlainDate(unixSeconds: number): string {
  return formatInTimeZone(unixToDate(unixSeconds), JST, "yyyy-MM-dd", { locale: ja });
}

export function formatJstDateTime(unixSeconds: number): string {
  return `${formatJstDate(unixSeconds)} ${formatJstTime(unixSeconds)} JST`;
}

export function weekdayJst(unixSeconds: number): string {
  return formatInTimeZone(unixToDate(unixSeconds), JST, "E", { locale: ja });
}

export function jstDateToUnixAtMidnight(date: string): number {
  return parseFlexibleDate(date);
}

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ja } from "date-fns/locale/ja";

export const JST = "Asia/Tokyo";

export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

export function unixToDate(unixSeconds: number): Date {
  return new Date(unixSeconds * 1000);
}

export function jstDateTimeToUnix(input: string): number {
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) {
    throw new Error("日時は YYYY-MM-DD HH:mm 形式で入力してください。");
  }

  const [, year, month, day, hour, minute] = match;
  const local = `${year}-${month}-${day}T${hour}:${minute}:00`;
  return Math.floor(fromZonedTime(local, JST).getTime() / 1000);
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
  const match = date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("日付は YYYY-MM-DD 形式で入力してください。");
  }
  return jstDateTimeToUnix(`${date} 00:00`);
}

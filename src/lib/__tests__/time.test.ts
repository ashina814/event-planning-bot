import { formatInTimeZone } from "date-fns-tz";
import { describe, expect, test } from "vitest";
import {
  JST,
  parseFlexibleDate,
  parseFlexibleDateTime,
  parseFlexibleTime
} from "../time.js";

const fixedNow = new Date("2026-07-01T03:00:00Z");

function formatDate(unixSeconds: number): string {
  return formatInTimeZone(new Date(unixSeconds * 1000), JST, "yyyy-MM-dd");
}

function formatDateTime(unixSeconds: number): string {
  return formatInTimeZone(new Date(unixSeconds * 1000), JST, "yyyy-MM-dd HH:mm");
}

describe("parseFlexibleDate", () => {
  test.each([
    ["明日", "2026-07-02"],
    ["今日", "2026-07-01"],
    ["明後日", "2026-07-03"],
    ["6/29", "2027-06-29"],
    ["7/5", "2026-07-05"],
    ["7-5", "2026-07-05"],
    ["7月5日", "2026-07-05"],
    ["5", "2026-07-05"],
    ["29", "2026-07-29"],
    ["2026/12/31", "2026-12-31"],
    ["2026-12-31", "2026-12-31"],
    ["2026年12月31日", "2026-12-31"]
  ])("%s -> %s", (input, expectedDate) => {
    expect(formatDate(parseFlexibleDate(input, fixedNow))).toBe(expectedDate);
  });

  test("日付が読めない入力はエラー", () => {
    expect(() => parseFlexibleDate("来週", fixedNow)).toThrow(
      "日付が読めませんでした。例: 明日、今日、6/29、2026/6/29"
    );
  });
});

describe("parseFlexibleTime", () => {
  test.each([
    ["22:00", { hour: 22, minute: 0 }],
    ["2200", { hour: 22, minute: 0 }],
    ["22 00", { hour: 22, minute: 0 }],
    ["22時", { hour: 22, minute: 0 }],
    ["22時00分", { hour: 22, minute: 0 }],
    ["22:0", { hour: 22, minute: 0 }],
    ["2:5", { hour: 2, minute: 5 }],
    ["9時30分", { hour: 9, minute: 30 }]
  ])("%s -> %o", (input, expected) => {
    expect(parseFlexibleTime(input)).toEqual(expected);
  });

  test("時刻範囲外はエラー", () => {
    expect(() => parseFlexibleTime("25:00")).toThrow();
    expect(() => parseFlexibleTime("22:60")).toThrow();
  });
});

describe("parseFlexibleDateTime", () => {
  test.each([
    ["明日 22:00", "2026-07-02 22:00"],
    ["6/29 22時", "2027-06-29 22:00"],
    ["2026-06-29 22:00", "2026-06-29 22:00"],
    ["6/29 2200", "2027-06-29 22:00"],
    ["明日", "2026-07-02 00:00"],
    ["22:00", "2026-07-01 22:00"],
    ["10:00", "2026-07-02 10:00"]
  ])("%s -> %s", (input, expectedDateTime) => {
    expect(formatDateTime(parseFlexibleDateTime(input, fixedNow))).toBe(expectedDateTime);
  });

  test("日時が読めない入力はエラー", () => {
    expect(() => parseFlexibleDateTime("いつか 22:00", fixedNow)).toThrow(
      "日時が読めませんでした。例: 明日 22:00、6/29 22時、22:00"
    );
  });
});

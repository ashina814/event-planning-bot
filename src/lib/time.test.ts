import { describe, expect, it } from "vitest";
import { jstDateToUnixAtMidnight, weekdayJst } from "./time.js";

describe("weekdayJst", () => {
  it.each([
    ["2026-06-29", "月"],
    ["2026-07-01", "水"],
    ["2026-01-01", "木"],
    ["2026-12-31", "木"]
  ])("%s is %s in JST", (date, expected) => {
    expect(weekdayJst(jstDateToUnixAtMidnight(date))).toBe(expected);
  });
});

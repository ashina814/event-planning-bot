import { describe, expect, test } from "vitest";
import { parseTimetable } from "./parser.js";

describe("parseTimetable", () => {
  test("midnight rollover advances to the next JST date", () => {
    const lines = parseTimetable("22:00 集合\n23:50 締め\n0:08 解散", "2026-06-29");
    expect(lines.map((line) => line.name)).toEqual(["集合", "締め", "解散"]);
    expect(lines[2]?.plannedStart).toBe(1782745680);
  });
});

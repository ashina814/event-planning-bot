import { describe, expect, it } from "vitest";
import { monthBounds, shiftMonthKey } from "./calendar.js";

describe("overview calendar helpers", () => {
  it("shifts months across years", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
  });

  it("returns JST month bounds", () => {
    const bounds = monthBounds("2026-07");
    expect(bounds.monthKey).toBe("2026-07");
    expect(bounds.year).toBe(2026);
    expect(bounds.month).toBe(7);
    expect(bounds.startAt).toBeLessThan(bounds.endAt);
  });
});

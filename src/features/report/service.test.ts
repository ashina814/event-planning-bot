import { describe, expect, it } from "vitest";
import { detectRoleBias } from "./bias.js";

describe("detectRoleBias", () => {
  it("flags a role when one user holds at least the threshold share", () => {
    const [result] = detectRoleBias(
      [
        {
          label: "司会・進行",
          counts: [
            { userId: "b", count: 3 },
            { userId: "d", count: 2 }
          ]
        }
      ],
      0.5
    );
    expect(result?.flagged).toBe(true);
    expect(result?.topUserId).toBe("b");
    expect(result?.topCount).toBe(3);
    expect(result?.total).toBe(5);
    expect(result?.topShare).toBeCloseTo(0.6);
  });

  it("does not flag an evenly shared role", () => {
    const [result] = detectRoleBias(
      [
        {
          label: "主担当",
          counts: [
            { userId: "a", count: 2 },
            { userId: "b", count: 2 },
            { userId: "c", count: 1 }
          ]
        }
      ],
      0.5
    );
    expect(result?.flagged).toBe(false);
    expect(result?.topShare).toBeCloseTo(0.4);
  });

  it("flags exactly at the threshold boundary", () => {
    const [result] = detectRoleBias(
      [
        {
          label: "サポート",
          counts: [
            { userId: "a", count: 1 },
            { userId: "b", count: 1 }
          ]
        }
      ],
      0.5
    );
    expect(result?.flagged).toBe(true);
    expect(result?.topShare).toBeCloseTo(0.5);
  });

  it("drops roles with no assignments", () => {
    const results = detectRoleBias([{ label: "告知担当", counts: [] }], 0.5);
    expect(results).toHaveLength(0);
  });
});

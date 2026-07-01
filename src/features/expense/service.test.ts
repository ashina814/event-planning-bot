import { describe, expect, it } from "vitest";
import { parseAmount, parseExpenseCategory, parseExpenseDirection } from "./parser.js";

describe("expense parsers", () => {
  it("normalizes Japanese aliases", () => {
    expect(parseExpenseCategory("賞金")).toBe("prize");
    expect(parseExpenseDirection("返金")).toBe("in");
  });

  it("parses comma separated amounts", () => {
    expect(parseAmount("12,345")).toBe(12345);
  });
});

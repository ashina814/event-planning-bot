import { describe, expect, it } from "vitest";
import { extractTodoCandidates } from "./parser.js";

describe("extractTodoCandidates", () => {
  it("extracts bullet candidates from ToDo section", () => {
    expect(
      extractTodoCandidates(
        [
          "【議題】",
          "something",
          "【ToDo】",
          "・告知文を作る",
          "- [ ] エントリーシートを確認",
          "ただのメモ",
          "【次回】",
          "done"
        ].join("\n")
      )
    ).toEqual(["告知文を作る", "エントリーシートを確認"]);
  });
});

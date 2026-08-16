import { describe, expect, it } from "vitest";
import { titleCaseIfNoCaps, titleCaseWords } from "./text.js";

describe("titleCaseWords", () => {
  it("trims, collapses spaces, and capitalizes each word's first letter", () => {
    expect(titleCaseWords("jtswing  team jv")).toBe("Jtswing Team Jv");
    expect(titleCaseWords("john doe")).toBe("John Doe");
    expect(titleCaseWords("jtSwing  team jv")).toBe("JtSwing Team Jv");
  });
});

describe("titleCaseIfNoCaps", () => {
  it("title-cases all-lowercase words but preserves words that already have caps", () => {
    expect(titleCaseIfNoCaps("jtswing team jv")).toBe("Jtswing Team Jv");
    expect(titleCaseIfNoCaps("JTSwing Team JV")).toBe("JTSwing Team JV");
    expect(titleCaseIfNoCaps("jtSwing team")).toBe("jtSwing Team");
  });
});

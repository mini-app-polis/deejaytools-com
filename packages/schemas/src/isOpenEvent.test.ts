import { describe, expect, it } from "vitest";
import { isOpenEvent } from "./index.js";

describe("isOpenEvent", () => {
  it("matches the canonical name regardless of case, spacing, or punctuation", () => {
    for (const name of [
      "The Open",
      "the open",
      "THE OPEN",
      "theopen",
      "TheOpen",
      "The-Open",
      "  The   Open  ",
      "The Open 2026",
      "The Open — Spring 2026",
    ]) {
      expect(isOpenEvent(name), name).toBe(true);
    }
  });

  it("matches names that lead with Open", () => {
    expect(isOpenEvent("Open Swing Dance Championships")).toBe(true);
    expect(isOpenEvent("open 2026")).toBe(true);
  });

  it("does not match unrelated events", () => {
    for (const name of [
      "Spring Classic",
      "Boogie by the Bay",
      "Summer Hustle Open Prelims",
      "Reopening Gala",
      "US Open of Salsa",
    ]) {
      expect(isOpenEvent(name), name).toBe(false);
    }
  });

  it("treats empty and nullish names as not The Open", () => {
    expect(isOpenEvent("")).toBe(false);
    expect(isOpenEvent(null)).toBe(false);
    expect(isOpenEvent(undefined)).toBe(false);
  });
});

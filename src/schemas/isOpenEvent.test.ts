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
      "The Open - Swing Dance Championships",
    ]) {
      expect(isOpenEvent(name), name).toBe(true);
    }
  });

  it("does NOT match a bare leading Open", () => {
    // Previously true. "Open Practice Night" being rerouted to the dedicated
    // Open submission page is the bug this predicate was tightened to fix.
    expect(isOpenEvent("Open Swing Dance Championships")).toBe(false);
    expect(isOpenEvent("open 2026")).toBe(false);
    expect(isOpenEvent("Open Practice Night")).toBe(false);
  });

  it("does not match 'theopen' appearing mid-name across word boundaries", () => {
    // Normalization strips spaces, so a substring check would match these.
    expect(isOpenEvent("Breathe Open Air")).toBe(false);
    expect(isOpenEvent("Smooth Openers")).toBe(false);
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

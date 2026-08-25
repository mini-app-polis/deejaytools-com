import { describe, expect, it } from "vitest";
import { DIVISION_GROUPS, DIVISIONS } from "./index.js";

/** Guard against silently dropping a division while regrouping. */
const ALL_DIVISIONS = [
  "Classic",
  "Showcase",
  "Rising Star Classic",
  "Rising Star Showcase",
  "Sophisticated",
  "Masters",
  "Teams",
  "ProAm LeaderAm",
  "ProAm FollowerAm",
  "NovInt Routines",
  "Juniors",
  "Young Adult",
  "Exhibition",
  "Superstar",
  "Cabaret",
  "Carolina Shag Divisions",
  "My Division Is Not Listed",
] as const;

describe("DIVISIONS", () => {
  it("contains exactly the 17 expected division values", () => {
    expect(DIVISIONS).toHaveLength(17);
    expect([...DIVISIONS].sort()).toEqual([...ALL_DIVISIONS].sort());
  });

  it("matches DIVISION_GROUPS flattened in order", () => {
    expect(DIVISIONS).toEqual(DIVISION_GROUPS.flat());
  });

  it("lists each division in exactly one group", () => {
    const seen = new Set<string>();
    for (const group of DIVISION_GROUPS) {
      for (const division of group) {
        expect(seen.has(division)).toBe(false);
        seen.add(division);
      }
    }
    expect(seen.size).toBe(17);
  });
});

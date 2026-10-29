import type { DivisionList } from "@/hooks/useDivisions";

/** The division list as GET /v1/divisions serves it, for unit tests. */
export const TEST_DIVISION_GROUPS: readonly (readonly string[])[] = [
  ["Classic", "Showcase", "Rising Star Classic", "Rising Star Showcase"],
  ["ProAm LeaderAm", "ProAm FollowerAm", "NovInt Routines"],
  ["Sophisticated", "Masters", "Juniors", "Young Adult"],
  ["Exhibition", "Superstar"],
  ["Carolina Shag Divisions"],
  ["Teams", "Cabaret"],
  ["My Division Is Not Listed"],
];

export const TEST_DIVISIONS: readonly string[] = TEST_DIVISION_GROUPS.flat();

/** What useDivisions returns once the list has loaded. */
export const LOADED_DIVISIONS: DivisionList = {
  groups: TEST_DIVISION_GROUPS,
  divisions: TEST_DIVISIONS,
  loading: false,
  error: null,
};

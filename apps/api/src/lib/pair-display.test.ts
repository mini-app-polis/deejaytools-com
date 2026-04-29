import { describe, expect, it, beforeEach } from "vitest";
import { vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — must be hoisted before importing the module under test.
// ---------------------------------------------------------------------------

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});

import { buildPairDisplayName, loadPairDisplayNames } from "./pair-display.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

// ---------------------------------------------------------------------------
// buildPairDisplayName — pure function, no mocks needed
// ---------------------------------------------------------------------------

describe("buildPairDisplayName", () => {
  it("builds 'Leader First Last / Follower First Last' when all names are present", () => {
    expect(buildPairDisplayName("Alice", "Smith", "Bob", "Jones"))
      .toBe("Alice Smith / Bob Jones");
  });

  it("uses only first name when last name is null", () => {
    expect(buildPairDisplayName("Alice", null, "Bob", null))
      .toBe("Alice / Bob");
  });

  it("uses only last name when first name is null", () => {
    expect(buildPairDisplayName(null, "Smith", null, "Jones"))
      .toBe("Smith / Jones");
  });

  it("renders '—' for the leader side when both leader names are null", () => {
    expect(buildPairDisplayName(null, null, "Bob", "Jones"))
      .toBe("— / Bob Jones");
  });

  it("renders '—' for the follower side when both follower names are null", () => {
    expect(buildPairDisplayName("Alice", "Smith", null, null))
      .toBe("Alice Smith / —");
  });

  it("renders '— / —' when all four names are null", () => {
    expect(buildPairDisplayName(null, null, null, null))
      .toBe("— / —");
  });

  it("trims whitespace from each name part", () => {
    expect(buildPairDisplayName("  Alice  ", "  Smith  ", "  Bob  ", "  Jones  "))
      .toBe("Alice Smith / Bob Jones");
  });

  it("handles empty-string names the same as null (treated as missing)", () => {
    // Empty strings are falsy — filter(Boolean) removes them.
    expect(buildPairDisplayName("", "Smith", "Bob", ""))
      .toBe("Smith / Bob");
  });

  it("supports solo entries where one side has only one name", () => {
    expect(buildPairDisplayName("Alice", null, "Bob", "Jones"))
      .toBe("Alice / Bob Jones");
  });
});

// ---------------------------------------------------------------------------
// loadPairDisplayNames — uses the DB mock
// ---------------------------------------------------------------------------

describe("loadPairDisplayNames", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns an empty map when given an empty array", async () => {
    const result = await loadPairDisplayNames([]);
    expect(result.size).toBe(0);
  });

  it("returns a map keyed by pair id with formatted display names", async () => {
    enqueueSelectResult([
      { pairId: "pair-1", uaFirst: "Alice", uaLast: "Smith", ptFirst: "Bob", ptLast: "Jones" },
      { pairId: "pair-2", uaFirst: "Carol", uaLast: "Lee",   ptFirst: null,  ptLast: null  },
    ]);

    const result = await loadPairDisplayNames(["pair-1", "pair-2"]);

    expect(result.get("pair-1")).toBe("Alice Smith / Bob Jones");
    expect(result.get("pair-2")).toBe("Carol Lee / —");
  });

  it("deduplicates repeated pair ids before querying", async () => {
    enqueueSelectResult([
      { pairId: "pair-1", uaFirst: "Alice", uaLast: "Smith", ptFirst: "Bob", ptLast: "Jones" },
    ]);

    // Same id supplied twice — should still produce one map entry.
    const result = await loadPairDisplayNames(["pair-1", "pair-1"]);

    expect(result.size).toBe(1);
    expect(result.get("pair-1")).toBe("Alice Smith / Bob Jones");
  });

  it("returns an empty map when the DB returns no rows for the given ids", async () => {
    enqueueSelectResult([]); // no matching rows

    const result = await loadPairDisplayNames(["pair-unknown"]);

    expect(result.size).toBe(0);
  });
});

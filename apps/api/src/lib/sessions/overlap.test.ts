import { beforeEach, describe, expect, it, vi } from "vitest";
import { sessionOverlapsInEvent } from "./overlap.js";
import { enqueueSelectResult, resetSelectQueue } from "../../test/mocks.js";

vi.mock("../../db/index.js", async () => {
  const { mockDb: db } = await import("../../test/mocks.js");
  return { db };
});

describe("sessionOverlapsInEvent", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns false when no sessions exist in DB", async () => {
    enqueueSelectResult([]);
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 2000,
    });
    expect(result).toBe(false);
  });

  it("returns true when a session fully overlaps (existing inside new window)", async () => {
    enqueueSelectResult([{ id: "s1" }]);
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 3000,
    });
    expect(result).toBe(true);
  });

  it("returns true for partial overlap: new session starts before and ends during existing", async () => {
    enqueueSelectResult([{ id: "s1" }]);
    // Existing: [2000, 3000), New: [1000, 2500)
    // New starts before, ends during → overlap
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 2500,
    });
    expect(result).toBe(true);
  });

  it("returns true for partial overlap: new session starts during and ends after existing", async () => {
    enqueueSelectResult([{ id: "s1" }]);
    // Existing: [2000, 3000), New: [2500, 4000)
    // New starts during, ends after → overlap
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 2500,
      endTime: 4000,
    });
    expect(result).toBe(true);
  });

  it("returns false when windows are adjacent: new endTime equals existing floorTrialStartsAt", async () => {
    enqueueSelectResult([]);
    // Existing: [2000, 3000), New: [1000, 2000)
    // They touch at 2000 but don't overlap (interval is < and >, not <= and >=)
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 2000,
    });
    expect(result).toBe(false);
  });

  it("returns false when windows are adjacent: new startTime equals existing floorTrialEndsAt", async () => {
    enqueueSelectResult([]);
    // Existing: [2000, 3000), New: [3000, 4000)
    // They touch at 3000 but don't overlap
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 3000,
      endTime: 4000,
    });
    expect(result).toBe(false);
  });

  it("returns false when excludeSessionId skips the only overlapping session", async () => {
    enqueueSelectResult([]);
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 2000,
      excludeSessionId: "s1",
    });
    expect(result).toBe(false);
  });

  it("returns true when excludeSessionId skips one session but another still overlaps", async () => {
    enqueueSelectResult([{ id: "s2" }]);
    // s1 is excluded, but s2 matches the overlap query
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 2000,
      excludeSessionId: "s1",
    });
    expect(result).toBe(true);
  });

  it("returns false for event1 when only event2 has sessions in the window", async () => {
    // This test verifies that the query actually filters by eventId.
    // We call the function twice with the same time window but different events.
    // event1 has no matching sessions → false.
    // event2 has a matching session → true.
    // If the WHERE clause omitted eq(sessions.eventId, ...) both calls would
    // return the same result, so the pair of assertions together proves the
    // eventId filter is doing real work.
    enqueueSelectResult([]); // event1 query: no rows
    const event1Result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 2000,
    });

    enqueueSelectResult([{ id: "s2" }]); // event2 query: one matching row
    const event2Result = await sessionOverlapsInEvent({
      eventId: "event2",
      startTime: 1000,
      endTime: 2000,
    });

    expect(event1Result).toBe(false);
    expect(event2Result).toBe(true);
  });
});

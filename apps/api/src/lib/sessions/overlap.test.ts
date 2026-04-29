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

  it("returns false when different eventId has overlapping sessions", async () => {
    enqueueSelectResult([]);
    // No sessions in event1, even though other events might have overlaps
    const result = await sessionOverlapsInEvent({
      eventId: "event1",
      startTime: 1000,
      endTime: 2000,
    });
    expect(result).toBe(false);
  });
});

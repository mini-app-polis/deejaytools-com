import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", async () => {
  const { mockDb: db } = await import("../../test/mocks.js");
  return { db };
});
import {
  canPromoteNonPriority,
  canPromotePriority,
  determineInitialQueue,
  type AdmissionContext,
} from "./admission.js";
import * as runCounts from "./runCounts.js";

describe("canPromotePriority", () => {
  it("is true when activeCount < activePriorityMax", () => {
    expect(
      canPromotePriority({
        activeCount: 5,
        priorityCount: 2,
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
      })
    ).toBe(true);
  });

  it("is false when activeCount equals activePriorityMax", () => {
    expect(
      canPromotePriority({
        activeCount: 6,
        priorityCount: 0,
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
      })
    ).toBe(false);
  });
});

describe("canPromoteNonPriority", () => {
  it("is true only when active below non-priority cap and priority queue empty", () => {
    expect(
      canPromoteNonPriority({
        activeCount: 3,
        priorityCount: 0,
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
      })
    ).toBe(true);
  });

  it("is false when priority queue has entries", () => {
    expect(
      canPromoteNonPriority({
        activeCount: 0,
        priorityCount: 1,
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
      })
    ).toBe(false);
  });

  it("is false when active is at non-priority cap", () => {
    expect(
      canPromoteNonPriority({
        activeCount: 4,
        priorityCount: 0,
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
      })
    ).toBe(false);
  });
});

describe("determineInitialQueue", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const baseCtx: AdmissionContext = {
    sessionId: "s1",
    eventId: "e1",
    divisionName: "Classic",
    isDivisionPriority: true,
    sessionPriorityRunLimit: 3,
    eventPriorityRunLimit: 2,
  };

  const pairEntity = { pairId: "p1" };

  it("returns non_priority when division is not priority", async () => {
    const ctx = { ...baseCtx, isDivisionPriority: false };
    await expect(determineInitialQueue(pairEntity, ctx)).resolves.toBe("non_priority");
  });

  it("returns non_priority when session run limit reached", async () => {
    vi.spyOn(runCounts, "runsForEntityInSession").mockResolvedValue(3);
    vi.spyOn(runCounts, "runsForEntityInEvent").mockResolvedValue(0);
    await expect(determineInitialQueue(pairEntity, baseCtx)).resolves.toBe("non_priority");
  });

  it("returns non_priority when event limit set and reached", async () => {
    vi.spyOn(runCounts, "runsForEntityInSession").mockResolvedValue(0);
    vi.spyOn(runCounts, "runsForEntityInEvent").mockResolvedValue(2);
    await expect(determineInitialQueue(pairEntity, baseCtx)).resolves.toBe("non_priority");
  });

  it("returns priority when under both limits", async () => {
    vi.spyOn(runCounts, "runsForEntityInSession").mockResolvedValue(1);
    vi.spyOn(runCounts, "runsForEntityInEvent").mockResolvedValue(1);
    await expect(determineInitialQueue(pairEntity, baseCtx)).resolves.toBe("priority");
  });

  it("ignores event limit when eventPriorityRunLimit is null", async () => {
    vi.spyOn(runCounts, "runsForEntityInSession").mockResolvedValue(0);
    const spyEvent = vi.spyOn(runCounts, "runsForEntityInEvent");
    await expect(
      determineInitialQueue(pairEntity, { ...baseCtx, eventPriorityRunLimit: null })
    ).resolves.toBe("priority");
    expect(spyEvent).not.toHaveBeenCalled();
  });
});

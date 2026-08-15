import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", async () => {
  const { mockDb: db } = await import("../../test/mocks.js");
  return { db };
});

import { fillActiveQueue } from "./fill.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../../test/mocks.js";

type Tx = Parameters<typeof fillActiveQueue>[0];
const tx = mockDb as unknown as Tx;

const now = Date.now();

function runningSession(overrides: Record<string, unknown> = {}) {
  return {
    status: "in_progress",
    activePriorityMax: 2,
    activeNonPriorityMax: 4,
    floorTrialStartsAt: now - 10_000,
    floorTrialEndsAt: now + 10_000,
    ...overrides,
  };
}

describe("fillActiveQueue", () => {
  beforeEach(() => {
    resetSelectQueue();
    vi.clearAllMocks();
  });

  it("promotes priority entries up to activePriorityMax, then stops", async () => {
    enqueueSelectResult([runningSession()]);
    // Pass 1
    enqueueSelectResult([{ n: 0 }]); // active
    enqueueSelectResult([{ n: 3 }]); // priority waiting
    enqueueSelectResult([
      {
        id: "qe_p1",
        checkinId: "c1",
        entityPairId: null,
        entitySoloUserId: "u1",
        entityManagedPartnershipId: null,
        position: 1,
      },
    ]);
    enqueueSelectResult([]); // compact
    enqueueSelectResult([{ max: 0 }]); // nextBottom active
    // Pass 2
    enqueueSelectResult([{ n: 1 }]);
    enqueueSelectResult([{ n: 2 }]);
    enqueueSelectResult([
      {
        id: "qe_p2",
        checkinId: "c2",
        entityPairId: null,
        entitySoloUserId: "u2",
        entityManagedPartnershipId: null,
        position: 1,
      },
    ]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ max: 1 }]);
    // Pass 3 — priority cap full with priority still waiting → stop
    enqueueSelectResult([{ n: 2 }]);
    enqueueSelectResult([{ n: 1 }]);

    const promoted = await fillActiveQueue(tx, "s1", "admin1", now);
    expect(promoted).toBe(2);
  });

  it("promotes a standard entry only when priority is empty and under non-priority cap", async () => {
    enqueueSelectResult([runningSession({ activePriorityMax: 6 })]);
    enqueueSelectResult([{ n: 0 }]); // active
    enqueueSelectResult([{ n: 0 }]); // priority empty
    enqueueSelectResult([
      {
        id: "qe_np1",
        checkinId: "c3",
        entityPairId: null,
        entitySoloUserId: "u3",
        entityManagedPartnershipId: null,
        position: 1,
      },
    ]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ max: 0 }]);
    // Next pass: active full for non-priority or empty waiting
    enqueueSelectResult([{ n: 1 }]);
    enqueueSelectResult([{ n: 0 }]);
    enqueueSelectResult([]); // no more standard entries

    const promoted = await fillActiveQueue(tx, "s1", "admin1", now);
    expect(promoted).toBe(1);
  });

  it("promotes nothing when priority is waiting and the priority cap is full", async () => {
    enqueueSelectResult([runningSession({ activePriorityMax: 2 })]);
    enqueueSelectResult([{ n: 2 }]); // active at priority cap
    enqueueSelectResult([{ n: 1 }]); // priority still waiting

    const promoted = await fillActiveQueue(tx, "s1", "admin1", now);
    expect(promoted).toBe(0);
  });

  it("returns 0 when now is outside the floor-trial window", async () => {
    enqueueSelectResult([
      runningSession({
        floorTrialStartsAt: now + 60_000,
        floorTrialEndsAt: now + 120_000,
      }),
    ]);
    const promoted = await fillActiveQueue(tx, "s1", null, now);
    expect(promoted).toBe(0);
  });

  it("returns 0 when the session is cancelled", async () => {
    enqueueSelectResult([runningSession({ status: "cancelled" })]);
    const promoted = await fillActiveQueue(tx, "s1", null, now);
    expect(promoted).toBe(0);
  });
});

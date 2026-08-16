import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", async () => {
  const { mockDb: db } = await import("../../test/mocks.js");
  return { db };
});

import { fillActiveQueue, type LockedSession } from "./fill.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../../test/mocks.js";

type Tx = Parameters<typeof fillActiveQueue>[0];
const tx = mockDb as unknown as Tx;

const now = Date.now();

function lockedSession(overrides: Partial<LockedSession> = {}): LockedSession {
  return {
    id: "s1",
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

    const promoted = await fillActiveQueue(tx, lockedSession(), "admin1", now);
    expect(promoted).toBe(2);
  });

  it("promotes a standard entry only when priority is empty and under non-priority cap", async () => {
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
    enqueueSelectResult([{ n: 1 }]);
    enqueueSelectResult([{ n: 0 }]);
    enqueueSelectResult([]); // no more standard entries

    const promoted = await fillActiveQueue(
      tx,
      lockedSession({ activePriorityMax: 6 }),
      "admin1",
      now
    );
    expect(promoted).toBe(1);
  });

  it("promotes nothing when priority is waiting and the priority cap is full", async () => {
    enqueueSelectResult([{ n: 2 }]); // active at priority cap
    enqueueSelectResult([{ n: 1 }]); // priority still waiting

    const promoted = await fillActiveQueue(tx, lockedSession({ activePriorityMax: 2 }), "admin1", now);
    expect(promoted).toBe(0);
  });

  it("returns 0 when now is outside the floor-trial window", async () => {
    const promoted = await fillActiveQueue(
      tx,
      lockedSession({
        floorTrialStartsAt: now + 60_000,
        floorTrialEndsAt: now + 120_000,
      }),
      null,
      now
    );
    expect(promoted).toBe(0);
  });

  it("returns 0 when the session is cancelled", async () => {
    const promoted = await fillActiveQueue(
      tx,
      lockedSession({ status: "cancelled" }),
      null,
      now
    );
    expect(promoted).toBe(0);
  });
});

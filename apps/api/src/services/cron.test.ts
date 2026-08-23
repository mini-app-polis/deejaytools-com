import { beforeEach, describe, expect, it, vi } from "vitest";
import { fillRunningSessions, tickSessionStatuses } from "./cron.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});

const now = Date.now();
const past = now - 10_000;
const future = now + 10_000;

type TickDb = Parameters<typeof tickSessionStatuses>[0];

function makeDb(sessions: object[], updateWhere = vi.fn().mockResolvedValue(undefined)): TickDb {
  const chain: {
    select: ReturnType<typeof vi.fn>;
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  } = {} as typeof chain;
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(sessions));
  chain.update = vi.fn(() => ({
    set: vi.fn(() => ({
      where: updateWhere,
    })),
  }));
  return chain as unknown as TickDb;
}

describe("tickSessionStatuses", () => {
  it("returns 0 when no active sessions", async () => {
    const db = makeDb([]);
    const result = await tickSessionStatuses(db);
    expect(result).toBe(0);
  });

  it("transitions scheduled → checkin_open when checkin time has passed", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const db = makeDb(
      [
        {
          id: "s1",
          status: "scheduled",
          checkinOpensAt: past,
          floorTrialStartsAt: future,
          floorTrialEndsAt: future + 3600000,
        },
      ],
      updateWhere
    );
    const result = await tickSessionStatuses(db);
    expect(result).toBe(1);
    expect(updateWhere).toHaveBeenCalled();
  });

  it("transitions checkin_open → in_progress when floor trial starts", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const db = makeDb(
      [
        {
          id: "s1",
          status: "checkin_open",
          checkinOpensAt: past,
          floorTrialStartsAt: past,
          floorTrialEndsAt: future,
        },
      ],
      updateWhere
    );
    const result = await tickSessionStatuses(db);
    expect(result).toBe(1);
  });

  it("transitions in_progress → completed when floor trial ends", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const db = makeDb(
      [
        {
          id: "s1",
          status: "in_progress",
          checkinOpensAt: past,
          floorTrialStartsAt: past,
          floorTrialEndsAt: past,
        },
      ],
      updateWhere
    );
    const result = await tickSessionStatuses(db);
    expect(result).toBe(1);
  });

  it("does not transition when time has not passed", async () => {
    const db = makeDb([
      {
        id: "s1",
        status: "scheduled",
        checkinOpensAt: future,
        floorTrialStartsAt: future,
        floorTrialEndsAt: future + 3600000,
      },
    ]);
    const result = await tickSessionStatuses(db);
    expect(result).toBe(0);
  });

  it("handles multiple sessions in one tick", async () => {
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const db = makeDb(
      [
        {
          id: "s1",
          status: "scheduled",
          checkinOpensAt: past,
          floorTrialStartsAt: future,
          floorTrialEndsAt: future + 3600000,
        },
        {
          id: "s2",
          status: "checkin_open",
          checkinOpensAt: past,
          floorTrialStartsAt: past,
          floorTrialEndsAt: future,
        },
        {
          id: "s3",
          status: "scheduled",
          checkinOpensAt: future,
          floorTrialStartsAt: future,
          floorTrialEndsAt: future + 3600000,
        },
      ],
      updateWhere
    );
    const result = await tickSessionStatuses(db);
    expect(result).toBe(2);
  });
});

describe("fillRunningSessions", () => {
  beforeEach(() => {
    resetSelectQueue();
    vi.clearAllMocks();
  });

  it("promotes for a session inside its window and skips sessions outside it / cancelled", async () => {
    // Sessions returned by the outer select
    enqueueSelectResult([{ id: "running" }, { id: "ended" }, { id: "cancelled" }]);

    // running — inside window, promote one priority entry
    enqueueSelectResult([
      {
        id: "running",
        status: "in_progress",
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
        floorTrialStartsAt: past,
        floorTrialEndsAt: future,
      },
    ]);
    enqueueSelectResult([{ n: 0 }]);
    enqueueSelectResult([{ n: 1 }]);
    enqueueSelectResult([
      {
        id: "qe1",
        checkinId: "c1",
        entityPairId: null,
        entitySoloUserId: "u1",
        entityManagedPartnershipId: null,
        position: 1,
      },
    ]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ max: 0 }]);
    enqueueSelectResult([{ n: 1 }]);
    enqueueSelectResult([{ n: 0 }]);
    enqueueSelectResult([]);

    // ended — outside window
    enqueueSelectResult([
      {
        id: "ended",
        status: "in_progress",
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
        floorTrialStartsAt: past - 100_000,
        floorTrialEndsAt: past,
      },
    ]);

    // cancelled
    enqueueSelectResult([
      {
        id: "cancelled",
        status: "cancelled",
        activePriorityMax: 6,
        activeNonPriorityMax: 4,
        floorTrialStartsAt: past,
        floorTrialEndsAt: future,
      },
    ]);

    const total = await fillRunningSessions(mockDb as unknown as Parameters<typeof fillRunningSessions>[0]);
    expect(total).toBe(1);
  });
});

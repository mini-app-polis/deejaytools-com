import { describe, expect, it, vi } from "vitest";
import { tickSessionStatuses } from "./cron.js";

const now = Date.now();
const past = now - 10_000;
const future = now + 10_000;

function makeDb(sessions: object[], updateWhere = vi.fn().mockResolvedValue(undefined)) {
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
  return chain;
}

describe("tickSessionStatuses", () => {
  it("returns 0 when no active sessions", async () => {
    const db = makeDb([]);
    const result = await tickSessionStatuses(db as Parameters<typeof tickSessionStatuses>[0]);
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
    const result = await tickSessionStatuses(db as Parameters<typeof tickSessionStatuses>[0]);
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
    const result = await tickSessionStatuses(db as Parameters<typeof tickSessionStatuses>[0]);
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
    const result = await tickSessionStatuses(db as Parameters<typeof tickSessionStatuses>[0]);
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
    const result = await tickSessionStatuses(db as Parameters<typeof tickSessionStatuses>[0]);
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
    const result = await tickSessionStatuses(db as Parameters<typeof tickSessionStatuses>[0]);
    expect(result).toBe(2);
  });
});

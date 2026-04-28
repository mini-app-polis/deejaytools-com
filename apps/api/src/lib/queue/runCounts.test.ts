import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", async () => {
  const { mockDb: db } = await import("../../test/mocks.js");
  return { db };
});

import { runsForEntityInEvent, runsForEntityInSession } from "./runCounts.js";
import { enqueueSelectResult, resetSelectQueue } from "../../test/mocks.js";

describe("runsForEntityInSession", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns the count for a pair entity", async () => {
    enqueueSelectResult([{ n: 3 }]);
    const n = await runsForEntityInSession({ pairId: "p1" }, "s1", "Classic");
    expect(n).toBe(3);
  });

  it("returns the count for a solo entity", async () => {
    enqueueSelectResult([{ n: 1 }]);
    const n = await runsForEntityInSession({ soloUserId: "u1" }, "s1", "Teams");
    expect(n).toBe(1);
  });

  it("returns 0 when no row is returned", async () => {
    enqueueSelectResult([]);
    const n = await runsForEntityInSession({ pairId: "p1" }, "s1", "Classic");
    expect(n).toBe(0);
  });

  it("returns 0 when the count column is missing/null", async () => {
    enqueueSelectResult([{ n: null as unknown as number }]);
    const n = await runsForEntityInSession({ pairId: "p1" }, "s1", "Classic");
    expect(n).toBe(0);
  });
});

describe("runsForEntityInEvent", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns the count for a pair entity in an event", async () => {
    enqueueSelectResult([{ n: 4 }]);
    const n = await runsForEntityInEvent({ pairId: "p1" }, "event-1", "Classic");
    expect(n).toBe(4);
  });

  it("returns the count for a solo entity in an event", async () => {
    enqueueSelectResult([{ n: 2 }]);
    const n = await runsForEntityInEvent({ soloUserId: "u1" }, "event-1", "Teams");
    expect(n).toBe(2);
  });

  it("returns 0 when no row is returned", async () => {
    enqueueSelectResult([]);
    const n = await runsForEntityInEvent({ pairId: "p1" }, "event-1", "Classic");
    expect(n).toBe(0);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", async () => {
  const { mockDb: db } = await import("../../test/mocks.js");
  return { db };
});

import { entityHasLiveEntry } from "./singleEntry.js";
import { enqueueSelectResult, resetSelectQueue } from "../../test/mocks.js";

describe("entityHasLiveEntry", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns true when a row matches the pair entity", async () => {
    enqueueSelectResult([{ id: "qe1" }]);
    const has = await entityHasLiveEntry({ pairId: "p1" }, "s1");
    expect(has).toBe(true);
  });

  it("returns true when a row matches the solo entity", async () => {
    enqueueSelectResult([{ id: "qe2" }]);
    const has = await entityHasLiveEntry({ soloUserId: "u1" }, "s1");
    expect(has).toBe(true);
  });

  it("returns false when no row matches", async () => {
    enqueueSelectResult([]);
    const has = await entityHasLiveEntry({ pairId: "p1" }, "s1");
    expect(has).toBe(false);
  });

  it("returns false for a solo entity with no live entry", async () => {
    enqueueSelectResult([]);
    const has = await entityHasLiveEntry({ soloUserId: "u1" }, "s1");
    expect(has).toBe(false);
  });
});

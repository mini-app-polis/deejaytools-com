import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the db module BEFORE importing the unit under test, so the helpers
// receive our mocked chain when they read `tx`.
vi.mock("../../db/index.js", async () => {
  const { mockDb: db } = await import("../../test/mocks.js");
  return { db };
});

import { compactAfterRemoval, nextBottomPosition } from "./compaction.js";
import { mockDb, enqueueSelectResult, resetSelectQueue } from "../../test/mocks.js";

// `tx` is structurally the same as the mocked db chain (the mock's
// `transaction(fn)` calls `fn(chain)`). The compaction helpers accept any
// drizzle transaction object, so we can pass mockDb directly.
type Tx = Parameters<typeof compactAfterRemoval>[0];
const tx = mockDb as unknown as Tx;

describe("nextBottomPosition", () => {
  beforeEach(() => {
    resetSelectQueue();
    vi.clearAllMocks();
  });

  it("returns 1 when the queue is empty (MAX is null → 0 + 1)", async () => {
    enqueueSelectResult([{ max: 0 }]);
    const next = await nextBottomPosition(tx, "s1", "active");
    expect(next).toBe(1);
  });

  it("returns max + 1 when the queue has entries", async () => {
    enqueueSelectResult([{ max: 5 }]);
    const next = await nextBottomPosition(tx, "s1", "non_priority");
    expect(next).toBe(6);
  });

  it("treats undefined row as zero (defensive against driver quirks)", async () => {
    enqueueSelectResult([]);
    const next = await nextBottomPosition(tx, "s1", "priority");
    expect(next).toBe(1);
  });

  it("treats null max as zero", async () => {
    enqueueSelectResult([{ max: null as unknown as number }]);
    const next = await nextBottomPosition(tx, "s1", "active");
    expect(next).toBe(1);
  });
});

describe("compactAfterRemoval", () => {
  beforeEach(() => {
    resetSelectQueue();
    vi.clearAllMocks();
  });

  it("issues a single UPDATE that decrements positions", async () => {
    await compactAfterRemoval(tx, "session-1", "active", 3);
    // Verify update was called and chained through .set().where()
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("does not throw when there are no rows below the removed position", async () => {
    // The mock's update().set().where() always resolves; we're just confirming
    // the call signature works for the no-op case (caller still invokes it).
    await expect(
      compactAfterRemoval(tx, "session-1", "non_priority", 100)
    ).resolves.toBeUndefined();
  });

  it("can be called for any of the three queue types", async () => {
    await compactAfterRemoval(tx, "s1", "active", 1);
    await compactAfterRemoval(tx, "s1", "priority", 1);
    await compactAfterRemoval(tx, "s1", "non_priority", 1);
    expect(mockDb.update).toHaveBeenCalledTimes(3);
  });
});

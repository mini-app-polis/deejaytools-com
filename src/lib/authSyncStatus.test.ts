import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_SYNC_WAIT_MS,
  markAuthSyncPending,
  markAuthSyncSettled,
  resetAuthSyncStatus,
  waitForAuthSync,
} from "./authSyncStatus";

beforeEach(() => resetAuthSyncStatus());
afterEach(() => vi.useRealTimers());

describe("waitForAuthSync", () => {
  it("resolves at once when the sync has settled", async () => {
    markAuthSyncSettled();
    await expect(waitForAuthSync()).resolves.toBeUndefined();
  });

  it("waits for a pending sync to settle", async () => {
    markAuthSyncPending();
    let done = false;
    const waiting = waitForAuthSync().then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    markAuthSyncSettled();
    await waiting;
    expect(done).toBe(true);
  });

  it("gives up after the timeout when the sync never reports back", async () => {
    vi.useFakeTimers();
    let done = false;
    const waiting = waitForAuthSync().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(AUTH_SYNC_WAIT_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await waiting;
    expect(done).toBe(true);
  });

  it("waits again after a reset, as for the next account", async () => {
    markAuthSyncSettled();
    resetAuthSyncStatus();
    vi.useFakeTimers();
    let done = false;
    void waitForAuthSync().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    markAuthSyncSettled();
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(true);
  });
});

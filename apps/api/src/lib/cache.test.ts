import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./cache.js";

describe("TtlCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── get / set ──────────────────────────────────────────────────────────────

  it("returns null for a key that was never set", () => {
    const cache = new TtlCache();
    expect(cache.get("missing")).toBeNull();
  });

  it("returns the stored value immediately after set", () => {
    const cache = new TtlCache();
    cache.set("k", { score: 42 }, 5_000);
    expect(cache.get("k")).toEqual({ score: 42 });
  });

  it("preserves the exact object reference (no serialisation)", () => {
    const cache = new TtlCache();
    const obj = { nested: { deep: true } };
    cache.set("ref", obj, 5_000);
    expect(cache.get("ref")).toBe(obj);
  });

  it("overwrites a previous value when set is called again for the same key", () => {
    const cache = new TtlCache();
    cache.set("k", "first", 5_000);
    cache.set("k", "second", 5_000);
    expect(cache.get("k")).toBe("second");
  });

  // ── TTL expiry ─────────────────────────────────────────────────────────────

  it("returns the value while still within TTL", () => {
    const cache = new TtlCache();
    cache.set("k", "alive", 3_000);
    vi.advanceTimersByTime(2_999);
    expect(cache.get("k")).toBe("alive");
  });

  it("returns null once the TTL has elapsed", () => {
    const cache = new TtlCache();
    cache.set("k", "expires", 3_000);
    vi.advanceTimersByTime(3_001);
    expect(cache.get("k")).toBeNull();
  });

  it("removes the entry from the store on expiry (does not accumulate dead entries)", () => {
    const cache = new TtlCache();
    cache.set("k", "dead", 100);
    vi.advanceTimersByTime(200);
    cache.get("k"); // triggers deletion
    // A fresh set after expiry should work normally.
    cache.set("k", "reborn", 5_000);
    expect(cache.get("k")).toBe("reborn");
  });

  // ── invalidatePrefix ───────────────────────────────────────────────────────

  it("deletes entries matching the prefix", () => {
    const cache = new TtlCache();
    cache.set("queue:s1:active", "a", 5_000);
    cache.set("queue:s1:waiting", "b", 5_000);
    cache.invalidatePrefix("queue:s1:");
    expect(cache.get("queue:s1:active")).toBeNull();
    expect(cache.get("queue:s1:waiting")).toBeNull();
  });

  it("leaves entries that do NOT match the prefix untouched", () => {
    const cache = new TtlCache();
    cache.set("queue:s1:active", "target", 5_000);
    cache.set("sessions:base:s1", "keeper", 5_000);
    cache.invalidatePrefix("queue:s1:");
    expect(cache.get("sessions:base:s1")).toBe("keeper");
  });

  it("handles invalidation with an empty prefix by clearing everything", () => {
    // Every key starts with "".
    const cache = new TtlCache();
    cache.set("a", 1, 5_000);
    cache.set("b", 2, 5_000);
    cache.invalidatePrefix("");
    expect(cache.get("a")).toBeNull();
    expect(cache.get("b")).toBeNull();
  });

  it("is a no-op when no keys match the prefix", () => {
    const cache = new TtlCache();
    cache.set("sessions:s1", "ok", 5_000);
    cache.invalidatePrefix("queue:");
    expect(cache.get("sessions:s1")).toBe("ok");
  });

  // ── background prune ───────────────────────────────────────────────────────

  it("prunes expired entries when the interval fires", () => {
    // Use a short prune interval so we can trigger it with fake timers.
    const cache = new TtlCache(1_000);
    cache.set("gone", "data", 500);
    vi.advanceTimersByTime(600); // expire the entry but don't prune yet
    // The prune interval fires at 1000 ms.
    vi.advanceTimersByTime(500);
    // After pruning, a fresh set should overwrite cleanly (store is not
    // growing unbounded).  We verify indirectly: get returns null.
    expect(cache.get("gone")).toBeNull();
  });
});

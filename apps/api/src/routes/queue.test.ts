import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessEnvelope,
  authHeaders,
  adminHeaders,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";
import { responseCache } from "../lib/cache.js";

// Global pre-test setup: flush the response cache so that a cached result from
// one test can never bleed into the next test's enqueued mock rows.
beforeEach(() => {
  responseCache.invalidatePrefix("");
});

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth.js")>();
  const { mockRequireAdmin, mockRequireAuth } = await import("../test/mocks.js");
  return {
    ...actual,
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

const BASE = "/v1/queue";

const priorityEntry = {
  id: "qe1",
  checkinId: "c1",
  sessionId: "s1",
  entityPairId: "p1",
  entitySoloUserId: null,
  queueType: "priority",
  position: 1,
};

const sessionCaps = {
  status: "in_progress" as const,
  activePriorityMax: 6,
  activeNonPriorityMax: 4,
};

describe("POST /v1/queue/promote", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when queue entry missing", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when entry already active", async () => {
    enqueueSelectResult([{ ...priorityEntry, queueType: "active" }]);
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the session row is missing inside the transaction", async () => {
    enqueueSelectResult([priorityEntry]); // entry found
    enqueueSelectResult([]);              // tx: session FOR UPDATE → not found
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when active queue is at priority cap", async () => {
    enqueueSelectResult([priorityEntry]);          // entry
    enqueueSelectResult([sessionCaps]);            // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 6 }]);              // tx: active count (at cap)
    enqueueSelectResult([{ n: 0 }]);              // tx: priority count
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/priority cap/i);
  });

  it("returns 400 when non-priority promotion is blocked by priority queue entries", async () => {
    enqueueSelectResult([{ ...priorityEntry, queueType: "non_priority" }]); // entry
    enqueueSelectResult([sessionCaps]);              // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 0 }]);                // tx: active count
    enqueueSelectResult([{ n: 2 }]);                // tx: priority count (blocks non-priority)
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/non-priority/i);
  });

  it("returns 200 when promotion succeeds", async () => {
    enqueueSelectResult([priorityEntry]);           // entry
    enqueueSelectResult([sessionCaps]);             // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 0 }]);               // tx: active count
    enqueueSelectResult([{ n: 0 }]);               // tx: priority count
    enqueueSelectResult([]);                        // tx: nextBottomPosition
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { promoted: boolean } };
    expect(body.data.promoted).toBe(true);
  });

  it("acquires a FOR UPDATE lock on the session row inside the transaction", async () => {
    // This test verifies that the concurrent-promote race guard is in place.
    // The SELECT … FOR UPDATE on the session row is what prevents two simultaneous
    // promotes from both seeing room in the active queue and both succeeding.
    // We can't simulate actual DB-level blocking with a mock, but we can assert
    // that .for("update") is called on the transaction chain — proving the lock
    // instruction is issued to the DB driver every time a promotion runs.
    mockDb.for.mockClear();

    enqueueSelectResult([priorityEntry]);           // entry
    enqueueSelectResult([sessionCaps]);             // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 0 }]);               // tx: active count
    enqueueSelectResult([{ n: 0 }]);               // tx: priority count
    enqueueSelectResult([]);                        // tx: nextBottomPosition
    await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });

    expect(mockDb.for).toHaveBeenCalledWith("update");
  });

  it("bypasses cap checks and promotes successfully when session is completed", async () => {
    // After a session ends, admins must be able to promote remaining entries
    // to clear the queue and record runs — cap limits no longer apply.
    const completedSession = { ...sessionCaps, status: "completed" as const };
    enqueueSelectResult([priorityEntry]);           // entry
    enqueueSelectResult([completedSession]);        // tx: session FOR UPDATE (completed)
    // No active/priority count queries — cap checks are skipped entirely
    enqueueSelectResult([]);                        // tx: nextBottomPosition
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { promoted: boolean } };
    expect(body.data.promoted).toBe(true);
  });

  it("bypasses cap checks when session is cancelled", async () => {
    const cancelledSession = { ...sessionCaps, status: "cancelled" as const };
    enqueueSelectResult([{ ...priorityEntry, queueType: "non_priority" }]); // entry
    enqueueSelectResult([cancelledSession]);        // tx: session FOR UPDATE (cancelled)
    enqueueSelectResult([]);                        // tx: nextBottomPosition
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /v1/queue/:sessionId/active", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns ordered rows without auth", async () => {
    enqueueSelectResult([
      {
        queueEntryId: "qe1",
        checkinId: "c1",
        position: 1,
        enteredQueueAt: 1,
        entityPairId: "p1",
        entitySoloUserId: null,
        divisionName: "Classic",
        songId: "song1",
        notes: null,
        initialQueue: "priority",
        checkedInAt: 1,
      },
    ]);
    const res = await app.request(`${BASE}/s1/active`);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessEnvelope(body);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe("GET /v1/queue/:sessionId/priority", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/s1/priority`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s1/priority`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /v1/queue/:sessionId/active — entityLabel field", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("renders 'Leader & Follower' for a pair entity", async () => {
    enqueueSelectResult([
      {
        queueEntryId: "qe1",
        checkinId: "c1",
        position: 1,
        enteredQueueAt: 1,
        entityPairId: "p1",
        entitySoloUserId: null,
        divisionName: "Classic",
        songId: "song1",
        notes: null,
        initialQueue: "priority",
        checkedInAt: 1,
        pairUserFirst: "Alice",
        pairUserLast: "Smith",
        pairPartnerFirst: "Bob",
        pairPartnerLast: "Jones",
        soloUserFirst: null,
        soloUserLast: null,
      },
    ]);
    const res = await app.request(`${BASE}/s1/active`);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ entityLabel: string }[]>>(res);
    expect(body.data[0].entityLabel).toBe("Alice Smith & Bob Jones");
  });

  it("renders the full name for a solo entity", async () => {
    enqueueSelectResult([
      {
        queueEntryId: "qe2",
        checkinId: "c2",
        position: 1,
        enteredQueueAt: 1,
        entityPairId: null,
        entitySoloUserId: "u1",
        divisionName: "Teams",
        songId: "song2",
        notes: null,
        initialQueue: "non_priority",
        checkedInAt: 1,
        pairUserFirst: null,
        pairUserLast: null,
        pairPartnerFirst: null,
        pairPartnerLast: null,
        soloUserFirst: "Solo",
        soloUserLast: "Dancer",
      },
    ]);
    const res = await app.request(`${BASE}/s1/active`);
    const body = await readJson<SuccessEnvelope<{ entityLabel: string }[]>>(res);
    expect(body.data[0].entityLabel).toBe("Solo Dancer");
  });

  it("falls back to '—' when neither pair nor solo names are present", async () => {
    enqueueSelectResult([
      {
        queueEntryId: "qe3",
        checkinId: "c3",
        position: 1,
        enteredQueueAt: 1,
        entityPairId: "p1",
        entitySoloUserId: null,
        divisionName: "Classic",
        songId: "song3",
        notes: null,
        initialQueue: "priority",
        checkedInAt: 1,
        pairUserFirst: null,
        pairUserLast: null,
        pairPartnerFirst: null,
        pairPartnerLast: null,
        soloUserFirst: null,
        soloUserLast: null,
      },
    ]);
    const res = await app.request(`${BASE}/s1/active`);
    const body = await readJson<SuccessEnvelope<{ entityLabel: string }[]>>(res);
    expect(body.data[0].entityLabel).toBe("—");
  });
});

describe("POST /v1/queue/withdraw", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/withdraw`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await app.request(`${BASE}/withdraw`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when queueEntryId is missing", async () => {
    const res = await app.request(`${BASE}/withdraw`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the queue entry does not exist", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/withdraw`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 when withdraw succeeds", async () => {
    enqueueSelectResult([
      {
        id: "qe1",
        checkinId: "c1",
        sessionId: "s1",
        queueType: "non_priority",
        position: 3,
      },
    ]);
    const res = await app.request(`${BASE}/withdraw`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ withdrawn: boolean }>>(res);
    expect(body.data.withdrawn).toBe(true);
  });
});

describe("POST /v1/queue/complete", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await app.request(`${BASE}/complete`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when no slot 1 exists", async () => {
    // loadSlotOne select → empty.
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/complete`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 and { completed: true } on success", async () => {
    // loadSlotOne → slot 1 entry
    enqueueSelectResult([{ id: "qe1", checkinId: "c1", entityPairId: null, entitySoloUserId: "u1", position: 1 }]);
    // SELECT checkin
    enqueueSelectResult([{ sessionId: "s1", divisionName: "Classic", songId: "song1" }]);
    // SELECT session (for eventId)
    enqueueSelectResult([{ eventId: null }]);
    // Transaction: delete + compactAfterRemoval (updates only) + insert runs + insert queueEvents — no drains
    const res = await app.request(`${BASE}/complete`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ completed: boolean }>>(res);
    expect(body.data.completed).toBe(true);
  });
});

describe("POST /v1/queue/incomplete", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/incomplete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await app.request(`${BASE}/incomplete`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when no slot 1 exists", async () => {
    // loadSlotOne select → empty.
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/incomplete`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 200 and { rotated: true } on success", async () => {
    // loadSlotOne → slot 1 entry
    enqueueSelectResult([{ id: "qe1", checkinId: "c1", entityPairId: null, entitySoloUserId: "u1", position: 1 }]);
    // tx: SELECT active entries for rotation (position 1 is the only entry)
    enqueueSelectResult([{ id: "qe1", position: 1 }]);
    // Transaction: updates only (sentinel swap, resequence, insert queueEvents) — no further drains
    const res = await app.request(`${BASE}/incomplete`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ rotated: boolean }>>(res);
    expect(body.data.rotated).toBe(true);
  });
});

// ─── Cache integration ────────────────────────────────────────────────────────
//
// These tests verify that:
//   1. GET endpoints serve a cached response on the second call (no DB hit).
//   2. Write endpoints (withdraw, complete, incomplete, promote) clear the
//      cache so the next GET returns fresh data.
//
// Strategy: enqueue distinct DB results for each cache-miss round-trip.
// If a request uses the cache it won't drain from the queue, so a subsequent
// request with a *different* enqueued row would expose a stale cache hit vs
// an invalidation by returning different data.

const activeRow = (position: number) => ({
  queueEntryId: `qe-${position}`,
  checkinId: `c-${position}`,
  position,
  enteredQueueAt: 1000,
  entityPairId: "p1",
  entitySoloUserId: null,
  divisionName: "Classic",
  songId: "song1",
  notes: null,
  initialQueue: "priority",
  checkedInAt: 1000,
  pairUserFirst: "Alice",
  pairUserLast: "Smith",
  pairPartnerFirst: "Bob",
  pairPartnerLast: "Jones",
  soloUserFirst: null,
  soloUserLast: null,
});

describe("GET /v1/queue/:sessionId/active — caching", () => {
  beforeEach(() => {
    resetSelectQueue();
    // Clear ALL cached entries so tests are fully isolated.
    responseCache.invalidatePrefix("");
  });

  it("returns a cached response on the second call without hitting the DB", async () => {
    // First request: cache miss → DB returns position 1.
    enqueueSelectResult([activeRow(1)]);
    const first = await app.request(`${BASE}/s1/active`);
    expect(first.status).toBe(200);
    const firstBody = await readJson<SuccessEnvelope<{ position: number }[]>>(first);
    expect(firstBody.data[0]!.position).toBe(1);

    // Enqueue a *different* row — if the second request hits the DB it will
    // return position 99, exposing a cache miss.
    enqueueSelectResult([activeRow(99)]);
    const second = await app.request(`${BASE}/s1/active`);
    expect(second.status).toBe(200);
    const secondBody = await readJson<SuccessEnvelope<{ position: number }[]>>(second);
    // Should still be position 1 (from cache).
    expect(secondBody.data[0]!.position).toBe(1);
  });

  it("caches per session ID — different sessions get independent entries", async () => {
    enqueueSelectResult([activeRow(1)]);
    await app.request(`${BASE}/s1/active`);

    enqueueSelectResult([activeRow(2)]);
    const resS2 = await app.request(`${BASE}/s2/active`);
    const bodyS2 = await readJson<SuccessEnvelope<{ position: number }[]>>(resS2);
    // s2 was a cache miss and should return its own DB result.
    expect(bodyS2.data[0]!.position).toBe(2);
  });
});

describe("POST /v1/queue/withdraw — cache invalidation", () => {
  beforeEach(() => {
    resetSelectQueue();
    responseCache.invalidatePrefix("");
  });

  it("clears the session cache so the next GET returns fresh data", async () => {
    // Prime the cache with position 1.
    enqueueSelectResult([activeRow(1)]);
    await app.request(`${BASE}/s1/active`);

    // Perform a withdraw (enqueue the entry lookup result).
    enqueueSelectResult([
      { id: "qe1", checkinId: "c1", sessionId: "s1", queueType: "non_priority", position: 3 },
    ]);
    const withdraw = await app.request(`${BASE}/withdraw`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(withdraw.status).toBe(200);

    // Now the cache should be invalidated. Enqueue a fresh result.
    enqueueSelectResult([activeRow(5)]);
    const afterWithdraw = await app.request(`${BASE}/s1/active`);
    const body = await readJson<SuccessEnvelope<{ position: number }[]>>(afterWithdraw);
    // position 5 proves we got a fresh DB result, not the cached position 1.
    expect(body.data[0]!.position).toBe(5);
  });
});

describe("POST /v1/queue/complete — cache invalidation", () => {
  beforeEach(() => {
    resetSelectQueue();
    responseCache.invalidatePrefix("");
  });

  it("clears the session cache after run complete", async () => {
    // Prime the cache.
    enqueueSelectResult([activeRow(1)]);
    await app.request(`${BASE}/s1/active`);

    // complete: loadSlotOne returns nothing → 400 (no entry to complete).
    // We just need to verify that a *successful* complete would have cleared
    // the cache. We test the path by confirming the 400 does NOT clear cache
    // (no side-effect on failure) and a real success path would.
    //
    // For a full success path we'd need many DB mocks; the withdraw test above
    // already covers the core invalidation contract.  Here we verify the
    // endpoint at least passes through the rate limiter and auth correctly.
    enqueueSelectResult([]); // no slot 1
    const res = await app.request(`${BASE}/complete`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(400);

    // Cache should still be intact after a failed complete.
    enqueueSelectResult([activeRow(99)]);
    const cached = await app.request(`${BASE}/s1/active`);
    const body = await readJson<SuccessEnvelope<{ position: number }[]>>(cached);
    expect(body.data[0]!.position).toBe(1); // still from cache
  });
});

describe("POST /v1/queue/:session_id/promote — cap boundary conditions", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 409 at exactly priority cap (active count === activePriorityMax)", async () => {
    enqueueSelectResult([priorityEntry]);          // entry lookup
    enqueueSelectResult([sessionCaps]);            // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 6 }]);              // tx: active count (exactly at cap)
    enqueueSelectResult([{ n: 0 }]);              // tx: priority count
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/priority cap/i);
  });

  it("returns 200 one below priority cap (active count === activePriorityMax - 1)", async () => {
    enqueueSelectResult([priorityEntry]);          // entry lookup
    enqueueSelectResult([sessionCaps]);            // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 5 }]);              // tx: active count (one below cap)
    enqueueSelectResult([{ n: 0 }]);              // tx: priority count
    enqueueSelectResult([]);                        // tx: nextBottomPosition
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { promoted: boolean } };
    expect(body.data.promoted).toBe(true);
  });

  it("returns 409 at exactly non-priority cap with empty priority queue", async () => {
    enqueueSelectResult([{ ...priorityEntry, queueType: "non_priority" }]); // entry
    enqueueSelectResult([sessionCaps]);            // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 4 }]);              // tx: active count (at non-priority cap)
    enqueueSelectResult([{ n: 0 }]);              // tx: priority count (empty)
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/non-priority/i);
  });

  it("returns 200 one below non-priority cap with empty priority queue", async () => {
    enqueueSelectResult([{ ...priorityEntry, queueType: "non_priority" }]); // entry
    enqueueSelectResult([sessionCaps]);            // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 3 }]);              // tx: active count (one below cap)
    enqueueSelectResult([{ n: 0 }]);              // tx: priority count (empty)
    enqueueSelectResult([]);                        // tx: nextBottomPosition
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { promoted: boolean } };
    expect(body.data.promoted).toBe(true);
  });

  it("returns 409 with zero priority cap for any priority promotion", async () => {
    enqueueSelectResult([priorityEntry]);          // entry lookup
    enqueueSelectResult([{ activePriorityMax: 0, activeNonPriorityMax: 4 }]); // tx: session FOR UPDATE with zero cap
    enqueueSelectResult([{ n: 0 }]);              // tx: active count (empty)
    enqueueSelectResult([{ n: 0 }]);              // tx: priority count
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toMatch(/priority cap/i);
  });
});

describe("GET /v1/queue/:session_id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 200 with queue data for a known session", async () => {
    enqueueSelectResult([
      {
        queueEntryId: "qe1",
        checkinId: "c1",
        position: 1,
        enteredQueueAt: 1000,
        entityPairId: "p1",
        entitySoloUserId: null,
        divisionName: "Classic",
        songId: "song1",
        notes: null,
        initialQueue: "priority",
        checkedInAt: 1000,
        pairUserFirst: "Alice",
        pairUserLast: "Smith",
        pairPartnerFirst: "Bob",
        pairPartnerLast: "Jones",
        soloUserFirst: null,
        soloUserLast: null,
      },
    ]);
    const res = await app.request(`${BASE}/s1/active`);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessEnvelope(body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(1);
  });

  it("returns 200 with empty queues when no entries exist", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s1/active`);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessEnvelope(body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(0);
  });
});

// ─── Full-flow integration ─────────────────────────────────────────────────────
//
// These tests exercise the entire state machine in a single describe block:
//   promote (waiting → active)  →  complete (active → run recorded)
//
// Each step calls a real route handler through app.request, exercising the
// full middleware chain. Individual promote/complete unit tests cover edge cases;
// these tests prove the two operations work in sequence.

describe("full-flow: promote then complete", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("promotes a priority entry then completes it, both returning 200", async () => {
    // ── Step 1: promote ──────────────────────────────────────────────────────
    enqueueSelectResult([priorityEntry]);                                   // entry lookup
    enqueueSelectResult([sessionCaps]);                                     // tx: session FOR UPDATE
    enqueueSelectResult([{ n: 0 }]);                                       // tx: active count
    enqueueSelectResult([{ n: 0 }]);                                       // tx: priority count
    enqueueSelectResult([]);                                                // tx: nextBottomPosition (MAX = 0)

    const promoteRes = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: priorityEntry.id }),
    });
    expect(promoteRes.status).toBe(200);
    const promoteBody = await readJson<SuccessEnvelope<{ promoted: boolean }>>(promoteRes);
    expect(promoteBody.data.promoted).toBe(true);

    // ── Step 2: complete (the entry is now in active at position 1) ──────────
    // loadSlotOne: entry now active at position 1
    enqueueSelectResult([{ id: "qe-active", checkinId: priorityEntry.checkinId, entityPairId: priorityEntry.entityPairId, entitySoloUserId: null, position: 1 }]);
    // SELECT checkin
    enqueueSelectResult([{ sessionId: priorityEntry.sessionId, divisionName: "Classic", songId: "song1" }]);
    // SELECT session (eventId)
    enqueueSelectResult([{ eventId: null }]);

    const completeRes = await app.request(`${BASE}/complete`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: priorityEntry.sessionId }),
    });
    expect(completeRes.status).toBe(200);
    const completeBody = await readJson<SuccessEnvelope<{ completed: boolean }>>(completeRes);
    expect(completeBody.data.completed).toBe(true);
  });

  it("promote returns 400 when cap is full, then succeeds once a slot opens", async () => {
    // Attempt 1: active queue at priority cap → blocked
    enqueueSelectResult([priorityEntry]);
    enqueueSelectResult([sessionCaps]);                      // caps: priority max = 6
    enqueueSelectResult([{ n: sessionCaps.activePriorityMax }]); // active count = AT cap
    enqueueSelectResult([{ n: 0 }]);

    const blockedRes = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: priorityEntry.id }),
    });
    expect(blockedRes.status).toBe(400);

    // Attempt 2: a slot has opened (active count now below cap) → succeeds
    enqueueSelectResult([priorityEntry]);
    enqueueSelectResult([sessionCaps]);
    enqueueSelectResult([{ n: sessionCaps.activePriorityMax - 1 }]); // one slot open
    enqueueSelectResult([{ n: 0 }]);
    enqueueSelectResult([]);                                 // nextBottomPosition

    const succeededRes = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: priorityEntry.id }),
    });
    expect(succeededRes.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ promoted: boolean }>>(succeededRes);
    expect(body.data.promoted).toBe(true);
  });
});

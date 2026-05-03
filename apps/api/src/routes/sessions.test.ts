import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  assertValidation400,
  adminHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";
import { responseCache } from "../lib/cache.js";

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
vi.mock("../lib/sessions/overlap.js", () => ({
  sessionOverlapsInEvent: vi.fn().mockResolvedValue(false),
}));

const BASE = "/v1/sessions";
const futureTime = Date.now() + 3_600_000;

const mockSession = {
  id: "s1",
  eventId: null as string | null,
  name: "Test Session",
  date: null as string | null,
  checkinOpensAt: futureTime,
  floorTrialStartsAt: futureTime + 1000,
  floorTrialEndsAt: futureTime + 7200000,
  activePriorityMax: 6,
  activeNonPriorityMax: 4,
  status: "scheduled" as const,
  createdBy: "user_admin123",
  createdAt: Date.now(),
};

describe("GET /v1/sessions", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns success list envelope", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toEqual([]);
  });

  it("filters by event_id when provided", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}?event_id=e1`);
    expect(res.status).toBe(200);
    assertSuccessListEnvelope(await readJson(res));
  });
});

describe("POST /v1/sessions", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when required timestamp fields are missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test Session" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("creates session and returns 201", async () => {
    const created = { ...mockSession, id: "sess_new" };
    enqueueSelectResult([created]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Session",
        checkin_opens_at: futureTime,
        floor_trial_starts_at: futureTime + 1000,
        floor_trial_ends_at: futureTime + 7200000,
        divisions: [],
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "sess_new", name: "Test Session" });
  });
});

describe("PATCH /v1/sessions/:id/status", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/s1/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "checkin_open" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/nonexistent/status`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "checkin_open" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 on invalid status value", async () => {
    const res = await app.request(`${BASE}/s1/status`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid_status" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });
});

describe("DELETE /v1/sessions/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/nonexistent`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("cascades deletion of session with checkins and returns 200", async () => {
    // The route used to 409 here. It now cascades: queue_entries,
    // queue_events, runs, checkins, session_divisions, sessions. The mock
    // db chain treats every delete().where() as a no-op promise, so we
    // just need the existence-check select to return the session row.
    enqueueSelectResult([mockSession]);
    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ deleted: boolean }>>(res);
    expect(body.data.deleted).toBe(true);
  });

  it("deletes a session with no checkins and returns 200", async () => {
    enqueueSelectResult([mockSession]);
    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ deleted: boolean }>>(res);
    expect(body.data.deleted).toBe(true);
  });
});

describe("GET /v1/sessions/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/nonexistent`);
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns session with divisions and queue depth", async () => {
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s1`);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toHaveProperty("divisions");
    expect(body.data).toHaveProperty("queue_depth");
  });
});

describe("PATCH /v1/sessions/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/nonexistent`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates session fields and returns 200", async () => {
    const updated = { ...mockSession, name: "Updated Name" };
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([updated]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s1`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated Name" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
  });
});

describe("PUT /v1/sessions/:id/divisions", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/nonexistent/divisions`, {
      method: "PUT",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ divisions: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("replaces divisions and returns 200", async () => {
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s1/divisions`, {
      method: "PUT",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        divisions: [{ division_name: "Classic", is_priority: true }],
      }),
    });
    expect(res.status).toBe(200);
  });
});

// ─── Cache integration ────────────────────────────────────────────────────────
//
// GET /v1/sessions/:id caches the expensive shared base data (session row,
// event info, divisions, queue depths) and always computes user-specific fields
// (has_active_checkin) fresh.  Write endpoints must clear the cache.

/** Session row with two distinct name values to distinguish cached vs fresh. */
const sessionA = { ...{ id: "s1", eventId: null as string | null, name: "Session A", date: null as string | null, checkinOpensAt: futureTime, floorTrialStartsAt: futureTime + 1000, floorTrialEndsAt: futureTime + 7_200_000, activePriorityMax: 6, activeNonPriorityMax: 4, status: "scheduled" as const, createdBy: "user_admin123", createdAt: Date.now() } };
const sessionB = { ...sessionA, name: "Session B" };

describe("GET /v1/sessions/:id — caching", () => {
  beforeEach(() => {
    resetSelectQueue();
    responseCache.invalidatePrefix("");
  });

  it("serves the base data from cache on the second call", async () => {
    // First request: cache miss. Enqueue session row, event (none → 0), divisions, queue depths.
    enqueueSelectResult([sessionA]); // session row
    enqueueSelectResult([]);          // divisions
    enqueueSelectResult([]);          // queue depths
    const first = await app.request(`${BASE}/s1`);
    expect(first.status).toBe(200);
    const firstBody = await readJson<SuccessEnvelope<{ name: string }>>(first);
    expect(firstBody.data.name).toBe("Session A");

    // Enqueue different data — if the second request hits the DB it would
    // return "Session B", exposing a cache miss.
    enqueueSelectResult([sessionB]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const second = await app.request(`${BASE}/s1`);
    expect(second.status).toBe(200);
    const secondBody = await readJson<SuccessEnvelope<{ name: string }>>(second);
    // Should still be "Session A" (base data from cache).
    expect(secondBody.data.name).toBe("Session A");
  });

  it("returns 404 on a cache miss for a non-existent session", async () => {
    enqueueSelectResult([]); // session not found
    const res = await app.request(`${BASE}/nonexistent`);
    expect(res.status).toBe(404);
  });
});

// ─── Sessions list cache ──────────────────────────────────────────────────────
//
// GET /v1/sessions caches shared base data (session rows, divisions, queue depths,
// event timezones) and always computes user-specific fields (has_active_checkin)
// fresh.  Write endpoints must clear the list cache.

/** Minimal session row with distinct names for cache miss detection. */
const listSessionA = {
  id: "s1",
  eventId: null as string | null,
  name: "List Session A",
  date: null as string | null,
  checkinOpensAt: futureTime,
  floorTrialStartsAt: futureTime + 1000,
  floorTrialEndsAt: futureTime + 7_200_000,
  activePriorityMax: 6,
  activeNonPriorityMax: 4,
  status: "scheduled" as const,
  createdBy: "user_admin123",
  createdAt: Date.now(),
};
const listSessionB = { ...listSessionA, name: "List Session B" };

describe("GET /v1/sessions — caching", () => {
  beforeEach(() => {
    resetSelectQueue();
    responseCache.invalidatePrefix("");
  });

  it("serves the base list from cache on the second call", async () => {
    // First request: cache miss.  Enqueue: sessions, divisions, queue depths.
    enqueueSelectResult([listSessionA]);
    enqueueSelectResult([]); // divisions
    enqueueSelectResult([]); // queue depths
    const first = await app.request(BASE);
    expect(first.status).toBe(200);
    const firstBody = await readJson<{ data: { name: string }[] }>(first);
    expect(firstBody.data[0]!.name).toBe("List Session A");

    // Enqueue different data — if the second request hits the DB it would
    // return "List Session B", exposing a cache miss.
    enqueueSelectResult([listSessionB]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const second = await app.request(BASE);
    expect(second.status).toBe(200);
    const secondBody = await readJson<{ data: { name: string }[] }>(second);
    // Should still be "List Session A" (base data from cache).
    expect(secondBody.data[0]!.name).toBe("List Session A");
  });

  it("uses separate cache entries for different event_id filters", async () => {
    // Populate cache for event_id=e1.
    enqueueSelectResult([listSessionA]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    await app.request(`${BASE}?event_id=e1`);

    // event_id=e2 should be a cache miss and return its own DB result.
    enqueueSelectResult([listSessionB]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const resE2 = await app.request(`${BASE}?event_id=e2`);
    const bodyE2 = await readJson<{ data: { name: string }[] }>(resE2);
    expect(bodyE2.data[0]!.name).toBe("List Session B");
  });
});

describe("PATCH /v1/sessions/:id/status — list cache invalidation", () => {
  beforeEach(() => {
    resetSelectQueue();
    responseCache.invalidatePrefix("");
  });

  it("clears the list cache so the next GET returns fresh data", async () => {
    // Prime the list cache with List Session A.
    enqueueSelectResult([listSessionA]);
    enqueueSelectResult([]); // divisions
    enqueueSelectResult([]); // queue depths
    await app.request(BASE);

    // Perform a status PATCH — should invalidate the list cache.
    enqueueSelectResult([listSessionA]);          // existing check
    enqueueSelectResult([listSessionB]);          // re-read after update
    enqueueSelectResult([]);                      // divisions
    enqueueSelectResult([]);                      // queue depths
    const patch = await app.request(`${BASE}/s1/status`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "checkin_open" }),
    });
    expect(patch.status).toBe(200);

    // Cache was invalidated — next GET /v1/sessions is a fresh DB hit.
    enqueueSelectResult([listSessionB]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const after = await app.request(BASE);
    const body = await readJson<{ data: { name: string }[] }>(after);
    expect(body.data[0]!.name).toBe("List Session B");
  });
});

describe("PATCH /v1/sessions/:id/status — cache invalidation", () => {
  beforeEach(() => {
    resetSelectQueue();
    responseCache.invalidatePrefix("");
  });

  it("clears the session base cache so the next GET returns fresh data", async () => {
    // Prime the cache.
    enqueueSelectResult([sessionA]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    await app.request(`${BASE}/s1`);

    // Perform a status PATCH (existing → updated row → divisions → depths).
    enqueueSelectResult([sessionA]);          // existing check
    enqueueSelectResult([sessionB]);          // re-read after update
    enqueueSelectResult([]);                  // divisions
    enqueueSelectResult([]);                  // queue depths
    const patch = await app.request(`${BASE}/s1/status`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "checkin_open" }),
    });
    expect(patch.status).toBe(200);

    // Cache was invalidated — next GET should be a fresh DB miss.
    enqueueSelectResult([sessionB]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    const after = await app.request(`${BASE}/s1`);
    const body = await readJson<SuccessEnvelope<{ name: string }>>(after);
    expect(body.data.name).toBe("Session B");
  });
});

// ---------------------------------------------------------------------------
// POST /v1/sessions — time-window validation
// ---------------------------------------------------------------------------

describe("POST /v1/sessions — time-window validation", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 400 when floor_trial_starts_at <= checkin_opens_at (same value)", async () => {
    const sameTime = futureTime;
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Session",
        checkin_opens_at: sameTime,
        floor_trial_starts_at: sameTime,
        floor_trial_ends_at: sameTime + 7200000,
        divisions: [],
      }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toBeTruthy();
  });

  it("returns 400 when floor_trial_ends_at <= floor_trial_starts_at", async () => {
    const startTime = futureTime + 1000;
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Session",
        checkin_opens_at: futureTime,
        floor_trial_starts_at: startTime,
        floor_trial_ends_at: startTime,
        divisions: [],
      }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toBeTruthy();
  });

  it("returns 400 when sessionOverlapsInEvent returns true (overlap detected)", async () => {
    const { sessionOverlapsInEvent } = await import("../lib/sessions/overlap.js");
    vi.mocked(sessionOverlapsInEvent).mockResolvedValueOnce(true);

    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Session",
        event_id: "e1",
        checkin_opens_at: futureTime,
        floor_trial_starts_at: futureTime + 1000,
        floor_trial_ends_at: futureTime + 7200000,
        divisions: [],
      }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/overlaps/i);
  });

  it("succeeds (201) when timestamps are valid (no event_id, no overlap check)", async () => {
    // Without an event_id there is no overlap query or event-date validation, so
    // the only DB reads after the transaction are the three post-insert selects.
    const created = { ...mockSession, id: "sess_new" };
    enqueueSelectResult([created]); // re-select created session
    enqueueSelectResult([]);        // loadDivisionsForSession
    enqueueSelectResult([]);        // loadQueueDepthsForSession
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Session",
        checkin_opens_at: futureTime,
        floor_trial_starts_at: futureTime + 1000,
        floor_trial_ends_at: futureTime + 7200000,
        divisions: [],
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "sess_new", name: "Test Session" });
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/sessions/:id — time-window validation
// ---------------------------------------------------------------------------

describe("PATCH /v1/sessions/:id — time-window validation", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 400 when patching floor_trial_ends_at to a value <= existing floor_trial_starts_at", async () => {
    const existingSession = {
      ...mockSession,
      floorTrialStartsAt: futureTime + 2000,
      floorTrialEndsAt: futureTime + 7200000,
    };
    enqueueSelectResult([existingSession]);

    const res = await app.request(`${BASE}/s1`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        floor_trial_ends_at: futureTime + 2000, // same as existing start
      }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toBeTruthy();
  });

  it("returns 400 when patching floor_trial_starts_at to a value >= existing floor_trial_ends_at", async () => {
    const existingSession = {
      ...mockSession,
      floorTrialStartsAt: futureTime + 1000,
      floorTrialEndsAt: futureTime + 7200000,
    };
    enqueueSelectResult([existingSession]);

    const res = await app.request(`${BASE}/s1`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        floor_trial_starts_at: futureTime + 7200000, // same as existing end
      }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toBeTruthy();
  });
});

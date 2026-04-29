/**
 * Contract tests — GET /v1/sessions and GET /v1/sessions/:id
 *
 * Validates that both list and detail payloads satisfy the ApiSession schema.
 * The list endpoint enriches sessions with event_timezone, divisions, and
 * queue_depth; the detail endpoint additionally includes event_name and the
 * optional user-specific fields.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiSessionSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { authHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";
import { responseCache } from "../lib/cache.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
    // optional-user.ts imports bearerToken + jwksUrl; both must be present in the mock.
    // bearerToken returns the raw token string (or null) — JWT verification is attempted
    // by optional-user.ts but will throw on the fake token, so getOptionalSyncedUserId
    // always resolves to undefined in tests (the catch branch).
    bearerToken: (c: import("hono").Context) => {
      const h = c.req.header("Authorization") ?? "";
      return h.startsWith("Bearer ") ? h.slice(7) : null;
    },
    jwksUrl: () => "https://mock.clerk.test/.well-known/jwks.json",
  };
});
vi.mock("../lib/sessions/overlap.js", () => ({
  sessionOverlapsInEvent: vi.fn().mockResolvedValue(false),
}));

const BASE = "/v1/sessions";
const future = Date.now() + 3_600_000;

/** Minimal DB session row (camelCase, as Drizzle returns). eventId is null so
 *  no secondary event-timezone query is issued. */
const dbSession = {
  id: "s-1",
  eventId: null as string | null,
  name: "Friday Night Social",
  date: "2026-06-06",
  checkinOpensAt: future,
  floorTrialStartsAt: future + 1_800_000,
  floorTrialEndsAt: future + 9_000_000,
  activePriorityMax: 6,
  activeNonPriorityMax: 4,
  status: "scheduled",
  createdBy: "user_admin",
  createdAt: 1_000_000,
};

beforeEach(() => {
  resetSelectQueue();
  responseCache.invalidatePrefix("");
});

describe("GET /v1/sessions — contract", () => {
  it("body.data is an array of ApiSession (unauthenticated)", async () => {
    // 1. sessions select
    // 2. loadDivisionsForSessions  (inArray — returns empty for zero session IDs short-circuits, but
    //    for 1 session it hits the DB once)
    // 3. loadQueueDepthsForSessions (same pattern)
    // eventId is null → no event timezone query
    enqueueSelectResult([dbSession]); // sessions
    enqueueSelectResult([]);           // sessionDivisions
    enqueueSelectResult([]);           // queueEntries depth

    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiSessionSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("schema satisfied when divisions and queue_depth are populated", async () => {
    const division = {
      id: "div-1",
      sessionId: "s-1",
      divisionName: "Classic",
      isPriority: true,
      sortOrder: 0,
      priorityRunLimit: 1,
    };
    const depthRow = { sessionId: "s-1", queueType: "priority", c: 3 };

    enqueueSelectResult([dbSession]);
    enqueueSelectResult([division]);
    enqueueSelectResult([depthRow]);

    const res = await app.request(BASE);
    const { data } = await readJson<{ data: unknown[] }>(res);
    const result = z.array(ApiSessionSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
    // Spot-check enriched fields are present and shaped correctly
    const s = (data as Array<Record<string, unknown>>)[0]!;
    expect(s.divisions).toHaveLength(1);
    expect(s.queue_depth).toMatchObject({ priority: 3, non_priority: 0, active: 0 });
  });
});

describe("GET /v1/sessions/:id — contract", () => {
  it("body.data matches ApiSession (unauthenticated)", async () => {
    // 1. sessions.where(id).limit(1)
    // 2. loadDivisionsForSession (sessionDivisions.where(id))
    // 3. loadQueueDepthsForSession (queueEntries.where(id).groupBy)
    // eventId is null → no event join
    enqueueSelectResult([dbSession]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);

    const res = await app.request(`${BASE}/s-1`);
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = ApiSessionSchema.safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("schema satisfied when event_name and active_checkin_division are present", async () => {
    const dbSessionWithEvent = { ...dbSession, eventId: "ev-1" };
    const dbEventRow = { id: "ev-1", name: "Big Social", timezone: "America/Chicago" };

    // 1. sessions.limit(1)
    // 2. sessionDivisions
    // 3. queueEntries depth
    // 4. events.where(ev-1) (event name + timezone join)
    // 5. Active checkin check (auth user)
    enqueueSelectResult([dbSessionWithEvent]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);
    enqueueSelectResult([dbEventRow]);
    // pairs for the auth user (returns empty — has_active_checkin = false)
    enqueueSelectResult([]);

    const res = await app.request(`${BASE}/s-1`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = ApiSessionSchema.safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });
});

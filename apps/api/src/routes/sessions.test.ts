import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  assertValidation400,
  adminHeaders,
  type ErrorEnvelope,
  type HonoZodFailureBody,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

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
  maxSlots: 7,
  maxPriorityRuns: 3,
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
    assertValidation400(await readJson<HonoZodFailureBody>(res));
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
    assertValidation400(await readJson<HonoZodFailureBody>(res));
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

  it("returns 409 when session has checkins", async () => {
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([{ c: 2 }]);
    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("deletes session with no checkins and returns 200", async () => {
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([{ c: 0 }]);
    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ deleted: boolean }>>(res);
    expect(body.data.deleted).toBe(true);
  });
});

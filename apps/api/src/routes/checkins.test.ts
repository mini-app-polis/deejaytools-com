import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  assertValidation400,
  adminHeaders,
  authHeaders,
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
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAdmin, mockRequireAuth } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});
vi.mock("../lib/pair-display.js", () => ({
  loadPairDisplayNames: vi.fn().mockResolvedValue(new Map<string, string>()),
}));

const BASE = "/v1/checkins";
const now = Date.now();

const mockSession = {
  id: "sess1",
  eventId: null as string | null,
  name: "S",
  date: null as string | null,
  checkinOpensAt: now - 1000,
  floorTrialStartsAt: now,
  floorTrialEndsAt: now + 7200000,
  maxSlots: 7,
  maxPriorityRuns: 3,
  status: "checkin_open" as const,
  createdBy: "user_admin123",
  createdAt: now,
};

const mockCheckin = {
  id: "c1",
  sessionId: "sess1",
  eventRegistrationId: null as string | null,
  pairId: "p1",
  submittedByUserId: "user_test123",
  songId: "song1",
  division: "Classic",
  queueType: "standard" as const,
  queuePosition: 1,
  status: "waiting" as const,
  checkedInAt: now,
  lastRunAt: null as number | null,
};

describe("GET /v1/checkins", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 400 when session_id is missing", async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(400);
  });

  it("returns success list for a session", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}?session_id=sess1`);
    expect(res.status).toBe(200);
    assertSuccessListEnvelope(await readJson(res));
  });
});

describe("POST /v1/checkins", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "sess1",
        division: "Classic",
        queue_type: "standard",
        partner_id: null,
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when division is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "sess1",
        queue_type: "standard",
        partner_id: null,
      }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<HonoZodFailureBody>(res));
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "nonexistent",
        division: "Classic",
        queue_type: "standard",
        partner_id: null,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when checkin is not open", async () => {
    enqueueSelectResult([
      {
        ...mockSession,
        status: "scheduled" as const,
      },
    ]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "sess1",
        division: "Classic",
        queue_type: "standard",
        partner_id: null,
      }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("CHECKIN_NOT_OPEN");
  });

  it("returns 409 on duplicate checkin", async () => {
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([{ id: "div1" }]);
    enqueueSelectResult([{ id: "pair1" }]);
    enqueueSelectResult([{ id: "c_exist" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: "sess1",
        division: "Classic",
        queue_type: "standard",
        partner_id: null,
      }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("DUPLICATE_CHECKIN");
  });
});

describe("DELETE /v1/checkins/mine", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/mine?session_id=sess1`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when no active checkin", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/mine?session_id=sess1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("withdraws checkin and returns 204", async () => {
    enqueueSelectResult([{ id: "c1" }]);
    const res = await app.request(`${BASE}/mine?session_id=sess1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });
});

describe("PATCH /v1/checkins/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without bearer token", async () => {
    const res = await app.request(`${BASE}/c1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "running" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not admin", async () => {
    const res = await app.request(`${BASE}/c1`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "running" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when checkin not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/nonexistent`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "running" }),
    });
    expect(res.status).toBe(404);
  });

  it("updates status and returns 200", async () => {
    enqueueSelectResult([mockCheckin]);
    enqueueSelectResult([{ ...mockCheckin, status: "running" as const }]);
    const res = await app.request(`${BASE}/c1`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status: "running" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ status: "running" });
  });
});

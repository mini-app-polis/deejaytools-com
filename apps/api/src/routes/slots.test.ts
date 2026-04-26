import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessListEnvelope,
  adminHeaders,
  authHeaders,
  type ErrorEnvelope,
  readJson,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: (await import("../test/mocks.js")).mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});
vi.mock("../lib/pair-display.js", () => ({
  loadPairDisplayNames: vi.fn().mockResolvedValue(new Map<string, string>()),
}));

const BASE = "/v1/slots";

const mockSession = {
  id: "sess1",
  eventId: null as string | null,
  name: "S",
  date: null as string | null,
  checkinOpensAt: Date.now(),
  floorTrialStartsAt: Date.now(),
  floorTrialEndsAt: Date.now(),
  maxSlots: 7,
  maxPriorityRuns: 3,
  status: "in_progress" as const,
  createdBy: "user_admin123",
  createdAt: Date.now(),
};

const mockSlot = {
  id: "slot1",
  sessionId: "sess1",
  slotNumber: 1,
  checkinId: null as string | null,
  assignedAt: Date.now(),
};

describe("GET /v1/slots", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 400 when session_id missing", async () => {
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

describe("POST /v1/slots/fill", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without bearer token", async () => {
    const res = await app.request(`${BASE}/fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "sess1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user is not admin", async () => {
    const res = await app.request(`${BASE}/fill`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "sess1" }),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/fill`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "nonexistent" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when session not in_progress", async () => {
    enqueueSelectResult([{ ...mockSession, status: "scheduled" as const }]);
    const res = await app.request(`${BASE}/fill`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "sess1" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("SESSION_NOT_IN_PROGRESS");
  });

  it("returns 409 when no empty slots", async () => {
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/fill`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "sess1" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("NO_EMPTY_SLOTS");
  });

  it("returns 409 when no waiting checkins", async () => {
    enqueueSelectResult([mockSession]);
    enqueueSelectResult([mockSlot]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/fill`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "sess1" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("NO_CHECKINS_WAITING");
  });
});

describe("PATCH /v1/slots/:slot_number/clear", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without bearer token", async () => {
    const res = await app.request(`${BASE}/1/clear?session_id=sess1`, {
      method: "PATCH",
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when authenticated user is not admin", async () => {
    const res = await app.request(`${BASE}/1/clear?session_id=sess1`, {
      method: "PATCH",
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 when slot not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/1/clear?session_id=sess1`, {
      method: "PATCH",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(404);
  });

  it("returns 409 when slot already empty", async () => {
    enqueueSelectResult([mockSlot]);
    const res = await app.request(`${BASE}/1/clear?session_id=sess1`, {
      method: "PATCH",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("SLOT_ALREADY_EMPTY");
  });
});

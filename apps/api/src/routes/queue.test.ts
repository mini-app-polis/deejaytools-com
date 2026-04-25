import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessEnvelope,
  authHeaders,
  adminHeaders,
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

const BASE = "/v1/queue";

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
    enqueueSelectResult([
      {
        id: "qe1",
        checkinId: "c1",
        sessionId: "s1",
        entityPairId: "p1",
        entitySoloUserId: null,
        queueType: "active",
        position: 2,
      },
    ]);
    const res = await app.request(`${BASE}/promote`, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ queueEntryId: "qe1" }),
    });
    expect(res.status).toBe(400);
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

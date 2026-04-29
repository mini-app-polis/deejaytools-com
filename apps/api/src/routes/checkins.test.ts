import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessEnvelope,
  assertValidation400,
  authHeaders,
  type ErrorEnvelope,
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

const BASE = "/v1/checkins";
const now = Date.now();

const openSession = {
  id: "sess1",
  eventId: null as string | null,
  name: "S",
  date: null as string | null,
  checkinOpensAt: now - 10_000,
  floorTrialStartsAt: now - 5000,
  floorTrialEndsAt: now + 7_200_000,
  activePriorityMax: 6,
  activeNonPriorityMax: 4,
  status: "checkin_open" as const,
  createdBy: "user_admin123",
  createdAt: now,
};

const futureSession = {
  ...openSession,
  checkinOpensAt: now + 60_000,
};

const closedSession = {
  ...openSession,
  floorTrialEndsAt: now - 1000,
};

describe("POST /v1/checkins", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when entity XOR validation fails", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when check-in has not opened yet", async () => {
    enqueueSelectResult([futureSession]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when check-in is closed", async () => {
    enqueueSelectResult([closedSession]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when user is not pair leader", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ userAId: "other_user", partnerBId: null }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when entity already has a live queue entry", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ userAId: "user_test123", partnerBId: null }]);
    enqueueSelectResult([{ id: "qe1" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(409);
  });

  it("returns 201 for pair check-in into priority division → priority queue", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ userAId: "user_test123", partnerBId: null }]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: true, priorityRunLimit: 3 }]);
    enqueueSelectResult([{ n: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.initialQueue).toBe("priority");
  });

  it("returns 201 for non-priority division → non_priority", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ userAId: "user_test123", partnerBId: null }]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: false, priorityRunLimit: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    expect(body.data.initialQueue).toBe("non_priority");
  });

  it("demotes to non_priority when session run limit reached", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ userAId: "user_test123", partnerBId: null }]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: true, priorityRunLimit: 3 }]);
    enqueueSelectResult([{ n: 3 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    expect(body.data.initialQueue).toBe("non_priority");
  });

  it("returns 400 for solo check-in for someone else", async () => {
    enqueueSelectResult([openSession]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entitySoloUserId: "other_user",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 201 for valid solo check-in for current user", async () => {
    enqueueSelectResult([openSession]);
    enqueueSelectResult([]);
    enqueueSelectResult([openSession]);
    enqueueSelectResult([{ isPriority: false, priorityRunLimit: 0 }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entitySoloUserId: "user_test123",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ initialQueue: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.initialQueue).toBe("non_priority");
  });

  it("returns 404 when session not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "missing_session",
        divisionName: "Classic",
        entityPairId: "p1",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when both entityPairId and entitySoloUserId provided", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "sess1",
        divisionName: "Classic",
        entityPairId: "p1",
        entitySoloUserId: "user_test123",
        songId: "song1",
      }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });
});

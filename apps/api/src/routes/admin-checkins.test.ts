import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  adminHeaders,
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  authHeaders,
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

// Avoid hitting the real admission lookup which makes its own db calls; the
// inner queue logic is covered by admission.test.ts.
vi.mock("../lib/queue/admission.js", async () => {
  return {
    loadAdmissionContext: vi.fn(async () => ({
      sessionId: "s1",
      eventId: null,
      divisionName: "Classic",
      isDivisionPriority: false,
      sessionPriorityRunLimit: 0,
      eventPriorityRunLimit: null,
    })),
    determineInitialQueue: vi.fn(async () => "non_priority" as const),
  };
});

// entityHasLiveEntry is a separate concern; default to "no live entry".
vi.mock("../lib/queue/singleEntry.js", async () => ({
  entityHasLiveEntry: vi.fn(async () => false),
}));

// nextBottomPosition: deterministic value so we don't have to feed an extra
// select result inside the transaction.
vi.mock("../lib/queue/compaction.js", async () => ({
  nextBottomPosition: vi.fn(async () => 1),
}));

const POST = "/v1/admin/checkins";
const TEST = "/v1/admin/checkins/test";

const validBody = {
  sessionId: "s1",
  divisionName: "Classic",
  leaderFirstName: "Alice",
  leaderLastName: "Smith",
  followerFirstName: "Bob",
  followerLastName: "Jones",
};

describe("POST /v1/admin/checkins", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(POST, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(POST, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await app.request(POST, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: "s1" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the target session does not exist", async () => {
    // Session lookup → empty.
    enqueueSelectResult([]);
    const res = await app.request(POST, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
  });

  it("happy path: creates injection and returns 201 with synthetic pair", async () => {
    // 1. Session exists.
    enqueueSelectResult([{ id: "s1" }]);
    // 2. Placeholder song lookup → already exists, so no insert path.
    enqueueSelectResult([{ id: "placeholder-song-1" }]);

    const res = await app.request(POST, {
      method: "POST",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await readJson<
      SuccessEnvelope<{
        id: string;
        sessionId: string;
        divisionName: string;
        initialQueue: "priority" | "non_priority";
        pair: { id: string; partner_b_id: string | null; display_name: string };
      }>
    >(res);
    assertSuccessEnvelope(body);
    expect(body.data.sessionId).toBe("s1");
    expect(body.data.divisionName).toBe("Classic");
    expect(body.data.initialQueue).toBe("non_priority");
    expect(body.data.pair.display_name).toBe("Alice Smith & Bob Jones");
    expect(typeof body.data.pair.id).toBe("string");
  });
});

describe("GET /v1/admin/checkins/test", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(TEST);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await app.request(TEST, { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it("returns an empty list envelope when no test data exists", async () => {
    enqueueSelectResult([]);
    const res = await app.request(TEST, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    assertSuccessListEnvelope(await readJson<SuccessEnvelope<unknown[]>>(res));
  });

  it("maps queue_type to queue_status and returns the right shape", async () => {
    enqueueSelectResult([
      {
        pairId: "pair-1",
        pairCreatedAt: 100,
        leaderFirst: "Alice",
        leaderLast: "Smith",
        followerFirst: "Bob",
        followerLast: "Jones",
        checkinId: "ck1",
        sessionId: "s1",
        sessionName: "session-name-from-db",
        divisionName: "Classic",
        initialQueue: "priority",
        queueType: "active",
        position: 2,
      },
      {
        pairId: "pair-2",
        pairCreatedAt: 50,
        leaderFirst: "Carol",
        leaderLast: "Lee",
        followerFirst: null,
        followerLast: null,
        checkinId: null,
        sessionId: null,
        sessionName: null,
        divisionName: null,
        initialQueue: null,
        queueType: null,
        position: null,
      },
    ]);
    const res = await app.request(TEST, { headers: adminHeaders() });
    const body = await readJson<
      SuccessEnvelope<
        {
          pair_id: string;
          leader_name: string;
          follower_name: string | null;
          queue_status: string;
          position: number | null;
        }[]
      >
    >(res);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].leader_name).toBe("Alice Smith");
    expect(body.data[0].follower_name).toBe("Bob Jones");
    expect(body.data[0].queue_status).toBe("active");
    expect(body.data[0].position).toBe(2);
    // Second row — no follower, no queue entry yet.
    expect(body.data[1].follower_name).toBeNull();
    expect(body.data[1].queue_status).toBe("off_queue");
    expect(body.data[1].position).toBeNull();
  });
});

describe("DELETE /v1/admin/checkins/test", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(TEST, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin", async () => {
    const res = await app.request(TEST, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("returns deleted: 0 with no synthetic users present", async () => {
    // Stub user lookup → empty.
    enqueueSelectResult([]);
    const res = await app.request(TEST, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ deleted: number }>>(res);
    expect(body.data.deleted).toBe(0);
  });

  it("returns deleted count when synthetic users exist", async () => {
    // 1. Stub users lookup → two users.
    enqueueSelectResult([{ id: "stub-user-1" }, { id: "stub-user-2" }]);
    // 2. Stub pairs lookup → two pairs.
    enqueueSelectResult([{ id: "pair-1" }, { id: "pair-2" }]);
    // 3. Stub checkins lookup → two checkins.
    enqueueSelectResult([{ id: "ck-1" }, { id: "ck-2" }]);
    // The transaction's deletes don't read further selects in our mock.

    const res = await app.request(TEST, {
      method: "DELETE",
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ deleted: number }>>(res);
    expect(body.data.deleted).toBe(2);
  });
});

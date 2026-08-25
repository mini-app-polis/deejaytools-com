import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  assertValidation400,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

const { enqueueDriveJob } = vi.hoisted(() => ({
  enqueueDriveJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});
vi.mock("@sentry/node", () => ({
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn() })
  ),
  captureException: vi.fn(),
}));
vi.mock("../services/driveJobs.js", () => ({
  enqueueDriveJob,
}));

const BASE = "/v1/managed-partnerships";

const validBody = {
  leader_first_name: "Wendal",
  leader_last_name: "Smith",
  follower_first_name: "Lara",
  follower_last_name: "Jones",
};

describe("GET /v1/managed-partnerships", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns the user's mapped managed partnerships (excluding soft-deleted rows)", async () => {
    const row = {
      id: "mp_1",
      userId: "user_test123",
      leaderFirstName: "Wendal",
      leaderLastName: "Smith",
      followerFirstName: "Lara",
      followerLastName: "Jones",
      createdAt: 1000,
      updatedAt: 2000,
    };
    enqueueSelectResult([row]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual({
      id: "mp_1",
      user_id: "user_test123",
      leader_first_name: "Wendal",
      leader_last_name: "Smith",
      follower_first_name: "Lara",
      follower_last_name: "Jones",
      created_at: 1000,
      updated_at: 2000,
    });
  });
});

describe("POST /v1/managed-partnerships", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("creates and returns a managed partnership", async () => {
    const created = {
      id: "mp_new",
      userId: "user_test123",
      leaderFirstName: "Wendal",
      leaderLastName: "Smith",
      followerFirstName: "Lara",
      followerLastName: "Jones",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([created]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "mp_new",
      user_id: "user_test123",
      leader_first_name: "Wendal",
      follower_last_name: "Jones",
    });
  });

  it("normalizes name fields with titleCaseWords before save", async () => {
    vi.mocked(mockDb.insert).mockClear();
    const created = {
      id: "mp_norm",
      userId: "user_test123",
      leaderFirstName: "John",
      leaderLastName: "Doe",
      followerFirstName: "Jane",
      followerLastName: "Roe",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([created]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        leader_first_name: "john",
        leader_last_name: "doe",
        follower_first_name: "jane",
        follower_last_name: "roe",
      }),
    });
    expect(res.status).toBe(201);
    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    const valuesMock = insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        leaderFirstName: "John",
        leaderLastName: "Doe",
        followerFirstName: "Jane",
        followerLastName: "Roe",
      })
    );
  });

  it("returns 400 for an invalid body", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, leader_first_name: "" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });
});

describe("PATCH /v1/managed-partnerships/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when the managed partnership is not owned or found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/mp_1`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 404 when patching a soft-deleted managed partnership", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/mp_deleted`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/mp_1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 for an invalid body", async () => {
    const res = await app.request(`${BASE}/mp_1`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, follower_last_name: "" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });
});

describe("DELETE /v1/managed-partnerships/:id", () => {
  const existing = {
    id: "mp_1",
    userId: "user_test123",
    leaderFirstName: "Wendal",
    leaderLastName: "Smith",
    followerFirstName: "Lara",
    followerLastName: "Jones",
    createdAt: 1000,
    updatedAt: 2000,
    deletedAt: null as number | null,
  };

  beforeEach(() => {
    resetSelectQueue();
    enqueueDriveJob.mockClear();
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(mockDb.delete).mockClear();
    vi.mocked(mockDb.update).mockClear();
    vi.mocked(mockDb.transaction).mockClear();
    vi.mocked(mockDb.select).mockImplementation(() => mockDb);
    vi.mocked(mockDb.delete).mockImplementation(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mocked(mockDb.transaction).mockImplementation((fn) => fn(mockDb));
  });

  it("returns 404 when the managed partnership is not owned or found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 409 when the partnership has an active check-in", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([{ id: "chk_active" }]);
    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("MANAGED_PARTNERSHIP_IN_ACTIVE_CHECKIN");
    expect(mockDb.transaction).not.toHaveBeenCalled();
  });

  it("soft-deletes the partnership when it has no songs", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);

    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.delete).not.toHaveBeenCalled();
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });

  it("soft-deletes partnership songs, clears event submissions, and soft-deletes the partnership", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ id: "song_1" }, { id: "song_2" }]);

    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(2);
  });

  it("enqueues trash jobs for copies across partnership songs", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ id: "song_1" }, { id: "song_2" }]);
    enqueueSelectResult([
      { driveCopyFileId: "copy_1" },
      { driveCopyFileId: "copy_2" },
    ]);

    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(2);
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "copy_1",
    });
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "copy_2",
    });
  });

  it("does not enqueue trash jobs when copies are missing", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ id: "song_1" }]);
    enqueueSelectResult([{ driveCopyFileId: null }]);

    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).not.toHaveBeenCalled();
  });

  it("returns 204 when enqueueDriveJob rejects", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ id: "song_1" }]);
    enqueueSelectResult([{ driveCopyFileId: "copy_1" }]);
    enqueueDriveJob.mockRejectedValueOnce(new Error("queue down"));

    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("selects copy ids before deleting submission rows", async () => {
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ id: "song_1" }]);
    enqueueSelectResult([{ driveCopyFileId: "copy_1" }]);

    const txCallOrder: string[] = [];
    let inTx = false;
    vi.mocked(mockDb.transaction).mockImplementationOnce(async (fn) => {
      inTx = true;
      try {
        await fn(mockDb);
      } finally {
        inTx = false;
      }
    });
    vi.mocked(mockDb.select).mockImplementation(() => {
      if (inTx) txCallOrder.push("select");
      return mockDb;
    });
    vi.mocked(mockDb.delete).mockImplementation(() => {
      if (inTx) txCallOrder.push("delete");
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(txCallOrder.indexOf("select")).toBeGreaterThanOrEqual(0);
    expect(txCallOrder.indexOf("delete")).toBeGreaterThan(txCallOrder.indexOf("select"));
  });
});

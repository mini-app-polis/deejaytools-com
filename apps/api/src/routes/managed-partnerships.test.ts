import { beforeEach, describe, expect, it, vi } from "vitest";
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
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

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

  it("returns the user's mapped managed partnerships", async () => {
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
  beforeEach(() => {
    resetSelectQueue();
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
});

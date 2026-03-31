import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessListEnvelope,
  assertSuccessEnvelope,
  assertValidation400,
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
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

const BASE = "/v1/partners";

describe("GET /v1/partners", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth token", async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns success list envelope with empty list", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toEqual([]);
    expect(body.meta.count).toBe(0);
  });

  it("returns partners owned by the user", async () => {
    const partner = {
      id: "p1",
      userId: "user_test123",
      firstName: "Jane",
      lastName: "Doe",
      email: null,
      linkedUserId: null,
      partnerRole: "follower",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([partner]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "p1",
      first_name: "Jane",
      last_name: "Doe",
      partner_role: "follower",
    });
  });
});

describe("POST /v1/partners", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 400 when partner_role is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ first_name: "Jane", last_name: "Doe" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<HonoZodFailureBody>(res));
  });

  it("returns 400 when first_name is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ last_name: "Doe", partner_role: "follower" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<HonoZodFailureBody>(res));
  });

  it("creates a partner and returns 201 with envelope", async () => {
    const created = {
      id: "p_new",
      userId: "user_test123",
      firstName: "Jane",
      lastName: "Doe",
      email: null,
      linkedUserId: null,
      partnerRole: "follower",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([created]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        first_name: "Jane",
        last_name: "Doe",
        partner_role: "follower",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "p_new", partner_role: "follower" });
  });
});

describe("DELETE /v1/partners/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when partner not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/nonexistent`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 409 when partner has active checkin", async () => {
    const partner = {
      id: "p1",
      userId: "user_test123",
      firstName: "J",
      lastName: "D",
      email: null,
      linkedUserId: null,
      partnerRole: "follower",
      createdAt: 1,
      updatedAt: 1,
    };
    enqueueSelectResult([partner]);
    enqueueSelectResult([{ id: "checkin1" }]);
    const res = await app.request(`${BASE}/p1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("PARTNER_IN_ACTIVE_CHECKIN");
  });

  it("deletes partner and returns 204", async () => {
    const partner = {
      id: "p1",
      userId: "user_test123",
      firstName: "J",
      lastName: "D",
      email: null,
      linkedUserId: null,
      partnerRole: "follower",
      createdAt: 1,
      updatedAt: 1,
    };
    enqueueSelectResult([partner]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/p1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });
});

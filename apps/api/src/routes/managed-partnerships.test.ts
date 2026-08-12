import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessEnvelope,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";

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
  it("returns 200 with an empty list and meta.stub === true", async () => {
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual([]);
    expect(body.meta.stub).toBe(true);
  });
});

describe("POST /v1/managed-partnerships", () => {
  it("returns 501 DB_STUB_PENDING for a valid body", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(501);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("DB_STUB_PENDING");
  });

  it("returns 400 for an invalid body", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, leader_first_name: "" }),
    });
    expect(res.status).toBe(400);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
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
    vi.clearAllMocks();
  });

  it("returns 501 DB_STUB_PENDING", async () => {
    const res = await app.request(`${BASE}/mp_1`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(501);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("DB_STUB_PENDING");
  });
});

describe("DELETE /v1/managed-partnerships/:id", () => {
  it("returns 501 DB_STUB_PENDING", async () => {
    const res = await app.request(`${BASE}/mp_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(501);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("DB_STUB_PENDING");
  });
});

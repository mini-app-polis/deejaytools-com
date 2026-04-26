import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessEnvelope,
  assertSuccessListEnvelope,
  assertValidation400,
  authHeaders,
  type ErrorEnvelope,
  MOCK_ADMIN,
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

const BASE = "/v1/events";

describe("GET /v1/events", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("is public and returns a success list envelope", async () => {
    const ev = {
      id: "e1",
      name: "Social",
      date: "2026-01-01",
      status: "upcoming",
      createdBy: "user_admin123",
      createdAt: 1,
      updatedAt: 2,
    };
    enqueueSelectResult([ev]);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "e1",
      name: "Social",
    });
  });
});

describe("POST /v1/events", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New event" }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when name is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ date: "2026-06-01" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 201 with envelope on valid body", async () => {
    const created = {
      id: "e_new",
      name: "Workshop",
      date: null,
      status: "upcoming",
      createdBy: "user_admin123",
      createdAt: 10,
      updatedAt: 10,
    };
    enqueueSelectResult([created]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Workshop" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "e_new", name: "Workshop" });
  });
});

describe("PATCH /v1/events/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when event not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/missing`, {
      method: "PATCH",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "Renamed" }),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 on valid update", async () => {
    const existing = {
      id: "e1",
      name: "Old",
      date: null,
      status: "upcoming" as const,
      createdBy: "user_admin123",
      createdAt: 1,
      updatedAt: 2,
    };
    const updated = {
      ...existing,
      name: "New name",
      updatedAt: 99,
    };
    enqueueSelectResult([existing]);
    enqueueSelectResult([updated]);
    const res = await app.request(`${BASE}/e1`, {
      method: "PATCH",
      headers: {
        ...authHeaders(MOCK_ADMIN),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: "New name" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "e1", name: "New name" });
  });
});

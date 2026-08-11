import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ctu from "common-typescript-utils";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessEnvelope,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

vi.mock("common-typescript-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("common-typescript-utils")>();
  return {
    ...actual,
    verifyClerkToken: vi.fn(),
  };
});

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});

vi.mock("../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth.js")>();
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    ...actual,
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

const verifyClerkToken = vi.mocked(ctu.verifyClerkToken);

describe("POST /v1/auth/sync", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
    vi.mocked(mockDb.insert).mockClear();
  });

  it("returns 401 without bearer token", async () => {
    const res = await app.request("/v1/auth/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "sync@example.com",
      }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 and user envelope on valid token (upsert)", async () => {
    verifyClerkToken.mockResolvedValue({ sub: "user_sync_1", email: "sync@example.com" });
    const userRow = {
      id: "user_sync_1",
      email: "sync@example.com",
      firstName: "S",
      lastName: "Y",
      displayName: null,
      role: "user" as const,
      createdAt: 1,
      updatedAt: 2,
    };
    enqueueSelectResult([userRow]);
    const res = await app.request("/v1/auth/sync", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake.jwt.token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "sync@example.com",
        firstName: "S",
        lastName: "Y",
      }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "user_sync_1",
      email: "sync@example.com",
      first_name: "S",
      last_name: "Y",
      role: "user",
    });
  });

  it("does not overwrite first_name/last_name on conflict update for an existing user", async () => {
    verifyClerkToken.mockResolvedValue({ sub: "user_sync_2", email: "existing@example.com" });
    const userRow = {
      id: "user_sync_2",
      email: "existing@example.com",
      firstName: "Kept",
      lastName: "Name",
      displayName: null,
      role: "user" as const,
      createdAt: 1,
      updatedAt: 2,
    };
    enqueueSelectResult([userRow]);

    const res = await app.request("/v1/auth/sync", {
      method: "POST",
      headers: {
        Authorization: "Bearer fake.jwt.token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: "existing@example.com",
        firstName: "Clerk",
        lastName: "Overwrite",
        displayName: "Clerk Display",
      }),
    });
    expect(res.status).toBe(200);

    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    const valuesMock = insertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>;
    const onConflictMock = valuesMock.mock.results[0].value.onConflictDoUpdate as ReturnType<
      typeof vi.fn
    >;
    expect(onConflictMock).toHaveBeenCalledWith(
      expect.objectContaining({
        set: {
          email: "existing@example.com",
          updatedAt: expect.any(Number),
        },
      })
    );
    const conflictSet = onConflictMock.mock.calls[0][0].set as Record<string, unknown>;
    expect(conflictSet).not.toHaveProperty("firstName");
    expect(conflictSet).not.toHaveProperty("lastName");
    expect(conflictSet).not.toHaveProperty("displayName");
  });
});

describe("GET /v1/auth/me", () => {
  beforeEach(() => {
    resetSelectQueue();
    verifyClerkToken.mockReset();
  });

  it("returns 401 without token", async () => {
    const res = await app.request("/v1/auth/me");
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 with user shape when token and synced user exist", async () => {
    const userRow = {
      id: "user_test123",
      email: "me@example.com",
      firstName: "M",
      lastName: "E",
      displayName: null,
      role: "user" as const,
      createdAt: 5,
      updatedAt: 6,
    };
    enqueueSelectResult([userRow]);
    const res = await app.request("/v1/auth/me", { headers: authHeaders({ userId: "user_test123" }) });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "user_test123",
      email: "me@example.com",
      first_name: "M",
      last_name: "E",
      role: "user",
    });
  });
});

describe("PATCH /v1/auth/me", () => {
  beforeEach(() => {
    resetSelectQueue();
    vi.mocked(mockDb.update).mockClear();
  });

  it("updates names and returns the snake_case profile", async () => {
    const updatedRow = {
      id: "user_test123",
      email: "me@example.com",
      firstName: "Ada",
      lastName: "Lovelace",
      displayName: null,
      role: "user" as const,
      createdAt: 5,
      updatedAt: 99,
    };
    enqueueSelectResult([updatedRow]);

    const res = await app.request("/v1/auth/me", {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Ada", lastName: "Lovelace" }),
    });

    expect(res.status).toBe(200);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual({
      id: "user_test123",
      email: "me@example.com",
      display_name: null,
      first_name: "Ada",
      last_name: "Lovelace",
      role: "user",
      created_at: 5,
      updated_at: 99,
    });
  });

  it("returns 400 when a name is empty or missing", async () => {
    const emptyName = await app.request("/v1/auth/me", {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "", lastName: "Lovelace" }),
    });
    expect(emptyName.status).toBe(400);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(emptyName));

    const missingName = await app.request("/v1/auth/me", {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Ada" }),
    });
    expect(missingName.status).toBe(400);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(missingName));
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await app.request("/v1/auth/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ firstName: "Ada", lastName: "Lovelace" }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });
});

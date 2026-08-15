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
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

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

const BASE = "/v1/teams";

describe("GET /v1/teams", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns the user's mapped teams", async () => {
    const team = {
      id: "team_1",
      userId: "user_test123",
      identifier: "JTSwing Team Junior Varsity Season 13",
      createdAt: 1000,
      updatedAt: 2000,
    };
    enqueueSelectResult([team]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toEqual({
      id: "team_1",
      user_id: "user_test123",
      identifier: "JTSwing Team Junior Varsity Season 13",
      created_at: 1000,
      updated_at: 2000,
    });
  });
});

describe("POST /v1/teams", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("creates and returns a team", async () => {
    const created = {
      id: "team_new",
      userId: "user_test123",
      identifier: "JTSwing Team Junior Varsity Season 13",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([created]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "JTSwing Team Junior Varsity Season 13" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "team_new",
      user_id: "user_test123",
      identifier: "JTSwing Team Junior Varsity Season 13",
    });
  });

  it("normalizes identifier with titleCaseIfNoCaps before save", async () => {
    vi.mocked(mockDb.insert).mockClear();
    const created = {
      id: "team_norm",
      userId: "user_test123",
      identifier: "Jtswing Team Jv",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([created]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "jtswing team jv" }),
    });
    expect(res.status).toBe(201);
    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    const valuesMock = insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "Jtswing Team Jv" })
    );
  });

  it("preserves existing capitals in team identifiers", async () => {
    vi.mocked(mockDb.insert).mockClear();
    const created = {
      id: "team_caps",
      userId: "user_test123",
      identifier: "JTSwing Team JV",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([created]);
    let res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "JTSwing Team JV" }),
    });
    expect(res.status).toBe(201);
    let insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    let valuesMock = insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "JTSwing Team JV" })
    );

    vi.mocked(mockDb.insert).mockClear();
    enqueueSelectResult([
      {
        ...created,
        id: "team_mixed",
        identifier: "jtSwing Team",
      },
    ]);
    res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "jtSwing team" }),
    });
    expect(res.status).toBe(201);
    insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    valuesMock = insertMock.mock.results[0]!.value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: "jtSwing Team" })
    );
  });

  it("returns 409 when identifier is duplicated", async () => {
    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    insertMock.mockImplementationOnce(() => ({
      values: vi.fn(() => Promise.reject({ code: "23505" })),
    }));
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "JTSwing Team" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toBe("You already have a team with that name.");
  });

  it("returns 400 for an invalid identifier", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "bad@name!" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "JTSwing Team" }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });
});

describe("PATCH /v1/teams/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when the team is not owned or found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/team_1`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "Updated Team Name" }),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/team_1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "Updated Team Name" }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 for an invalid identifier", async () => {
    const res = await app.request(`${BASE}/team_1`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: "bad@name!" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });
});

describe("DELETE /v1/teams/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when the team is not owned or found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/team_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/team_1`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  adminHeaders,
  assertSuccessListEnvelope,
  authHeaders,
  MOCK_ADMIN,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

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

const LIST_ENDPOINT = "/v1/admin/users";

type AdminUserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: "user" | "admin";
  created_at: number;
  song_count: number;
  partner_count: number;
};

beforeEach(() => {
  resetSelectQueue();
  vi.clearAllMocks();
});

describe("GET /v1/admin/users", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request(LIST_ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(LIST_ENDPOINT, { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it("returns an empty list envelope when there are no users", async () => {
    enqueueSelectResult([]);
    const res = await app.request(LIST_ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<AdminUserRow[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toEqual([]);
  });

  it("flattens drizzle camelCase to snake_case in the response payload", async () => {
    enqueueSelectResult([
      {
        id: "user_1",
        email: "alice@example.com",
        firstName: "Alice",
        lastName: "Smith",
        role: "admin",
        createdAt: 1700000000000,
        songCount: 3,
        partnerCount: 2,
      },
      {
        id: "user_2",
        email: "bob@example.com",
        firstName: "Bob",
        lastName: null,
        role: "user",
        createdAt: 1710000000000,
        songCount: 0,
        partnerCount: 0,
      },
    ]);

    const res = await app.request(LIST_ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<AdminUserRow[]>>(res);
    expect(body.data).toEqual([
      {
        id: "user_1",
        email: "alice@example.com",
        first_name: "Alice",
        last_name: "Smith",
        role: "admin",
        created_at: 1700000000000,
        song_count: 3,
        partner_count: 2,
      },
      {
        id: "user_2",
        email: "bob@example.com",
        first_name: "Bob",
        last_name: null,
        role: "user",
        created_at: 1710000000000,
        song_count: 0,
        partner_count: 0,
      },
    ]);
  });

  it("coerces string counts (driver bigint quirk) into JS numbers", async () => {
    // postgres.js sometimes returns COUNT(*) as a string even with ::int —
    // the route should defensively coerce so the frontend always sees a
    // number it can render and compare.
    enqueueSelectResult([
      {
        id: "user_3",
        email: "charlie@example.com",
        firstName: "Charlie",
        lastName: null,
        role: "user",
        createdAt: 1720000000000,
        songCount: "7", // arrives as string from the driver
        partnerCount: "4",
      },
    ]);

    const res = await app.request(LIST_ENDPOINT, { headers: adminHeaders() });
    const body = await readJson<SuccessEnvelope<AdminUserRow[]>>(res);
    expect(body.data[0].song_count).toBe(7);
    expect(body.data[0].partner_count).toBe(4);
    expect(typeof body.data[0].song_count).toBe("number");
    expect(typeof body.data[0].partner_count).toBe("number");
  });

  it("treats null/missing counts as 0", async () => {
    enqueueSelectResult([
      {
        id: "user_4",
        email: "dave@example.com",
        firstName: "Dave",
        lastName: null,
        role: "user",
        createdAt: 1730000000000,
        songCount: null,
        partnerCount: null,
      },
    ]);

    const res = await app.request(LIST_ENDPOINT, { headers: adminHeaders() });
    const body = await readJson<SuccessEnvelope<AdminUserRow[]>>(res);
    expect(body.data[0].song_count).toBe(0);
    expect(body.data[0].partner_count).toBe(0);
  });

  it("accepts q + role query params without erroring", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${LIST_ENDPOINT}?q=alice&role=admin`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid role query param with 400", async () => {
    const res = await app.request(`${LIST_ENDPOINT}?role=superadmin`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /v1/admin/users/:id/role", () => {
  const TARGET_ID = "user_target";

  it("returns 401 without auth", async () => {
    const res = await app.request(`${LIST_ENDPOINT}/${TARGET_ID}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(`${LIST_ENDPOINT}/${TARGET_ID}/role`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects an invalid role with 400", async () => {
    const res = await app.request(`${LIST_ENDPOINT}/${TARGET_ID}/role`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ role: "superuser" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when an admin tries to demote themselves", async () => {
    // Caller is MOCK_ADMIN (id user_admin123). Targeting that same id with a
    // non-admin role should be blocked before any DB writes occur.
    const res = await app.request(`${LIST_ENDPOINT}/${MOCK_ADMIN.userId}/role`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user" }),
    });
    expect(res.status).toBe(403);
    // Self-demote check fires before the existence lookup, so update() should
    // never have been invoked.
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the target user does not exist", async () => {
    enqueueSelectResult([]); // existence check returns no rows
    const res = await app.request(`${LIST_ENDPOINT}/${TARGET_ID}/role`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    expect(res.status).toBe(404);
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("updates the user's role and returns the refreshed row", async () => {
    enqueueSelectResult([{ id: TARGET_ID }]); // existence check
    enqueueSelectResult([
      {
        id: TARGET_ID,
        email: "promoted@example.com",
        firstName: "Promoted",
        lastName: "User",
        role: "admin",
        createdAt: 1700000000000,
        songCount: 5,
        partnerCount: 3,
      },
    ]); // refreshed row

    const res = await app.request(`${LIST_ENDPOINT}/${TARGET_ID}/role`, {
      method: "PATCH",
      headers: { ...adminHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });

    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<AdminUserRow>>(res);
    expect(body.data).toEqual({
      id: TARGET_ID,
      email: "promoted@example.com",
      first_name: "Promoted",
      last_name: "User",
      role: "admin",
      created_at: 1700000000000,
      song_count: 5,
      partner_count: 3,
    });
    expect(mockDb.update).toHaveBeenCalledTimes(1);
  });
});

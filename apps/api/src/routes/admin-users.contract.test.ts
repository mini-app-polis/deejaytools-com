/**
 * Contract tests — GET /v1/admin/users
 *
 * Validates that the admin user list payload satisfies ApiAdminUser.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiAdminUserSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { adminHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const BASE = "/v1/admin/users";

const dbUser = {
  id: "user_abc123",
  email: "alice@example.com",
  firstName: "Alice",
  lastName: "Smith",
  role: "user" as "user" | "admin",
  createdAt: 1_000_000,
  songCount: 2,
  partnerCount: 1,
};

const dbAdmin = {
  id: "user_admin1",
  email: "admin@example.com",
  firstName: "Admin",
  lastName: null as string | null,
  role: "admin" as "user" | "admin",
  createdAt: 2_000_000,
  songCount: 0,
  partnerCount: 0,
};

beforeEach(resetSelectQueue);

describe("GET /v1/admin/users — contract", () => {
  it("body.data is an array of ApiAdminUser", async () => {
    enqueueSelectResult([dbUser, dbAdmin]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiAdminUserSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("nullable first_name and last_name are accepted", async () => {
    enqueueSelectResult([{ ...dbUser, firstName: null, lastName: null }]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiAdminUserSchema).safeParse(data).success).toBe(true);
  });

  it("role:admin user satisfies schema", async () => {
    enqueueSelectResult([dbAdmin]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiAdminUserSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("empty list is accepted", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiAdminUserSchema).safeParse(data).success).toBe(true);
  });
});

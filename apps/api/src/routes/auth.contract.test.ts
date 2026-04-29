/**
 * Contract tests — GET /v1/auth/me
 *
 * Validates that the authenticated user profile payload satisfies ApiAuthMe.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiAuthMeSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { authHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const BASE = "/v1/auth/me";

const dbUser = {
  id: "user_test123",
  email: "alice@example.com",
  displayName: "alice",
  firstName: "Alice",
  lastName: "Smith",
  role: "user",
  createdAt: 1_000_000,
  updatedAt: 2_000_000,
};

beforeEach(resetSelectQueue);

describe("GET /v1/auth/me — contract", () => {
  it("body.data matches ApiAuthMe", async () => {
    enqueueSelectResult([dbUser]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = ApiAuthMeSchema.safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("nullable fields (display_name, first_name, last_name) are accepted as null", async () => {
    enqueueSelectResult([{ ...dbUser, displayName: null, firstName: null, lastName: null }]);
    const res = await app.request(BASE, { headers: authHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    const result = ApiAuthMeSchema.safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });
});

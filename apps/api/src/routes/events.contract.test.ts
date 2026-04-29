/**
 * Contract tests — GET /v1/events and GET /v1/events/:id
 *
 * These tests verify that the response body matches the ApiEvent Zod schema
 * defined in @deejaytools/schemas.  Any drift between mapEvent() and the
 * shared type contract will cause a test failure here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiEventSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { authHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";
import { responseCache } from "../lib/cache.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const BASE = "/v1/events";

/** Minimal DB row shape as Drizzle returns it (camelCase). */
const dbEvent = {
  id: "ev-1",
  name: "Test Social",
  startDate: "2026-06-01",
  endDate: "2026-06-03",
  timezone: "America/Chicago",
  createdBy: "user_admin",
  createdAt: 1_000_000,
  updatedAt: 2_000_000,
};

beforeEach(() => {
  resetSelectQueue();
  responseCache.invalidatePrefix("");
});

describe("GET /v1/events — contract", () => {
  it("body.data is an array of ApiEvent", async () => {
    enqueueSelectResult([dbEvent]);
    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiEventSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("empty list still satisfies the schema", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE);
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiEventSchema).safeParse(data).success).toBe(true);
  });
});

describe("GET /v1/events/:id — contract", () => {
  it("body.data matches ApiEvent", async () => {
    enqueueSelectResult([dbEvent]);
    const res = await app.request(`${BASE}/ev-1`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = ApiEventSchema.safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  adminHeaders,
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
vi.mock("../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth.js")>();
  const { mockRequireAdmin, mockRequireAuth } = await import("../test/mocks.js");
  return {
    ...actual,
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

const ENDPOINT = "/v1/admin/event-song-submissions";

describe("GET /v1/admin/event-song-submissions", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request(`${ENDPOINT}?event_id=evt_1`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(`${ENDPOINT}?event_id=evt_1`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when event_id is missing", async () => {
    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(400);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 with an empty list and meta.stub === true when event_id is provided", async () => {
    const res = await app.request(`${ENDPOINT}?event_id=evt_1`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual([]);
    expect(body.meta.stub).toBe(true);
  });
});

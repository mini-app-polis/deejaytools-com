import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertSuccessEnvelope,
  authHeaders,
  readJson,
  type ErrorEnvelope,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../middleware/auth.js")>();
  const { mockRequireAuth } = await import("../test/mocks.js");
  return {
    ...actual,
    requireAuth: mockRequireAuth(),
  };
});

const ENDPOINT = "/v1/pairs/find-or-create";

describe("POST /v1/pairs/find-or-create", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: "partner-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 when partner_id is missing", async () => {
    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when partner is not owned by the user", async () => {
    // Partner ownership lookup returns no rows.
    enqueueSelectResult([]);
    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: "stranger-partner" }),
    });
    expect(res.status).toBe(404);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/Partner/i);
  });

  it("returns the existing pair id when one already exists", async () => {
    // First select: partner ownership lookup → owned.
    enqueueSelectResult([{ id: "partner-1" }]);
    // Second select: existing pair lookup → returns it.
    enqueueSelectResult([{ id: "existing-pair-1" }]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: "partner-1" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ id: string }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.id).toBe("existing-pair-1");
  });

  it("creates a new pair and returns 201 when no pair exists yet", async () => {
    // First select: partner ownership lookup → owned.
    enqueueSelectResult([{ id: "partner-1" }]);
    // Second select: existing pair lookup → empty.
    enqueueSelectResult([]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: "partner-1" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<{ id: string }>>(res);
    assertSuccessEnvelope(body);
    // The new pair id is generated server-side via crypto.randomUUID — just
    // assert that one was returned.
    expect(typeof body.data.id).toBe("string");
    expect(body.data.id.length).toBeGreaterThan(0);
  });
});

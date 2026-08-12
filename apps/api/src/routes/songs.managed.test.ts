import { describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  authHeaders,
  type ErrorEnvelope,
  readJson,
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

const BASE = "/v1/songs/managed";

const validBody = {
  managed_partnership_id: "mp_1",
  division: "Classic",
  routine_name: "Open 2026",
  personal_descriptor: "v1",
  original_filename: "routine.mp3",
};

describe("POST /v1/songs/managed", () => {
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

  it("returns 400 when managed_partnership_id is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ division: "Classic" }),
    });
    expect(res.status).toBe(400);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when division is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ managed_partnership_id: "mp_1" }),
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

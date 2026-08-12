import { describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
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
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return {
    requireAuth: mockRequireAuth(),
    requireAdmin: mockRequireAdmin(),
  };
});

const BASE = "/v1/event-song-submissions";

const validBody = {
  event_id: "evt_1",
  song_id: "song_1",
};

describe("GET /v1/event-song-submissions", () => {
  it("returns 200 with an empty list and meta.stub === true", async () => {
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual([]);
    expect(body.meta.stub).toBe(true);
  });

  it("returns 200 with an empty list when event_id is provided", async () => {
    const res = await app.request(`${BASE}?event_id=evt_1`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toEqual([]);
    expect(body.meta.stub).toBe(true);
  });
});

describe("POST /v1/event-song-submissions", () => {
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

  it("returns 400 when event_id is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: "song_1" }),
    });
    expect(res.status).toBe(400);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when song_id is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1" }),
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

describe("DELETE /v1/event-song-submissions/:id", () => {
  it("returns 501 DB_STUB_PENDING", async () => {
    const res = await app.request(`${BASE}/sub_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(501);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("DB_STUB_PENDING");
  });
});

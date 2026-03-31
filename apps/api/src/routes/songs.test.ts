import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessListEnvelope,
  assertSuccessEnvelope,
  assertValidation400,
  authHeaders,
  type ErrorEnvelope,
  type HonoZodFailureBody,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

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

const BASE = "/v1/songs";

function songSelectRow(detail: { id: string; partnerId?: string | null; userId?: string }) {
  const now = Date.now();
  return {
    song: {
      id: detail.id,
      userId: detail.userId ?? "user_test123",
      partnerId: detail.partnerId ?? null,
      displayName: "My Song",
      originalFilename: "a.mp3",
      driveFileId: null,
      driveFolderId: null,
      processedFilename: null,
      division: "open",
      routineName: null,
      personalDescriptor: null,
      seasonYear: null,
      createdAt: now,
      updatedAt: now,
    },
    partner_first_name: "Jane",
    partner_last_name: "Doe",
  };
}

describe("GET /v1/songs", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth token", async () => {
    const res = await app.request(BASE);
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns success list envelope with empty list", async () => {
    enqueueSelectResult([]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toEqual([]);
  });

  it("returns songs for the current user (visibility filter)", async () => {
    enqueueSelectResult([songSelectRow({ id: "s1", partnerId: "p1" })]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "s1",
      partner_id: "p1",
      division: "open",
    });
  });
});

describe("POST /v1/songs", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 400 when division is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: "p1" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<HonoZodFailureBody>(res));
  });

  it("returns 400 when partner_id is JSON null", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ division: "open", partner_id: null }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<HonoZodFailureBody>(res));
  });

  it("creates a song and returns 201 with envelope", async () => {
    const row = songSelectRow({
      id: "s_new",
      partnerId: "p1",
    }).song;
    enqueueSelectResult([{ id: "p1" }]);
    enqueueSelectResult([row]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        division: "open",
        partner_id: "p1",
      }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "s_new",
      division: "open",
      partner_id: "p1",
    });
  });
});

describe("DELETE /v1/songs/:id", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when song not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/missing`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 409 when song has active checkin", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([{ id: "chk1" }]);
    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("SONG_IN_ACTIVE_CHECKIN");
  });

  it("deletes song and returns 204", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });
});

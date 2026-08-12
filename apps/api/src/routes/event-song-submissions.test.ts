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

const BASE = "/v1/event-song-submissions";

const validBody = {
  event_id: "evt_1",
  song_id: "song_1",
};

const joinedRow = {
  id: "sub_1",
  eventId: "evt_1",
  songId: "song_1",
  createdAt: 1000,
  eventName: "Spring Classic",
  eventStartDate: "2026-03-01",
  eventEndDate: "2026-03-03",
  songDivision: "Classic",
  songDisplayName: "Sky High",
  songProcessedFilename: "alice_bob_classic_2026_v03.mp3",
  songRoutineName: "Sky High",
  songSeasonYear: "2026",
  ownerFirst: "Alice",
  ownerLast: "Smith",
  partnerFirst: "Bob",
  partnerLast: "Jones",
  managedLeaderFirst: null,
  managedLeaderLast: null,
  managedFollowerFirst: null,
  managedFollowerLast: null,
};

describe("GET /v1/event-song-submissions", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns the user's joined submission rows", async () => {
    enqueueSelectResult([joinedRow]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "sub_1",
      event_id: "evt_1",
      event_name: "Spring Classic",
      event_start_date: "2026-03-01",
      song_id: "song_1",
      division: "Classic",
      created_at: 1000,
    });
    expect(body.data[0]).toHaveProperty("event_status");
    expect(body.data[0]).toHaveProperty("song_label");
    expect(body.data[0]).toMatchObject({
      song_label: "Alice Smith & Bob Jones Classic 2026 Sky High v03",
    });
  });

  it("uses the managed partnership label when the song has managed_partnership_id", async () => {
    enqueueSelectResult([
      {
        ...joinedRow,
        ownerFirst: "Manager",
        ownerLast: "User",
        partnerFirst: null,
        partnerLast: null,
        managedLeaderFirst: "Wendal",
        managedLeaderLast: "Smith",
        managedFollowerFirst: "Lara",
        managedFollowerLast: "Jones",
      },
    ]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data[0]).toMatchObject({
      song_label: "Wendal Smith & Lara Jones Classic 2026 Sky High v03",
    });
  });

  it("filters by event_id when provided", async () => {
    enqueueSelectResult([joinedRow]);
    const res = await app.request(`${BASE}?event_id=evt_1`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
  });
});

describe("POST /v1/event-song-submissions", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("creates and returns a joined submission row", async () => {
    enqueueSelectResult([{ id: "song_1" }]);
    enqueueSelectResult([{ id: "evt_1" }]);
    enqueueSelectResult([{ ...joinedRow, id: "sub_new" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({
      id: "sub_new",
      event_id: "evt_1",
      song_id: "song_1",
    });
  });

  it("returns 409 when the song is already submitted to the event", async () => {
    enqueueSelectResult([{ id: "song_1" }]);
    enqueueSelectResult([{ id: "evt_1" }]);
    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    insertMock.mockImplementationOnce(() => ({
      values: vi.fn(() => Promise.reject({ code: "23505" })),
    }));
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toBe("That song is already submitted to this event.");
  });

  it("returns 400 when event_id is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ song_id: "song_1" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when song_id is missing", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
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
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when the submission is not found", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/sub_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/sub_1`, {
      method: "DELETE",
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });
});

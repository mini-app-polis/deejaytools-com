import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  adminHeaders,
  assertErrorEnvelope,
  assertSuccessListEnvelope,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

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
  beforeEach(() => {
    resetSelectQueue();
  });

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

  it("returns cross-user submission rows for the event", async () => {
    enqueueSelectResult([
      {
        id: "sub_1",
        eventId: "evt_1",
        createdAt: 1000,
        eventName: "Spring Classic",
        songId: "song_1",
        songDivision: "Classic",
        songDisplayName: "Sky High",
        songProcessedFilename: "alice_bob_classic_2026_v03.mp3",
        songRoutineName: "Sky High",
        songSeasonYear: "2026",
        ownerFirst: "Alice",
        ownerLast: "Smith",
        partnerFirst: "Bob",
        partnerLast: "Jones",
        submitterEmail: "alice@example.com",
      },
    ]);
    const res = await app.request(`${ENDPOINT}?event_id=evt_1`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: "sub_1",
      event_id: "evt_1",
      event_name: "Spring Classic",
      division: "Classic",
      song_id: "song_1",
      partnership_label: "Alice Smith & Bob Jones",
      submitter_email: "alice@example.com",
      created_at: 1000,
    });
    expect(body.data[0]).toHaveProperty("song_label");
  });
});

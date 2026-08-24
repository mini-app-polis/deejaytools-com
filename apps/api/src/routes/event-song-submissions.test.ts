import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
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

const { enqueueDriveJob } = vi.hoisted(() => ({
  enqueueDriveJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@sentry/node", () => ({
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn() })
  ),
  captureException: vi.fn(),
}));

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
vi.mock("../services/driveJobs.js", () => ({
  enqueueDriveJob,
}));

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

  it("uses a single entity name for placeholder team partner songs", async () => {
    enqueueSelectResult([
      {
        ...joinedRow,
        songDivision: "Teams",
        songProcessedFilename: "teamalpha_teams_2026_v01.mp3",
        songRoutineName: "Team Routine",
        partnerFirst: "Team Alpha",
        partnerLast: "",
        partnerKind: "team",
      },
    ]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data[0]).toMatchObject({
      song_label: "Team Alpha Teams 2026 Team Routine v01",
    });
    expect(String((body.data[0] as { song_label: string }).song_label)).not.toContain(
      "Alice Smith & Team Alpha"
    );
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
    enqueueDriveJob.mockClear();
    vi.mocked(Sentry.captureException).mockClear();
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
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(enqueueDriveJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "copy", submissionId: expect.any(String) })
    );
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("still returns 201 and reports to Sentry when enqueueDriveJob rejects", async () => {
    enqueueDriveJob.mockRejectedValueOnce(new Error("queue down"));
    enqueueSelectResult([{ id: "song_1" }]);
    enqueueSelectResult([{ id: "evt_1" }]);
    enqueueSelectResult([{ ...joinedRow, id: "sub_new" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
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
    enqueueDriveJob.mockClear();
    vi.mocked(Sentry.captureException).mockClear();
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

  it("enqueues a trash job before deleting when drive_copy_file_id is set", async () => {
    enqueueSelectResult([{ id: "sub_1", driveCopyFileId: "drive_copy_1" }]);
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteMock = mockDb.delete as ReturnType<typeof vi.fn>;
    deleteMock.mockImplementationOnce(() => ({ where: deleteWhere }));

    const res = await app.request(`${BASE}/sub_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "drive_copy_1",
    });
    expect(enqueueDriveJob.mock.invocationCallOrder[0]).toBeLessThan(
      deleteWhere.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(deleteWhere).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("returns 204 and reports to Sentry when the trash enqueue rejects", async () => {
    enqueueSelectResult([{ id: "sub_1", driveCopyFileId: "drive_copy_1" }]);
    enqueueDriveJob.mockRejectedValueOnce(new Error("queue down"));
    const res = await app.request(`${BASE}/sub_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("does not enqueue a trash job when drive_copy_file_id is null", async () => {
    enqueueSelectResult([{ id: "sub_1", driveCopyFileId: null }]);
    const res = await app.request(`${BASE}/sub_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
    expect(enqueueDriveJob).not.toHaveBeenCalled();
  });
});

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

const USER_ID = "user_test123";

const classicPartnerSong = {
  id: "song_1",
  userId: USER_ID,
  partnerId: "p1" as string | null,
  managedPartnershipId: null as string | null,
  division: "Classic" as string | null,
};

function enqueueCreatePath(
  song: {
    id: string;
    userId: string;
    partnerId: string | null;
    managedPartnershipId: string | null;
    division: string | null;
  },
  existingRows: Array<
    {
      id: string;
      userId: string;
      partnerId: string | null;
      managedPartnershipId: string | null;
      division: string | null;
      submissionDivision?: string | null;
      submissionRound?: string | null;
    } & { submissionId?: string }
  > = [],
  event: { id: string; name: string } = { id: "evt_1", name: "Spring Classic" }
) {
  enqueueSelectResult([song]);
  enqueueSelectResult([event]);
  enqueueSelectResult(
    existingRows.map((row) => ({
      songId: row.id,
      userId: row.userId,
      partnerId: row.partnerId,
      managedPartnershipId: row.managedPartnershipId,
      songDivision: row.division,
      submissionDivision: row.submissionDivision ?? null,
      submissionRound: row.submissionRound ?? null,
    }))
  );
}

const joinedRow = {
  id: "sub_1",
  eventId: "evt_1",
  songId: "song_1",
  createdAt: 1000,
  eventName: "Spring Classic",
  eventStartDate: "2026-03-01",
  eventEndDate: "2026-03-03",
  submissionDivision: null,
  submissionRound: null,
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
    enqueueCreatePath(classicPartnerSong);
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
    enqueueCreatePath(classicPartnerSong);
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
    enqueueCreatePath(classicPartnerSong, [classicPartnerSong]);
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

  it("returns 409 ENTITY_SLOT_TAKEN for a second song with the same partner and division", async () => {
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2" },
      [{ ...classicPartnerSong, id: "song_1", submissionId: "sub_1" }]
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("ENTITY_SLOT_TAKEN");
  });

  it("returns 409 when a Classic override conflicts with an existing Classic submission", async () => {
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2", division: "Showcase" },
      [{ ...classicPartnerSong, id: "song_1", submissionId: "sub_1" }]
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2", division: "Classic" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("ENTITY_SLOT_TAKEN");
  });

  it("returns 409 when the existing song division has trailing whitespace", async () => {
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2" },
      [
        {
          ...classicPartnerSong,
          id: "song_1",
          division: "Classic ",
          submissionId: "sub_1",
        },
      ]
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    assertErrorEnvelope(body);
    expect(body.error.code).toBe("ENTITY_SLOT_TAKEN");
  });

  it("returns 400 when the division override is not in DIVISIONS", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, division: "classic" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 for an arbitrary division string", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, division: "Not A Real Division" }),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("allows the same partner in a different division", async () => {
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2", division: "Showcase" },
      [{ ...classicPartnerSong, id: "song_1", submissionId: "sub_1" }]
    );
    enqueueSelectResult([{ ...joinedRow, id: "sub_new", songId: "song_2", songDivision: "Showcase" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(res.status).toBe(201);
  });

  it("allows a different partner in the same division", async () => {
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2", partnerId: "p2" },
      [{ ...classicPartnerSong, id: "song_1", partnerId: "p1", submissionId: "sub_1" }]
    );
    enqueueSelectResult([{ ...joinedRow, id: "sub_new", songId: "song_2" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(res.status).toBe(201);
  });

  it("blocks by managed partnership even when partner_id differs", async () => {
    enqueueCreatePath(
      {
        id: "song_2",
        userId: USER_ID,
        partnerId: "p_other",
        managedPartnershipId: "mp_1",
        division: "Classic",
      },
      [
        {
          id: "song_1",
          userId: USER_ID,
          partnerId: "p1",
          managedPartnershipId: "mp_1",
          division: "Classic",
          submissionId: "sub_1",
        },
      ]
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("ENTITY_SLOT_TAKEN");
  });

  it("blocks a second solo song by the same user in the same division", async () => {
    const soloSong = {
      id: "song_1",
      userId: USER_ID,
      partnerId: null,
      managedPartnershipId: null,
      division: "Classic",
    };
    enqueueCreatePath(
      { ...soloSong, id: "song_2" },
      [{ ...soloSong, submissionId: "sub_1" }]
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("ENTITY_SLOT_TAKEN");
  });

  it("treats null-division songs as one slot and keeps Classic separate", async () => {
    const nullDivisionSong = {
      id: "song_1",
      userId: USER_ID,
      partnerId: null,
      managedPartnershipId: null,
      division: null as string | null,
    };
    enqueueCreatePath(
      { ...nullDivisionSong, id: "song_2" },
      [{ ...nullDivisionSong, submissionId: "sub_1" }]
    );
    const blocked = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(blocked.status).toBe(409);
    expect((await readJson<ErrorEnvelope>(blocked)).error.code).toBe("ENTITY_SLOT_TAKEN");

    resetSelectQueue();
    enqueueCreatePath(
      { ...nullDivisionSong, id: "song_3", division: "Classic" },
      [{ ...nullDivisionSong, submissionId: "sub_1" }]
    );
    enqueueSelectResult([{ ...joinedRow, id: "sub_new", songId: "song_3", songDivision: "Classic" }]);
    const allowed = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_3" }),
    });
    expect(allowed.status).toBe(201);
  });

  it("allows a second song after the first submission is removed from the slot", async () => {
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2" },
      [{ ...classicPartnerSong, id: "song_1", submissionId: "sub_1" }]
    );
    expect(
      (
        await app.request(BASE, {
          method: "POST",
          headers: { ...authHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
        })
      ).status
    ).toBe(409);

    resetSelectQueue();
    enqueueCreatePath({ ...classicPartnerSong, id: "song_2" }, []);
    enqueueSelectResult([{ ...joinedRow, id: "sub_new", songId: "song_2" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: "evt_1", song_id: "song_2" }),
    });
    expect(res.status).toBe(201);
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

  it("defaults: no division or round stores null and returns the song division with prelims_and_finals", async () => {
    const valuesMock = vi.fn(() => ({
      then(
        onfulfilled?: ((v: unknown) => unknown) | null,
        onrejected?: ((e: unknown) => unknown) | null
      ) {
        return Promise.resolve(undefined).then(onfulfilled, onrejected);
      },
    }));
    (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      values: valuesMock,
    }));
    enqueueCreatePath(classicPartnerSong);
    enqueueSelectResult([{ ...joinedRow, id: "sub_new" }]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ division: null, round: null })
    );
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    expect(body.data).toMatchObject({ division: "Classic", round: "prelims_and_finals" });
  });

  it("stores a division override without changing the song row", async () => {
    const valuesMock = vi.fn(() => ({
      then(
        onfulfilled?: ((v: unknown) => unknown) | null,
        onrejected?: ((e: unknown) => unknown) | null
      ) {
        return Promise.resolve(undefined).then(onfulfilled, onrejected);
      },
    }));
    (mockDb.insert as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      values: valuesMock,
    }));
    enqueueCreatePath(classicPartnerSong);
    enqueueSelectResult([
      {
        ...joinedRow,
        id: "sub_new",
        submissionDivision: "Showcase",
        songDivision: "Classic",
      },
    ]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, division: "Showcase" }),
    });
    expect(res.status).toBe(201);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ division: "Showcase", round: null })
    );
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    expect(body.data).toMatchObject({ division: "Showcase", round: "prelims_and_finals" });
  });

  it("allows prelims_only and finals_only for the same entity on The Open Classic", async () => {
    const openEvent = { id: "evt_open", name: "The Open 2026" };
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2" },
      [
        {
          ...classicPartnerSong,
          id: "song_1",
          submissionRound: "prelims_only",
        },
      ],
      openEvent
    );
    enqueueSelectResult([
      {
        ...joinedRow,
        id: "sub_new",
        eventId: "evt_open",
        songId: "song_2",
        submissionRound: "finals_only",
      },
    ]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "evt_open",
        song_id: "song_2",
        round: "finals_only",
      }),
    });
    expect(res.status).toBe(201);
  });

  it("returns 409 when prelims_only is submitted twice for the same slot", async () => {
    const openEvent = { id: "evt_open", name: "The Open 2026" };
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2" },
      [
        {
          ...classicPartnerSong,
          id: "song_1",
          submissionRound: "prelims_only",
        },
      ],
      openEvent
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "evt_open",
        song_id: "song_2",
        round: "prelims_only",
      }),
    });
    expect(res.status).toBe(409);
    expect((await readJson<ErrorEnvelope>(res)).error.code).toBe("ENTITY_SLOT_TAKEN");
  });

  it("returns 409 when prelims_and_finals already occupies finals", async () => {
    const openEvent = { id: "evt_open", name: "The Open 2026" };
    enqueueCreatePath(
      { ...classicPartnerSong, id: "song_2" },
      [{ ...classicPartnerSong, id: "song_1", submissionRound: "prelims_and_finals" }],
      openEvent
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "evt_open",
        song_id: "song_2",
        round: "finals_only",
      }),
    });
    expect(res.status).toBe(409);
    expect((await readJson<ErrorEnvelope>(res)).error.code).toBe("ENTITY_SLOT_TAKEN");
  });

  it("returns 400 for round selection on a non-Open event", async () => {
    enqueueCreatePath(classicPartnerSong);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, round: "finals_only" }),
    });
    expect(res.status).toBe(400);
    expect((await readJson<ErrorEnvelope>(res)).error.message).toBe(
      "Round selection is only available for The Open"
    );
  });

  it("returns 400 for round selection outside Classic on The Open", async () => {
    enqueueCreatePath(
      { ...classicPartnerSong, division: "Showcase" },
      [],
      { id: "evt_open", name: "The Open 2026" }
    );
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        event_id: "evt_open",
        song_id: "song_1",
        division: "Showcase",
        round: "finals_only",
      }),
    });
    expect(res.status).toBe(400);
    expect((await readJson<ErrorEnvelope>(res)).error.message).toBe(
      "Round selection is only available for the Classic division"
    );
  });

  it("returns the already-submitted conflict when re-submitting the identical song", async () => {
    enqueueCreatePath(classicPartnerSong, [classicPartnerSong]);
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
    expect(body.error.code).toBe("conflict");
    expect(body.error.message).toBe("That song is already submitted to this event.");
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

  it("enqueues a trash job after deleting when drive_copy_file_id is set", async () => {
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
    expect(deleteWhere.mock.invocationCallOrder[0]).toBeLessThan(
      enqueueDriveJob.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER
    );
    expect(deleteWhere).toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("does not enqueue a trash job when the delete fails", async () => {
    enqueueSelectResult([{ id: "sub_1", driveCopyFileId: "drive_copy_1" }]);
    const deleteMock = mockDb.delete as ReturnType<typeof vi.fn>;
    deleteMock.mockImplementationOnce(() => ({
      where: vi.fn().mockRejectedValue(new Error("delete failed")),
    }));

    const res = await app.request(`${BASE}/sub_1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(500);
    expect(enqueueDriveJob).not.toHaveBeenCalled();
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

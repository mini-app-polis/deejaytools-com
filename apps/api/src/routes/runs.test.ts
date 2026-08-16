import { beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../app.js";
import {
  adminHeaders,
  assertSuccessListEnvelope,
  authHeaders,
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

const ENDPOINT = "/v1/runs";

type RunRow = {
  id: string;
  completed_at: number;
  division_name: string;
  session_id: string;
  session_floor_trial_starts_at: number | null;
  event_id: string | null;
  event_name: string | null;
  song_id: string;
  song_label: string;
  entity_label: string;
  entity_key: string;
  completed_by_label: string;
};

describe("GET /v1/runs", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(ENDPOINT, { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it("returns an empty list envelope when there are no runs", async () => {
    enqueueSelectResult([]);
    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<RunRow[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toEqual([]);
  });

  it("returns runs with structured labels for a pair entity", async () => {
    enqueueSelectResult([
      {
        id: "run-1",
        completedAt: 1700000000000,
        divisionName: "Classic",
        sessionId: "s1",
        sessionFloorTrialStartsAt: 1699990000000,
        eventId: "e1",
        eventName: "GNDC",
        songId: "song-1",
        songDisplayName: "Sky High",
        songProcessedFilename: "alice_bob_classic_2026_v03.mp3",
        songDivision: "Classic",
        songSeasonYear: "2026",
        songRoutineName: "Sky High",
        songOwnerFirst: "Alice",
        songOwnerLast: "Smith",
        songPartnerFirst: "Bob",
        songPartnerLast: "Jones",
        pairUserFirst: "Alice",
        pairUserLast: "Smith",
        pairPartnerFirst: "Bob",
        pairPartnerLast: "Jones",
        entityPairId: "pair-1",
        entitySoloUserId: null,
        entityManagedPartnershipId: null,
        soloUserFirst: null,
        soloUserLast: null,
        completedByFirst: "Admin",
        completedByLast: "Person",
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<RunRow[]>>(res);
    expect(body.data).toHaveLength(1);
    const r = body.data[0];
    expect(r.id).toBe("run-1");
    expect(r.entity_label).toBe("Alice Smith & Bob Jones");
    expect(r.entity_key).toBe("pair:pair-1");
    expect(r.song_label).toBe("Alice Smith & Bob Jones Classic 2026 Sky High v03");
    expect(r.event_name).toBe("GNDC");
    expect(r.completed_by_label).toBe("Admin Person");
  });

  it("uses a single entity name for placeholder team partner song and pair labels", async () => {
    enqueueSelectResult([
      {
        id: "run-team",
        completedAt: 1700000000000,
        divisionName: "Teams",
        sessionId: "s1",
        sessionFloorTrialStartsAt: 1699990000000,
        eventId: "e1",
        eventName: "GNDC",
        songId: "song-team",
        songDisplayName: "Team Routine",
        songProcessedFilename: "teamalpha_teams_2026_teamroutine_v01.mp3",
        songDivision: "Teams",
        songSeasonYear: "2026",
        songRoutineName: "Team Routine",
        songOwnerFirst: "Alice",
        songOwnerLast: "Smith",
        songPartnerFirst: "Team Alpha",
        songPartnerLast: "",
        songPartnerKind: "team",
        songManagedLeaderFirst: null,
        songManagedLeaderLast: null,
        songManagedFollowerFirst: null,
        songManagedFollowerLast: null,
        pairUserFirst: "Alice",
        pairUserLast: "Smith",
        pairPartnerFirst: "Team Alpha",
        pairPartnerLast: "",
        pairPartnerKind: "team",
        entityPairId: "pair-team",
        entitySoloUserId: null,
        entityManagedPartnershipId: null,
        soloUserFirst: null,
        soloUserLast: null,
        managedLeaderFirst: null,
        managedLeaderLast: null,
        managedFollowerFirst: null,
        managedFollowerLast: null,
        completedByFirst: "Admin",
        completedByLast: "Person",
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<RunRow[]>>(res);
    expect(body.data[0].entity_label).toBe("Team Alpha");
    expect(body.data[0].song_label).toBe("Team Alpha Teams 2026 Team Routine v01");
    expect(body.data[0].entity_label).not.toContain("Alice Smith & Team Alpha");
    expect(body.data[0].song_label).not.toContain("Alice Smith & Team Alpha");
  });

  it("returns runs with a solo entity label when soloUser fields are populated", async () => {
    enqueueSelectResult([
      {
        id: "run-2",
        completedAt: 1700000000000,
        divisionName: "Teams",
        sessionId: "s1",
        sessionFloorTrialStartsAt: 1699990000000,
        eventId: null,
        eventName: null,
        songId: "song-2",
        songDisplayName: null,
        songProcessedFilename: null,
        songDivision: null,
        songSeasonYear: null,
        songRoutineName: null,
        songOwnerFirst: "Solo",
        songOwnerLast: "Dancer",
        songPartnerFirst: null,
        songPartnerLast: null,
        pairUserFirst: null,
        pairUserLast: null,
        pairPartnerFirst: null,
        pairPartnerLast: null,
        entityPairId: null,
        entitySoloUserId: "user-solo",
        entityManagedPartnershipId: null,
        soloUserFirst: "Solo",
        soloUserLast: "Dancer",
        managedLeaderFirst: null,
        managedLeaderLast: null,
        managedFollowerFirst: null,
        managedFollowerLast: null,
        songManagedLeaderFirst: null,
        songManagedLeaderLast: null,
        songManagedFollowerFirst: null,
        songManagedFollowerLast: null,
        completedByFirst: null,
        completedByLast: null,
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    const body = await readJson<SuccessEnvelope<RunRow[]>>(res);
    expect(body.data[0].entity_label).toBe("Solo Dancer");
    expect(body.data[0].entity_key).toBe("solo:user-solo");
    // No structured fields and no displayName/processedFilename → falls back
    // through to the partnership string (built from the song's owner name).
    expect(body.data[0].song_label).toBe("Solo Dancer");
    // Missing completed_by name falls back to "Admin".
    expect(body.data[0].completed_by_label).toBe("Admin");
  });

  it("renders entity_label '—' when neither pair nor solo fields are populated", async () => {
    enqueueSelectResult([
      {
        id: "run-3",
        completedAt: 1700000000000,
        divisionName: "Classic",
        sessionId: "s1",
        sessionFloorTrialStartsAt: 1699990000000,
        eventId: null,
        eventName: null,
        songId: "song-3",
        songDisplayName: "[Admin Test Placeholder]",
        songProcessedFilename: null,
        songDivision: null,
        songSeasonYear: null,
        songRoutineName: null,
        songOwnerFirst: null,
        songOwnerLast: null,
        songPartnerFirst: null,
        songPartnerLast: null,
        pairUserFirst: null,
        pairUserLast: null,
        pairPartnerFirst: null,
        pairPartnerLast: null,
        entityPairId: null,
        entitySoloUserId: null,
        entityManagedPartnershipId: null,
        soloUserFirst: null,
        soloUserLast: null,
        completedByFirst: "Admin",
        completedByLast: "Person",
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    const body = await readJson<SuccessEnvelope<RunRow[]>>(res);
    expect(body.data[0].entity_label).toBe("—");
    expect(body.data[0].entity_key).toBe("unknown");
    expect(body.data[0].song_label).toBe("[Admin Test Placeholder]");
  });

  it("uses the song managed partnership for song_label when the song is managed", async () => {
    enqueueSelectResult([
      {
        id: "run-managed",
        completedAt: 1700000000000,
        divisionName: "Classic",
        sessionId: "s1",
        sessionFloorTrialStartsAt: 1699990000000,
        eventId: "e1",
        eventName: "GNDC",
        songId: "song-managed",
        songDisplayName: "Sky High",
        songProcessedFilename: "wendal_lara_classic_2026_v03.mp3",
        songDivision: "Classic",
        songSeasonYear: "2026",
        songRoutineName: "Sky High",
        songOwnerFirst: "Manager",
        songOwnerLast: "User",
        songPartnerFirst: null,
        songPartnerLast: null,
        songManagedLeaderFirst: "Wendal",
        songManagedLeaderLast: "Smith",
        songManagedFollowerFirst: "Lara",
        songManagedFollowerLast: "Jones",
        pairUserFirst: null,
        pairUserLast: null,
        pairPartnerFirst: null,
        pairPartnerLast: null,
        soloUserFirst: null,
        soloUserLast: null,
        managedLeaderFirst: "Wendal",
        managedLeaderLast: "Smith",
        managedFollowerFirst: "Lara",
        managedFollowerLast: "Jones",
        entityPairId: null,
        entitySoloUserId: null,
        entityManagedPartnershipId: "mp-1",
        completedByFirst: "Admin",
        completedByLast: "Person",
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<RunRow[]>>(res);
    expect(body.data[0].entity_label).toBe("Wendal Smith & Lara Jones");
    expect(body.data[0].entity_key).toBe("managed:mp-1");
    expect(body.data[0].song_label).toMatch(/^Wendal Smith & Lara Jones /);
    expect(body.data[0].song_label).not.toMatch(/^Manager User/);
    expect(body.data[0].song_label).toBe("Wendal Smith & Lara Jones Classic 2026 Sky High v03");
  });

  it("accepts session_id and event_id query params without erroring", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${ENDPOINT}?session_id=s1`, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    enqueueSelectResult([]);
    const res2 = await app.request(`${ENDPOINT}?event_id=e1`, { headers: adminHeaders() });
    expect(res2.status).toBe(200);
  });
});

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

const ENDPOINT = "/v1/admin/songs";

type AdminSongRow = {
  id: string;
  song_label: string;
  display_name: string | null;
  division: string | null;
  routine_name: string | null;
  season_year: string | null;
  created_at: number;
  deleted_at: number | null;
  owner: { id: string; email: string; full_name: string | null };
  partner: {
    id: string;
    full_name: string | null;
    linked_user_email: string | null;
  } | null;
};

beforeEach(() => {
  resetSelectQueue();
  vi.clearAllMocks();
});

describe("GET /v1/admin/songs", () => {
  it("returns 401 without auth", async () => {
    const res = await app.request(ENDPOINT);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin users", async () => {
    const res = await app.request(ENDPOINT, { headers: authHeaders() });
    expect(res.status).toBe(403);
  });

  it("returns an empty list envelope when there are no songs", async () => {
    enqueueSelectResult([]);
    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<AdminSongRow[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toEqual([]);
  });

  it("flattens both owners with structured label when partner is present", async () => {
    enqueueSelectResult([
      {
        id: "song_1",
        displayName: "Sky High",
        processedFilename: "alice_bob_classic_2026_v03.mp3",
        division: "Classic",
        routineName: "Sky High",
        seasonYear: "2026",
        createdAt: 1_700_000_000_000,
        deletedAt: null,
        ownerId: "u_alice",
        ownerEmail: "alice@example.com",
        ownerFirst: "Alice",
        ownerLast: "Smith",
        partnerId: "p_bob",
        partnerFirst: "Bob",
        partnerLast: "Jones",
        partnerLinkedUserEmail: "bob@example.com",
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<AdminSongRow[]>>(res);
    expect(body.data).toHaveLength(1);
    const r = body.data[0]!;
    expect(r.id).toBe("song_1");
    // The structured label uses the partnership "Owner & Partner" prefix
    // and the season year + routine name + version-from-filename suffix.
    expect(r.song_label).toBe("Alice Smith & Bob Jones Classic 2026 Sky High v03");
    expect(r.owner).toEqual({
      id: "u_alice",
      email: "alice@example.com",
      full_name: "Alice Smith",
    });
    expect(r.partner).toEqual({
      id: "p_bob",
      full_name: "Bob Jones",
      linked_user_email: "bob@example.com",
    });
  });

  it("returns null partner when the song has no partner attached (solo)", async () => {
    enqueueSelectResult([
      {
        id: "song_2",
        displayName: null,
        processedFilename: null,
        division: null,
        routineName: null,
        seasonYear: null,
        createdAt: 1_710_000_000_000,
        deletedAt: null,
        ownerId: "u_solo",
        ownerEmail: "solo@example.com",
        ownerFirst: "Solo",
        ownerLast: "Dancer",
        partnerId: null,
        partnerFirst: null,
        partnerLast: null,
        partnerLinkedUserEmail: null,
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    const body = await readJson<SuccessEnvelope<AdminSongRow[]>>(res);
    const r = body.data[0]!;
    expect(r.partner).toBeNull();
    // No structured fields, no display_name, no processed_filename → falls
    // back to the partnership string (just the owner's name).
    expect(r.song_label).toBe("Solo Dancer");
  });

  it("returns null linked_user_email when partner exists but isn't linked to a user", async () => {
    enqueueSelectResult([
      {
        id: "song_3",
        displayName: "Unclaimed Partner",
        processedFilename: null,
        division: "Showcase",
        routineName: "Unclaimed Partner",
        seasonYear: "2026",
        createdAt: 1_720_000_000_000,
        deletedAt: null,
        ownerId: "u_alice",
        ownerEmail: "alice@example.com",
        ownerFirst: "Alice",
        ownerLast: "Smith",
        partnerId: "p_carol",
        partnerFirst: "Carol",
        partnerLast: "White",
        partnerLinkedUserEmail: null, // partner record exists but is not claimed
      },
    ]);

    const res = await app.request(ENDPOINT, { headers: adminHeaders() });
    const body = await readJson<SuccessEnvelope<AdminSongRow[]>>(res);
    expect(body.data[0]!.partner).toEqual({
      id: "p_carol",
      full_name: "Carol White",
      linked_user_email: null,
    });
  });

  it("accepts q + include_deleted query params without erroring", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${ENDPOINT}?q=alice&include_deleted=true`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(200);
  });

  it("rejects an invalid include_deleted value with 400", async () => {
    const res = await app.request(`${ENDPOINT}?include_deleted=yes`, {
      headers: adminHeaders(),
    });
    expect(res.status).toBe(400);
  });

  it("surfaces deleted_at for soft-deleted rows", async () => {
    enqueueSelectResult([
      {
        id: "song_deleted",
        displayName: "Old upload",
        processedFilename: null,
        division: null,
        routineName: null,
        seasonYear: null,
        createdAt: 1_690_000_000_000,
        deletedAt: 1_695_000_000_000,
        ownerId: "u_alice",
        ownerEmail: "alice@example.com",
        ownerFirst: "Alice",
        ownerLast: "Smith",
        partnerId: null,
        partnerFirst: null,
        partnerLast: null,
        partnerLinkedUserEmail: null,
      },
    ]);

    const res = await app.request(`${ENDPOINT}?include_deleted=true`, {
      headers: adminHeaders(),
    });
    const body = await readJson<SuccessEnvelope<AdminSongRow[]>>(res);
    expect(body.data[0]!.deleted_at).toBe(1_695_000_000_000);
  });
});

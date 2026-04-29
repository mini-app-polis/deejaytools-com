/**
 * Contract tests — GET /v1/songs and GET /v1/songs/:id
 *
 * The songs list returns joined rows (song + partner names); GET /:id does the
 * same join for a single row.  Both validate against ApiSong.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiSongSchema } from "@deejaytools/schemas";
import { app } from "../app.js";
import { authHeaders, readJson } from "../test/helpers.js";
import { enqueueSelectResult, resetSelectQueue } from "../test/mocks.js";

vi.mock("../db/index.js", async () => {
  const { mockDb: db } = await import("../test/mocks.js");
  return { db };
});
vi.mock("../middleware/auth.js", async () => {
  const { mockRequireAuth, mockRequireAdmin } = await import("../test/mocks.js");
  return { requireAuth: mockRequireAuth(), requireAdmin: mockRequireAdmin() };
});

const BASE = "/v1/songs";

/** Base song table row (camelCase). */
const dbSongRow = {
  id: "song-1",
  userId: "user_test123",
  partnerId: null as string | null,
  displayName: "My Routine – Classic 2026",
  originalFilename: "my_routine.mp3",
  processedFilename: "processed_my_routine.mp3",
  driveFileId: "drive-file-1",
  driveFolderId: "drive-folder-1",
  division: "Classic",
  routineName: "My Routine",
  personalDescriptor: null as string | null,
  seasonYear: "2026",
  createdAt: 1_000_000,
  updatedAt: 2_000_000,
  deletedAt: null as number | null,
};

/**
 * The songs list handler selects a joined row: { song: SongRow, partner_first_name, partner_last_name }.
 * The join result is what gets enqueued.
 */
const dbJoinRow = {
  song: dbSongRow,
  partner_first_name: null as string | null,
  partner_last_name: null as string | null,
};

const dbJoinRowWithPartner = {
  song: { ...dbSongRow, partnerId: "partner-1" },
  partner_first_name: "Bob",
  partner_last_name: "Jones",
};

beforeEach(resetSelectQueue);

describe("GET /v1/songs — contract", () => {
  it("body.data is an array of ApiSong (solo song)", async () => {
    enqueueSelectResult([dbJoinRow]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiSongSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("schema satisfied when partner names are populated", async () => {
    enqueueSelectResult([dbJoinRowWithPartner]);
    const res = await app.request(BASE, { headers: authHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    const result = z.array(ApiSongSchema).safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });

  it("all nullable song fields (no filename, no drive, no metadata) pass schema", async () => {
    const minimalJoin = {
      song: {
        ...dbSongRow,
        displayName: null,
        originalFilename: null,
        processedFilename: null,
        driveFileId: null,
        driveFolderId: null,
        division: null,
        routineName: null,
        personalDescriptor: null,
        seasonYear: null,
      },
      partner_first_name: null,
      partner_last_name: null,
    };
    enqueueSelectResult([minimalJoin]);
    const res = await app.request(BASE, { headers: authHeaders() });
    const { data } = await readJson<{ data: unknown }>(res);
    expect(z.array(ApiSongSchema).safeParse(data).success).toBe(true);
  });
});

describe("GET /v1/songs/:id — contract", () => {
  it("body.data matches ApiSong", async () => {
    // GET /:id does a single left-join query (song + partner in one select).
    enqueueSelectResult([dbJoinRow]);
    const res = await app.request(`${BASE}/song-1`, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const { data } = await readJson<{ data: unknown }>(res);
    const result = ApiSongSchema.safeParse(data);
    expect(result.success, result.error?.message).toBe(true);
  });
});

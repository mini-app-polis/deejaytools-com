import { beforeEach, describe, expect, it, vi } from "vitest";
import * as drive from "../services/drive.js";
import * as fsPromises from "node:fs/promises";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessListEnvelope,
  assertSuccessEnvelope,
  assertValidation400,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue } from "../test/mocks.js";

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

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
vi.mock("../services/drive.js", () => ({
  uploadSongToDrive: vi.fn().mockResolvedValue({
    fileId: "drive_file_1",
    folderId: "drive_folder_1",
  }),
  softDeleteOnDrive: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/tagger.js", () => ({
  tagSongBytes: vi
    .fn()
    .mockImplementation(({ bytes }: { bytes: Buffer }) => Promise.resolve(bytes)),
}));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockImplementation(() => Promise.resolve(Buffer.from("audio"))),
  rm: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({ mtimeMs: 0 }),
}));

// Typed handles for the fs mocks so we can reconfigure per test without `as any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFs = fsPromises as unknown as Record<string, ReturnType<typeof vi.fn>>;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE = "/v1/songs";
const CHUNK_BASE = `${BASE}/upload/chunk`;
const VALID_UPLOAD_ID = "00000000-0000-0000-0000-000000000001";

const mockUserRow = {
  id: "user_test123",
  firstName: "Kaiano",
  lastName: "Levine",
  displayName: "Kaiano Levine",
  email: "test@example.com",
  role: "user" as const,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

function makeFinalSongRow(overrides: Record<string, unknown> = {}) {
  return {
    song: {
      id: "song_new",
      userId: "user_test123",
      partnerId: null as string | null,
      displayName: "My Routine",
      originalFilename: "track.mp3",
      processedFilename: "kaianolevine_classic_2026_myroutine_v01.mp3",
      division: "Classic",
      routineName: "My Routine",
      personalDescriptor: null as string | null,
      seasonYear: "2026",
      driveFileId: "drive_file_1",
      driveFolderId: "drive_folder_1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...overrides,
    },
    partner_first_name: null as string | null,
    partner_last_name: null as string | null,
  };
}

/** Enqueue the 4 DB results needed for a single-chunk upload with no partner. */
function enqueueHappyPath(existingFilenames: (string | null)[] = []) {
  const finalRow = makeFinalSongRow();
  enqueueSelectResult([finalRow.song]); // post-insert song select
  enqueueSelectResult([mockUserRow]); // user lookup
  enqueueSelectResult(existingFilenames.map((f) => ({ processedFilename: f }))); // existing rows for version
  enqueueSelectResult([finalRow]); // final select with partner join
}

/** Build a valid single-chunk FormData. Override any field via the map. */
function makeChunkForm(overrides: Record<string, string | Blob> = {}): FormData {
  const form = new FormData();
  form.set("upload_id", VALID_UPLOAD_ID);
  form.set("chunk_index", "0");
  form.set("total_chunks", "1");
  form.set("original_filename", "track.mp3");
  form.set("mime_type", "audio/mpeg");
  form.set("division", "Classic");
  form.set("partner_id", "");
  form.set("routine_name", "My Routine");
  form.set("personal_descriptor", "");
  form.set("chunk", new Blob(["audio data"], { type: "audio/mpeg" }), "track.mp3");
  for (const [k, v] of Object.entries(overrides)) {
    if (v instanceof Blob) {
      form.set(k, v, "track.mp3");
    } else {
      form.set(k, v);
    }
  }
  return form;
}

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

// ---------------------------------------------------------------------------
// GET /v1/songs
// ---------------------------------------------------------------------------

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

  it("returns songs for the current user", async () => {
    enqueueSelectResult([songSelectRow({ id: "s1", partnerId: "p1" })]);
    const res = await app.request(BASE, { headers: authHeaders() });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<unknown[]>>(res);
    assertSuccessListEnvelope(body);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: "s1", partner_id: "p1", division: "open" });
  });
});

// ---------------------------------------------------------------------------
// POST /v1/songs (metadata-only create)
// ---------------------------------------------------------------------------

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
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("creates a song and returns 201 with envelope", async () => {
    const row = songSelectRow({ id: "s_new", partnerId: "p1" }).song;
    enqueueSelectResult([{ id: "p1" }]);
    enqueueSelectResult([row]);
    const res = await app.request(BASE, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ division: "open", partner_id: "p1" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "s_new", division: "open", partner_id: "p1" });
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/songs/:id
// ---------------------------------------------------------------------------

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

  it("calls softDeleteOnDrive when drive IDs are present", async () => {
    const songWithDrive = {
      ...songSelectRow({ id: "song1" }).song,
      driveFileId: "file1",
      driveFolderId: "folder1",
    };
    enqueueSelectResult([songWithDrive]);
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/song1`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
    expect(vi.mocked(drive.softDeleteOnDrive)).toHaveBeenCalledWith("file1");
  });
});

// ---------------------------------------------------------------------------
// POST /v1/songs/upload/chunk
// ---------------------------------------------------------------------------

describe("POST /v1/songs/upload/chunk", () => {
  beforeEach(() => {
    resetSelectQueue();
    vi.mocked(drive.uploadSongToDrive).mockClear();
    vi.mocked(drive.softDeleteOnDrive).mockClear();
    vi.mocked(mockDb.delete).mockClear();
    // Default: readdir returns a single chunk file (covers the happy path).
    // sweepStaleTmpDirs will also call readdir; stat returns epoch (old) so rm fires — that's fine.
    mockFs.readdir.mockResolvedValue(["chunk_000000"]);
    mockFs.readFile.mockImplementation(() => Promise.resolve(Buffer.from("audio")));
  });

  // --- auth & basic validation ---

  it("returns 401 without auth", async () => {
    const res = await app.request(CHUNK_BASE, { method: "POST", body: makeChunkForm() });
    expect(res.status).toBe(401);
  });

  it("returns 400 when division is empty", async () => {
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ division: "" }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/division/i);
  });

  it("returns 400 when upload_id is not a valid UUID", async () => {
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ upload_id: "not-a-uuid" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when chunk field is missing", async () => {
    const form = makeChunkForm();
    form.delete("chunk");
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/chunk/i);
  });

  it("returns 400 when chunk exceeds 10 MB", async () => {
    const bigChunk = new Blob([Buffer.alloc(10 * 1024 * 1024 + 1)], { type: "audio/mpeg" });
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ chunk: bigChunk }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/10 MB/);
  });

  it("returns 400 when total_chunks exceeds 30", async () => {
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ chunk_index: "0", total_chunks: "31" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 400 when chunk_index is out of range", async () => {
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ chunk_index: "5", total_chunks: "3" }),
    });
    expect(res.status).toBe(400);
  });

  // --- non-final chunk ---

  it("returns { complete: false } for a non-final chunk", async () => {
    const form = makeChunkForm({ chunk_index: "0", total_chunks: "2" });
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ complete: boolean }>>(res);
    expect(body.data.complete).toBe(false);
    expect(vi.mocked(drive.uploadSongToDrive)).not.toHaveBeenCalled();
  });

  // --- final chunk: happy path ---

  it("creates song record and uploads to Drive on final chunk", async () => {
    enqueueHappyPath();
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ complete: boolean; song: Record<string, unknown> }>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.complete).toBe(true);
    expect(body.data.song).toMatchObject({ division: "Classic" });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledOnce();
  });

  it("assigns the song to the authenticated user", async () => {
    vi.mocked(mockDb.insert).mockClear();
    enqueueHappyPath();
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(vi.mocked(mockDb.insert)).toHaveBeenCalledOnce();
  });

  // --- version numbering ---

  it("uses v01 when no prior uploads exist", async () => {
    enqueueHappyPath([]); // empty existingRows
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ filename: expect.stringContaining("_v01") })
    );
  });

  it("increments from max version in existing filenames (v03 → v04)", async () => {
    enqueueHappyPath(["leader_classic_2026_routine_v03.mp3"]);
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ filename: expect.stringContaining("_v04") })
    );
  });

  it("counts deleted versions correctly: only v03 remains but next is still v04", async () => {
    // v01 and v02 were uploaded then deleted; v03 is the only remaining song.
    // Count-based logic would produce v02 (count=1+1). Max-from-filename gives v04.
    enqueueHappyPath(["leader_classic_2026_routine_v03.mp3"]);
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ filename: expect.stringContaining("_v04") })
    );
  });

  it("zero-pads version to 2 digits (v08 → v09, not v9)", async () => {
    enqueueHappyPath(["stem_v08.mp3"]);
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ filename: expect.stringContaining("_v09") })
    );
  });

  it("ignores songs with null processedFilename when computing version", async () => {
    // A song record with no processed filename (e.g. a failed past upload that wasn't cleaned up)
    // should not count toward the version.
    enqueueHappyPath([null]);
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ filename: expect.stringContaining("_v01") })
    );
  });

  // --- partner validation ---

  it("returns 400 when partner_id is not owned by the user", async () => {
    enqueueSelectResult([]); // assertPartnerOwned → not found
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ partner_id: "p_other" }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/partner/i);
  });

  // --- atomic guarantee ---

  it("deletes the song record and returns 500 when Drive upload fails", async () => {
    vi.mocked(drive.uploadSongToDrive).mockRejectedValueOnce(new Error("Drive unavailable"));
    const finalRow = makeFinalSongRow();
    enqueueSelectResult([finalRow.song]); // post-insert song
    enqueueSelectResult([mockUserRow]);   // user lookup
    enqueueSelectResult([]);              // existingRows
    // No final select — Drive throws before we get there

    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    expect(res.status).toBe(500);
    // The song record must be deleted so it doesn't appear in the user's list.
    expect(vi.mocked(mockDb.delete)).toHaveBeenCalled();
  });

  it("does not create a song record when partner validation fails", async () => {
    vi.mocked(mockDb.insert).mockClear();
    enqueueSelectResult([]); // assertPartnerOwned → not found → returns 400 before insert

    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ partner_id: "p_bad" }),
    });
    expect(vi.mocked(mockDb.insert)).not.toHaveBeenCalled();
  });

  // --- chunk assembly ---

  it("returns 409 when the final chunk arrives but earlier chunks are missing", async () => {
    // Send chunk 1 of 2 — chunk 0 was never sent so only 1 file exists.
    mockFs.readdir.mockResolvedValue(["chunk_000001"]);
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ chunk_index: "1", total_chunks: "2" }),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("CHUNK_MISSING");
  });

  it("multi-chunk: intermediate chunk returns complete=false, final chunk completes upload", async () => {
    // Chunk 0
    const res0 = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ chunk_index: "0", total_chunks: "2" }),
    });
    expect(res0.status).toBe(200);
    const body0 = await readJson<SuccessEnvelope<{ complete: boolean }>>(res0);
    expect(body0.data.complete).toBe(false);
    expect(vi.mocked(drive.uploadSongToDrive)).not.toHaveBeenCalled();

    // Chunk 1 (final) — both chunk files now present
    mockFs.readdir.mockResolvedValue(["chunk_000000", "chunk_000001"]);
    mockFs.readFile.mockImplementation(() => Promise.resolve(Buffer.from("audio")));
    enqueueHappyPath();

    const res1 = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ chunk_index: "1", total_chunks: "2" }),
    });
    expect(res1.status).toBe(200);
    const body1 = await readJson<SuccessEnvelope<{ complete: boolean; song: unknown }>>(res1);
    expect(body1.data.complete).toBe(true);
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// POST /v1/songs/claim-legacy
//
// "Claim" copies a legacy_songs row into a real songs row owned by the user,
// preserving division/routineName/descriptor and coalescing routine ← version
// when the legacy row's routine name is empty.
// ---------------------------------------------------------------------------

describe("POST /v1/songs/claim-legacy", () => {
  const ENDPOINT = `${BASE}/claim-legacy`;

  beforeEach(() => {
    resetSelectQueue();
    vi.clearAllMocks();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legacy_song_id: "L1" }),
    });
    expect(res.status).toBe(401);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when legacy_song_id is missing", async () => {
    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    assertValidation400(await readJson<ErrorEnvelope>(res));
  });

  it("returns 400 when partner_id is provided but not owned by the user", async () => {
    // First select: partner ownership check → empty (not owned).
    enqueueSelectResult([]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        legacy_song_id: "L1",
        partner_id: "stranger-partner",
      }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/Partner/i);
  });

  it("returns 404 when the legacy song id is unknown", async () => {
    // Skipping partner_id (no partner ownership check needed).
    // Legacy lookup → empty.
    enqueueSelectResult([]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ legacy_song_id: "missing-legacy-id" }),
    });
    expect(res.status).toBe(404);
  });

  it("creates a song from a legacy entry that has a routine name", async () => {
    // 1. Legacy lookup → returns the row.
    enqueueSelectResult([
      {
        id: "L1",
        partnership: "Alice & Bob",
        division: "Classic",
        routineName: "Sky High",
        descriptor: null,
        version: "The Open 2025",
        submittedAt: "2025-01-01",
        createdAt: 1,
      },
    ]);
    // 2. Final select after insert — processedFilename mirrors what the handler computed.
    enqueueSelectResult([
      {
        song: {
          id: "song-new",
          userId: "user_test123",
          partnerId: null,
          displayName: "Sky High",
          originalFilename: null,
          processedFilename: "[Legacy] Alice & Bob · Classic · The Open 2025",
          driveFileId: null,
          driveFolderId: null,
          division: "Classic",
          routineName: "Sky High",
          personalDescriptor: null,
          seasonYear: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ legacy_song_id: "L1" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.routine_name).toBe("Sky High");
    expect(body.data.division).toBe("Classic");
    expect(body.data.processed_filename).toBe("[Legacy] Alice & Bob · Classic · The Open 2025");
    // No audio uploaded yet — Drive ids stay null.
    expect(body.data.drive_file_id).toBeNull();
  });

  it("coalesces routine_name to legacy.version when the legacy row has no routine name", async () => {
    // 1. Legacy lookup → routine empty, version = "The Open 2025".
    enqueueSelectResult([
      {
        id: "L2",
        partnership: "Carol & Dave",
        division: "Rising Star Classic",
        routineName: null,
        descriptor: null,
        version: "The Open 2025",
        submittedAt: null,
        createdAt: 1,
      },
    ]);
    // 2. Final select after insert — processedFilename mirrors what the handler computed.
    enqueueSelectResult([
      {
        song: {
          id: "song-new-2",
          userId: "user_test123",
          partnerId: null,
          displayName: "The Open 2025",
          originalFilename: null,
          processedFilename: "[Legacy] Carol & Dave · Rising Star Classic · The Open 2025",
          driveFileId: null,
          driveFolderId: null,
          division: "Rising Star Classic",
          routineName: "The Open 2025",
          personalDescriptor: null,
          seasonYear: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ legacy_song_id: "L2" }),
    });
    expect(res.status).toBe(201);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    // The coalesce: stored routine_name should be the legacy version string.
    expect(body.data.routine_name).toBe("The Open 2025");
    expect(body.data.division).toBe("Rising Star Classic");
    expect(body.data.processed_filename).toBe("[Legacy] Carol & Dave · Rising Star Classic · The Open 2025");
  });

  it("inserts with processedFilename built from partnership · division · version", async () => {
    // version = null → only partnership + division in the filename.
    enqueueSelectResult([
      {
        id: "L3",
        partnership: "Eve & Frank",
        division: "Masters",
        routineName: "Routine",
        descriptor: null,
        version: null,
        submittedAt: null,
        createdAt: 1,
      },
    ]);
    enqueueSelectResult([
      {
        song: {
          id: "song-new-3",
          userId: "user_test123",
          partnerId: null,
          displayName: "Routine",
          originalFilename: null,
          processedFilename: "[Legacy] Eve & Frank · Masters",
          driveFileId: null,
          driveFolderId: null,
          division: "Masters",
          routineName: "Routine",
          personalDescriptor: null,
          seasonYear: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ legacy_song_id: "L3" }),
    });
    expect(res.status).toBe(201);

    // Verify the INSERT was called with the correct processedFilename.
    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    const valuesMock = insertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ processedFilename: "[Legacy] Eve & Frank · Masters" })
    );

    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    expect(body.data.processed_filename).toBe("[Legacy] Eve & Frank · Masters");
  });

  it("inserts with all three segments when partnership, division, and version are all present", async () => {
    enqueueSelectResult([
      {
        id: "L4",
        partnership: "Grace & Hank",
        division: "Showcase",
        routineName: null,
        descriptor: null,
        version: "The Open 2025",
        submittedAt: null,
        createdAt: 1,
      },
    ]);
    enqueueSelectResult([
      {
        song: {
          id: "song-new-4",
          userId: "user_test123",
          partnerId: null,
          displayName: "The Open 2025",
          originalFilename: null,
          processedFilename: "[Legacy] Grace & Hank · Showcase · The Open 2025",
          driveFileId: null,
          driveFolderId: null,
          division: "Showcase",
          routineName: "The Open 2025",
          personalDescriptor: null,
          seasonYear: null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);

    const res = await app.request(ENDPOINT, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ legacy_song_id: "L4" }),
    });
    expect(res.status).toBe(201);

    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    const valuesMock = insertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        processedFilename: "[Legacy] Grace & Hank · Showcase · The Open 2025",
      })
    );

    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    expect(body.data.processed_filename).toBe("[Legacy] Grace & Hank · Showcase · The Open 2025");
  });
});

// ---------------------------------------------------------------------------
// PATCH /v1/songs/:id — authorization
// ---------------------------------------------------------------------------

describe("PATCH /v1/songs/:id — authorization", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when the song belongs to a different user", async () => {
    const differentUserSong = songSelectRow({
      id: "s_other_user",
      userId: "user_different",
    }).song;
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s_other_user`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Updated" }),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 200 when the song belongs to the current user", async () => {
    const ownedSong = songSelectRow({ id: "s_owned" }).song;
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([
      {
        song: { ...ownedSong, displayName: "Updated Name" },
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);
    const res = await app.request(`${BASE}/s_owned`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: "Updated Name" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data).toMatchObject({ id: "s_owned", display_name: "Updated Name" });
  });

  it("returns 400 when partner_id is provided but belongs to a different user", async () => {
    const ownedSong = songSelectRow({ id: "s_owned" }).song;
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([]); // assertPartnerOwned → empty (not owned)
    const res = await app.request(`${BASE}/s_owned`, {
      method: "PATCH",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ partner_id: "p_other" }),
    });
    expect(res.status).toBe(400);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.message).toMatch(/Partner/i);
  });
});

// ---------------------------------------------------------------------------
// DELETE /v1/songs/:id — authorization
// ---------------------------------------------------------------------------

describe("DELETE /v1/songs/:id — authorization", () => {
  beforeEach(() => {
    resetSelectQueue();
  });

  it("returns 404 when song belongs to a different user", async () => {
    enqueueSelectResult([]);
    const res = await app.request(`${BASE}/s_other_user`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
  });

  it("returns 409 when song is in an active queue entry in a live session", async () => {
    const ownedSong = songSelectRow({ id: "s_owned" }).song;
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([{ id: "chk_active" }]); // live session — checkin found
    const res = await app.request(`${BASE}/s_owned`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(409);
    const body = await readJson<ErrorEnvelope>(res);
    expect(body.error.code).toBe("SONG_IN_ACTIVE_CHECKIN");
  });

  it("returns 204 when song was used in a completed session (not blocked)", async () => {
    // Session is completed/cancelled — the guard's notInArray filter excludes it,
    // so the join returns no rows and the soft-delete proceeds.
    const ownedSong = songSelectRow({ id: "s_owned" }).song;
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([]); // completed session filtered out — no active hit
    const res = await app.request(`${BASE}/s_owned`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });

  it("returns 204 on successful soft-delete (no checkin history)", async () => {
    const ownedSong = songSelectRow({ id: "s_owned" }).song;
    enqueueSelectResult([ownedSong]);
    enqueueSelectResult([]); // no active checkin
    const res = await app.request(`${BASE}/s_owned`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    expect(res.status).toBe(204);
  });
});

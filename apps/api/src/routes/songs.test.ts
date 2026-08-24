import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/node";
import * as drive from "../services/drive.js";
import * as tagger from "../services/tagger.js";
import * as fsPromises from "node:fs/promises";
import { app } from "../app.js";
import {
  assertErrorEnvelope,
  assertSuccessListEnvelope,
  assertSuccessEnvelope,
  assertValidation400,
  adminHeaders,
  authHeaders,
  type ErrorEnvelope,
  readJson,
  type SuccessEnvelope,
} from "../test/helpers.js";
import { enqueueSelectResult, mockDb, resetSelectQueue, skipNextSelectResult } from "../test/mocks.js";

const { enqueueDriveJob } = vi.hoisted(() => ({
  enqueueDriveJob: vi.fn().mockResolvedValue(undefined),
}));

/** Minimal bytes that pass server-side detectAudioFormat (ID3v2 header). */
const MOCK_MP3_CHUNK_BYTES = Buffer.concat([Buffer.from("ID3"), Buffer.alloc(20)]);

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
  shareDriveFileWithUsers: vi.fn().mockResolvedValue({ shared: [], failed: [] }),
}));
vi.mock("@sentry/node", () => ({
  withScope: vi.fn((fn: (scope: unknown) => void) =>
    fn({ setLevel: vi.fn(), setTag: vi.fn(), setContext: vi.fn() })
  ),
  captureException: vi.fn(),
}));
vi.mock("../services/driveJobs.js", () => ({
  enqueueDriveJob,
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
  readFile: vi.fn().mockImplementation(() => Promise.resolve(MOCK_MP3_CHUNK_BYTES)),
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
      managedPartnershipId: null as string | null,
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

const mockPartnerRow = {
  id: "p1",
  userId: "user_test123",
  firstName: "Alex",
  lastName: "Partner",
  partnerRole: "leader" as const,
  kind: "partner",
  email: null as string | null,
  linkedUserId: null as string | null,
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/** Enqueue DB results for a single-chunk upload with a validated partner_id. */
function enqueuePartnerHappyPath(
  partnerId: string,
  partnerRow: typeof mockPartnerRow,
  existingFilenames: (string | null)[] = []
) {
  enqueueSelectResult([{ id: partnerId }]); // assertPartnerOwned
  const finalRow = makeFinalSongRow({ partnerId });
  enqueueSelectResult([{ ...finalRow.song, partnerId }]); // post-insert song select
  enqueueSelectResult([mockUserRow]); // user lookup
  enqueueSelectResult([partnerRow]); // partner lookup
  enqueueSelectResult(existingFilenames.map((f) => ({ processedFilename: f }))); // existing rows for version
  enqueueSelectResult([
    {
      ...finalRow,
      partner_first_name: partnerRow.firstName,
      partner_last_name: partnerRow.lastName,
    },
  ]); // final select with partner join
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

const leaderPartner = {
  ...mockPartnerRow,
  id: "p_leader",
  firstName: "Leader",
  lastName: "",
  partnerRole: "leader" as const,
};

const followerUser = {
  ...mockUserRow,
  firstName: "Follower",
  lastName: "",
};

function enqueuePartnerChunkUpload(
  partner: typeof mockPartnerRow,
  user: typeof mockUserRow,
  songOverrides: Record<string, unknown> = {},
  formOverrides: Record<string, string | Blob> = {}
) {
  mockFs.readdir.mockResolvedValue(["chunk_000000"]);
  const division = String(songOverrides.division ?? "Classic");
  const finalRow = makeFinalSongRow({ division, partnerId: partner.id, ...songOverrides });
  enqueueSelectResult([{ id: partner.id }]);
  enqueueSelectResult([{ ...finalRow.song, partnerId: partner.id }]);
  enqueueSelectResult([user]);
  enqueueSelectResult([partner]);
  enqueueSelectResult([]);
  enqueueSelectResult([
    {
      ...finalRow,
      partner_first_name: partner.firstName,
      partner_last_name: partner.lastName,
    },
  ]);
  return makeChunkForm({ division, partner_id: partner.id, ...formOverrides });
}

function enqueueSoloChunkUpload(
  songOverrides: Record<string, unknown> = {},
  formOverrides: Record<string, string | Blob> = {}
) {
  mockFs.readdir.mockResolvedValue(["chunk_000000"]);
  const finalRow = makeFinalSongRow(songOverrides);
  enqueueSelectResult([finalRow.song]);
  enqueueSelectResult([mockUserRow]);
  enqueueSelectResult([]);
  enqueueSelectResult([finalRow]);
  return makeChunkForm(formOverrides);
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
    enqueueDriveJob.mockClear();
    vi.mocked(Sentry.captureException).mockClear();
    vi.mocked(mockDb.select).mockImplementation(() => mockDb);
    vi.mocked(mockDb.delete).mockImplementation(() => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    vi.mocked(mockDb.transaction).mockImplementation((fn) => fn(mockDb));
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

  it("removes event song submissions and soft-deletes the song", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    vi.mocked(mockDb.delete).mockClear();
    vi.mocked(mockDb.update).mockClear();
    vi.mocked(mockDb.transaction).mockClear();

    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    expect(mockDb.delete).toHaveBeenCalledTimes(1);
    expect(mockDb.update).toHaveBeenCalledTimes(1);
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

  it("enqueues trash jobs for each submission with a Drive copy", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      { driveCopyFileId: "copy_1" },
      { driveCopyFileId: "copy_2" },
    ]);

    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(2);
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "copy_1",
    });
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "copy_2",
    });
  });

  it("does not enqueue trash jobs when drive_copy_file_id is null", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      { driveCopyFileId: "copy_1" },
      { driveCopyFileId: null },
    ]);

    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(enqueueDriveJob).toHaveBeenCalledWith(expect.anything(), {
      kind: "trash",
      fileId: "copy_1",
    });
  });

  it("does not enqueue trash jobs when the song has no submissions", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([]);

    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).not.toHaveBeenCalled();
  });

  it("returns 204 when enqueueDriveJob rejects", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ driveCopyFileId: "copy_1" }]);
    enqueueDriveJob.mockRejectedValueOnce(new Error("queue down"));

    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(enqueueDriveJob).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("selects copy ids before deleting submission rows", async () => {
    const existing = songSelectRow({ id: "s1" }).song;
    enqueueSelectResult([existing]);
    enqueueSelectResult([]);
    enqueueSelectResult([{ driveCopyFileId: "copy_1" }]);

    const txCallOrder: string[] = [];
    let inTx = false;
    vi.mocked(mockDb.transaction).mockImplementationOnce(async (fn) => {
      inTx = true;
      try {
        await fn(mockDb);
      } finally {
        inTx = false;
      }
    });
    vi.mocked(mockDb.select).mockImplementation(() => {
      if (inTx) txCallOrder.push("select");
      return mockDb;
    });
    vi.mocked(mockDb.delete).mockImplementation(() => {
      if (inTx) txCallOrder.push("delete");
      return { where: vi.fn().mockResolvedValue(undefined) };
    });

    const res = await app.request(`${BASE}/s1`, {
      method: "DELETE",
      headers: authHeaders(),
    });

    expect(res.status).toBe(204);
    expect(txCallOrder.indexOf("select")).toBeGreaterThanOrEqual(0);
    expect(txCallOrder.indexOf("delete")).toBeGreaterThan(txCallOrder.indexOf("select"));
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
    mockFs.readFile.mockImplementation(() => Promise.resolve(MOCK_MP3_CHUNK_BYTES));
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

  it("preserves division casing in processed filename (ProAm LeaderAm → ProAmLeaderAm)", async () => {
    const form = enqueuePartnerChunkUpload(
      { ...leaderPartner, id: "p1" },
      followerUser,
      { division: "ProAm LeaderAm" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^Leader_Follower_ProAmLeaderAm_/),
      })
    );
  });

  it("orders ProAm FollowerAm entities amateur-first (follower before leader)", async () => {
    const form = enqueuePartnerChunkUpload(
      leaderPartner,
      followerUser,
      { division: "ProAm FollowerAm" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^Follower_Leader_ProAmFollowerAm_/),
      })
    );
  });

  it("does not reorder ProAm LeaderAm (already amateur-first)", async () => {
    vi.mocked(drive.uploadSongToDrive).mockClear();
    const form = enqueuePartnerChunkUpload(
      leaderPartner,
      followerUser,
      { division: "ProAm LeaderAm" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^Leader_Follower_ProAmLeaderAm_/),
      })
    );
  });

  it("orders managed partnerships amateur-first in ProAm FollowerAm", async () => {
    mockFs.readdir.mockResolvedValue(["chunk_000000"]);
    const managedPartnershipRow = {
      id: "mp_1",
      userId: "user_test123",
      leaderFirstName: "Leader",
      leaderLastName: "",
      followerFirstName: "Follower",
      followerLastName: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const finalRow = makeFinalSongRow({
      division: "ProAm FollowerAm",
      managedPartnershipId: "mp_1",
    });
    enqueueSelectResult([{ id: "mp_1" }]);
    enqueueSelectResult([{ ...finalRow.song, managedPartnershipId: "mp_1" }]);
    enqueueSelectResult([mockUserRow]);
    enqueueSelectResult([managedPartnershipRow]);
    enqueueSelectResult([]);
    enqueueSelectResult([finalRow]);

    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({
        division: "ProAm FollowerAm",
        managed_partnership_id: "mp_1",
        partner_id: "",
      }),
    });

    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^Follower_Leader_ProAmFollowerAm_/),
      })
    );
  });

  it("does not reorder Classic partnerships", async () => {
    vi.mocked(drive.uploadSongToDrive).mockClear();
    const form = enqueuePartnerChunkUpload(leaderPartner, followerUser, { division: "Classic" });
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^Leader_Follower_Classic_/),
      })
    );
  });

  it("does not reorder a non-partner entity in ProAm FollowerAm", async () => {
    mockFs.readdir.mockResolvedValue(["chunk_000000"]);
    const teamPartner = { ...mockPartnerRow, id: "p_team", firstName: "Team", lastName: "Alpha", kind: "team" };
    const finalRow = makeFinalSongRow({ division: "ProAm FollowerAm", partnerId: "p_team" });
    enqueueSelectResult([{ id: "p_team" }]);
    enqueueSelectResult([{ ...finalRow.song, partnerId: "p_team" }]);
    enqueueSelectResult([mockUserRow]);
    enqueueSelectResult([teamPartner]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      {
        ...finalRow,
        partner_first_name: teamPartner.firstName,
        partner_last_name: teamPartner.lastName,
      },
    ]);

    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ division: "ProAm FollowerAm", partner_id: "p_team" }),
    });

    const uploadCall = vi.mocked(drive.uploadSongToDrive).mock.calls.at(-1);
    const filename = uploadCall?.[1]?.filename ?? "";
    expect(filename).toMatch(/^TeamAlpha_ProAmFollowerAm_/);
    expect(filename).not.toMatch(/__/);
  });

  it("sets the ID3 title to match entity order for ProAm divisions", async () => {
    vi.mocked(tagger.tagSongBytes).mockClear();

    resetSelectQueue();
    vi.mocked(drive.uploadSongToDrive).mockClear();
    let form = enqueuePartnerChunkUpload(
      leaderPartner,
      followerUser,
      { division: "ProAm FollowerAm" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(tagger.tagSongBytes)).toHaveBeenCalledWith(
      expect.objectContaining({ newTitle: "Follower & Leader" })
    );

    resetSelectQueue();
    vi.mocked(tagger.tagSongBytes).mockClear();
    form = enqueuePartnerChunkUpload(
      leaderPartner,
      followerUser,
      { division: "ProAm LeaderAm" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(tagger.tagSongBytes)).toHaveBeenCalledWith(
      expect.objectContaining({ newTitle: "Leader & Follower" })
    );
  });

  it("passes newArtist with pipe separators including routine name", async () => {
    vi.mocked(tagger.tagSongBytes).mockClear();
    const form = enqueueSoloChunkUpload();
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(tagger.tagSongBytes)).toHaveBeenCalledWith(
      expect.objectContaining({
        newArtist: "Classic | My Routine",
        newYear: "2026",
      })
    );
  });

  it("passes newArtist without a trailing separator when routine name is absent", async () => {
    vi.mocked(tagger.tagSongBytes).mockClear();
    const form = enqueueSoloChunkUpload(
      { routineName: null, personalDescriptor: null },
      { routine_name: "", personal_descriptor: "" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(tagger.tagSongBytes)).toHaveBeenCalledWith(
      expect.objectContaining({
        newArtist: "Classic",
        newYear: "2026",
      })
    );
  });

  it("omits optional routine and descriptor segments without stray underscores", async () => {
    const form = enqueueSoloChunkUpload(
      { routineName: null, personalDescriptor: null },
      { routine_name: "", personal_descriptor: "" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^KaianoLevine_Classic_2026_v01\.mp3$/),
      })
    );
  });

  it("includes routine name without descriptor when only routine is set", async () => {
    vi.mocked(drive.uploadSongToDrive).mockClear();
    const form = enqueueSoloChunkUpload(
      { routineName: "My Routine", personalDescriptor: null },
      { routine_name: "My Routine", personal_descriptor: "" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^KaianoLevine_Classic_2026_MyRoutine_v01\.mp3$/),
      })
    );
  });

  it("includes descriptor without routine name when only descriptor is set", async () => {
    vi.mocked(drive.uploadSongToDrive).mockClear();
    const form = enqueueSoloChunkUpload(
      { routineName: null, personalDescriptor: "Encore" },
      { routine_name: "", personal_descriptor: "Encore" }
    );
    await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^KaianoLevine_Classic_2026_Encore_v01\.mp3$/),
      })
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

  it("files an October upload under the following season year", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    try {
      enqueueHappyPath([]);
      vi.mocked(drive.uploadSongToDrive).mockClear();
      await app.request(CHUNK_BASE, {
        method: "POST",
        headers: authHeaders(),
        body: makeChunkForm(),
      });
      expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
        expect.any(Buffer),
        expect.objectContaining({ seasonYear: "2027" })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("assigns v01 independently per partner when division/routine/year match", async () => {
    type VersionRow = {
      partnerId: string;
      processedFilename: string;
    };

    const versionStore: VersionRow[] = [];
    let versionQueryActive = false;
    let versionWhereArg: unknown = null;

    const collectSqlLiterals = (node: unknown, out: string[] = [], seen = new Set<object>()): string[] => {
      if (typeof node === "string") {
        if (node === "p_a" || node === "p_b") out.push(node);
        return out;
      }
      if (!node || typeof node !== "object") return out;
      if (seen.has(node)) return out;
      seen.add(node);
      const n = node as { queryChunks?: unknown[] };
      if (Array.isArray(n.queryChunks)) {
        for (const chunk of n.queryChunks) collectSqlLiterals(chunk, out, seen);
      }
      return out;
    };

    const sqlHasPartnerScope = (node: unknown, seen = new Set<object>()): boolean => {
      if (!node || typeof node !== "object") return false;
      if (seen.has(node)) return false;
      seen.add(node);
      const n = node as { name?: string; queryChunks?: unknown[] };
      if (n.name === "partner_id") return true;
      if (Array.isArray(n.queryChunks)) return n.queryChunks.some((chunk) => sqlHasPartnerScope(chunk, seen));
      return false;
    };

    const origSelect = mockDb.select.getMockImplementation()!;
    const origWhere = mockDb.where.getMockImplementation()!;
    const origThen = mockDb.then.getMockImplementation()!;

    vi.mocked(mockDb.select).mockImplementation(function (this: typeof mockDb, arg?: unknown) {
      versionQueryActive =
        !!arg &&
        typeof arg === "object" &&
        "processedFilename" in (arg as Record<string, unknown>);
      return origSelect.call(this, arg);
    });

    vi.mocked(mockDb.where).mockImplementation(function (this: typeof mockDb, ...args: unknown[]) {
      if (versionQueryActive) versionWhereArg = args[0];
      return origWhere.apply(this, args);
    });

    vi.mocked(mockDb.then).mockImplementation(function (
      this: typeof mockDb,
      onfulfilled?: ((value: unknown[]) => unknown) | null,
      onrejected?: ((reason: unknown) => unknown) | null
    ) {
      if (versionQueryActive && versionWhereArg) {
        versionQueryActive = false;
        const hasPartnerScope = sqlHasPartnerScope(versionWhereArg);
        const partnerId = collectSqlLiterals(versionWhereArg)[0] ?? "";
        versionWhereArg = null;
        skipNextSelectResult();
        const rows = (hasPartnerScope
          ? versionStore.filter((row) => row.partnerId === partnerId)
          : versionStore
        ).map((row) => ({ processedFilename: row.processedFilename }));
        return Promise.resolve(rows).then(onfulfilled, onrejected);
      }
      return origThen.call(this, onfulfilled, onrejected);
    });

    mockFs.readdir.mockResolvedValue(["chunk_000000"]);

    const partnerA = { ...mockPartnerRow, id: "p_a", firstName: "Alice", lastName: "Alpha" };
    const partnerB = { ...mockPartnerRow, id: "p_b", firstName: "Bob", lastName: "Beta" };

    resetSelectQueue();
    vi.mocked(drive.uploadSongToDrive).mockClear();
    enqueuePartnerHappyPath("p_a", partnerA, []);
    const resA = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ partner_id: "p_a" }),
    });
    expect(resA.status).toBe(200);
    const uploadA = vi.mocked(drive.uploadSongToDrive).mock.calls.at(-1)?.[1] as { filename: string };
    expect(uploadA.filename).toMatch(/_v01\.mp3$/);
    versionStore.push({ partnerId: "p_a", processedFilename: uploadA.filename });

    resetSelectQueue();
    vi.mocked(drive.uploadSongToDrive).mockClear();
    enqueuePartnerHappyPath("p_b", partnerB, []);
    const resB = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ partner_id: "p_b" }),
    });
    expect(resB.status).toBe(200);
    const uploadB = vi.mocked(drive.uploadSongToDrive).mock.calls.at(-1)?.[1] as { filename: string };
    expect(uploadB.filename).toMatch(/_v01\.mp3$/);

    vi.mocked(mockDb.select).mockImplementation(origSelect);
    vi.mocked(mockDb.where).mockImplementation(origWhere);
    vi.mocked(mockDb.then).mockImplementation(origThen);
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

  it("returns 200 immediately and deletes the song record in the background when Drive upload fails", async () => {
    // The Drive upload now runs in the background after the HTTP response is
    // sent, so the client always receives 200 on the final chunk — even if the
    // upload later fails.  On failure the handler deletes the orphaned song row
    // so the user's library stays clean.
    let rejectDrive!: (e: Error) => void;
    vi.mocked(drive.uploadSongToDrive).mockReturnValueOnce(
      new Promise<never>((_, rej) => { rejectDrive = rej; })
    );
    const finalRow = makeFinalSongRow();
    enqueueSelectResult([finalRow.song]); // post-insert song
    enqueueSelectResult([mockUserRow]);   // user lookup (inside background job)
    enqueueSelectResult([]);              // existingRows (inside background job)

    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm(),
    });
    // Response arrives before Drive finishes — must be 200.
    expect(res.status).toBe(200);

    // Now simulate the Drive failure and wait for the microtask queue to drain
    // so the background .catch() handler has run.
    rejectDrive(new Error("Drive unavailable"));
    await new Promise((r) => setTimeout(r, 0));

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
    mockFs.readFile.mockImplementation(() => Promise.resolve(MOCK_MP3_CHUNK_BYTES));
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

  it("creates a song with managed_partnership_id when managed_partnership_id is set", async () => {
    vi.mocked(mockDb.insert).mockClear();
    const managedPartnershipRow = {
      id: "mp_1",
      userId: "user_test123",
      leaderFirstName: "Wendal",
      leaderLastName: "Smith",
      followerFirstName: "Lara",
      followerLastName: "Jones",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([{ id: "mp_1" }]);
    enqueueSelectResult([
      {
        id: "song_new",
        userId: "user_test123",
        partnerId: null,
        managedPartnershipId: "mp_1",
        displayName: "My Routine",
        originalFilename: "track.mp3",
        processedFilename: null,
        division: "Classic",
        routineName: "My Routine",
        personalDescriptor: null,
        seasonYear: null,
        driveFileId: null,
        driveFolderId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    enqueueSelectResult([mockUserRow]);
    enqueueSelectResult([managedPartnershipRow]);
    enqueueSelectResult([]);
    enqueueSelectResult([makeFinalSongRow({ managedPartnershipId: "mp_1" })]);

    mockFs.readdir.mockResolvedValue(["chunk_000000"]);

    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ managed_partnership_id: "mp_1", partner_id: "" }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ complete: boolean }>>(res);
    expect(body.data.complete).toBe(true);

    expect(vi.mocked(mockDb.insert)).toHaveBeenCalledOnce();
    const insertMock = mockDb.insert as ReturnType<typeof vi.fn>;
    const valuesMock = insertMock.mock.results[0].value.values as ReturnType<typeof vi.fn>;
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        managedPartnershipId: "mp_1",
        partnerId: null,
      })
    );

    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/WendalSmith_LaraJones_Classic_/),
      })
    );
  });

  it("returns 400 when managed_partnership_id is not owned", async () => {
    vi.mocked(mockDb.insert).mockClear();
    mockFs.readdir.mockResolvedValue(["chunk_000000"]);
    enqueueSelectResult([]);

    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ managed_partnership_id: "mp_bad", partner_id: "" }),
    });
    expect(res.status).toBe(400);
    assertErrorEnvelope(await readJson<ErrorEnvelope>(res));
    expect(vi.mocked(mockDb.insert)).not.toHaveBeenCalled();
  });

  it("returns 403 when a non-admin sends on_behalf_of_user_id", async () => {
    vi.mocked(mockDb.insert).mockClear();
    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({ on_behalf_of_user_id: "user_target456" }),
    });
    expect(res.status).toBe(403);
    expect(vi.mocked(mockDb.insert)).not.toHaveBeenCalled();
  });

  it("creates a song owned by the target user when admin sends on_behalf_of_user_id", async () => {
    vi.mocked(mockDb.insert).mockClear();
    const targetUserId = "user_target456";
    enqueueSelectResult([{ id: targetUserId }]);
    const finalRow = makeFinalSongRow({ userId: targetUserId });
    enqueueSelectResult([finalRow.song]);
    enqueueSelectResult([{ ...mockUserRow, id: targetUserId }]);
    enqueueSelectResult([]);
    enqueueSelectResult([finalRow]);

    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: adminHeaders(),
      body: makeChunkForm({ on_behalf_of_user_id: targetUserId }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ complete: boolean; song: Record<string, unknown> }>>(res);
    expect(body.data.complete).toBe(true);
    expect(body.data.song).toMatchObject({ user_id: targetUserId });

    const valuesFn = vi.mocked(mockDb.insert).mock.results[0]?.value?.values;
    expect(valuesFn).toHaveBeenCalledWith(expect.objectContaining({ userId: targetUserId }));
  });

  it("creates a kind:team placeholder partner and links the song on portal upload", async () => {
    vi.mocked(mockDb.insert).mockClear();
    mockFs.readdir.mockResolvedValue(["chunk_000000"]);
    const placeholderPartnerId = "11111111-1111-1111-1111-111111111111";
    vi.spyOn(crypto, "randomUUID").mockReturnValue(placeholderPartnerId);

    enqueueSelectResult([{ identifier: "Team Alpha" }]);
    enqueueSelectResult([]);

    const insertedSong = {
      id: "song_portal",
      userId: "user_test123",
      partnerId: placeholderPartnerId,
      managedPartnershipId: null,
      displayName: "Team Routine",
      originalFilename: "track.mp3",
      processedFilename: null,
      division: "Teams",
      routineName: "Team Routine",
      personalDescriptor: null,
      seasonYear: null,
      driveFileId: null,
      driveFolderId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([insertedSong]);
    enqueueSelectResult([mockUserRow]);
    enqueueSelectResult([
      {
        id: placeholderPartnerId,
        userId: "user_test123",
        firstName: "Team Alpha",
        lastName: "",
        partnerRole: "follower",
        kind: "team",
        email: null,
        linkedUserId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      {
        song: { ...insertedSong, processedFilename: "teamalpha_teams_2026_teamroutine_v01.mp3", seasonYear: "2026", driveFileId: "drive_file_1", driveFolderId: "drive_folder_1" },
        partner_first_name: "Team Alpha",
        partner_last_name: "",
      },
    ]);

    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({
        division: "Teams",
        partner_id: "",
        entity_type: "team",
        team_id: "team_1",
        routine_name: "Team Routine",
      }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ complete: boolean; song: Record<string, unknown> }>>(res);
    expect(body.data.complete).toBe(true);
    expect(body.data.song).toMatchObject({ division: "Teams", partner_id: placeholderPartnerId });

    expect(vi.mocked(mockDb.insert)).toHaveBeenCalledTimes(2);
    const valuesFn = vi.mocked(mockDb.insert).mock.results[0]?.value?.values as ReturnType<
      typeof vi.fn
    >;
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        firstName: "Team Alpha",
        lastName: "",
        partnerRole: "follower",
        kind: "team",
      })
    );
    const songInsert = vi.mocked(mockDb.insert).mock.results[1]?.value?.values as ReturnType<typeof vi.fn>;
    expect(songInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: placeholderPartnerId,
        managedPartnershipId: null,
        division: "Teams",
      })
    );

    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({
        filename: expect.stringMatching(/^TeamAlpha_/),
      })
    );

    vi.mocked(crypto.randomUUID).mockRestore();
  });

  it("reuses an existing placeholder partner for repeat portal uploads of the same entity", async () => {
    vi.mocked(mockDb.insert).mockClear();
    mockFs.readdir.mockResolvedValue(["chunk_000000"]);
    const existingPartnerId = "22222222-2222-2222-2222-222222222222";

    enqueueSelectResult([{ identifier: "Team Alpha" }]);
    enqueueSelectResult([{ id: existingPartnerId }]);

    const insertedSong = {
      id: "song_portal_2",
      userId: "user_test123",
      partnerId: existingPartnerId,
      managedPartnershipId: null,
      displayName: "Team Routine v2",
      originalFilename: "track.mp3",
      processedFilename: null,
      division: "Teams",
      routineName: "Team Routine v2",
      personalDescriptor: null,
      seasonYear: null,
      driveFileId: null,
      driveFolderId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([insertedSong]);
    enqueueSelectResult([mockUserRow]);
    enqueueSelectResult([
      {
        id: existingPartnerId,
        userId: "user_test123",
        firstName: "Team Alpha",
        lastName: "",
        partnerRole: "follower",
        kind: "team",
        email: null,
        linkedUserId: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    enqueueSelectResult([]);
    enqueueSelectResult([
      {
        song: { ...insertedSong, processedFilename: "teamalpha_teams_2026_teamroutinev2_v01.mp3", seasonYear: "2026", driveFileId: "drive_file_1", driveFolderId: "drive_folder_1" },
        partner_first_name: "Team Alpha",
        partner_last_name: "",
      },
    ]);

    const res = await app.request(CHUNK_BASE, {
      method: "POST",
      headers: authHeaders(),
      body: makeChunkForm({
        division: "Teams",
        partner_id: "",
        entity_type: "team",
        team_id: "team_1",
        routine_name: "Team Routine v2",
      }),
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<{ complete: boolean; song: Record<string, unknown> }>>(res);
    expect(body.data.song).toMatchObject({ partner_id: existingPartnerId });

    expect(vi.mocked(mockDb.insert)).toHaveBeenCalledTimes(1);
    const songInsert = vi.mocked(mockDb.insert).mock.results[0]?.value?.values as ReturnType<typeof vi.fn>;
    expect(songInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        partnerId: existingPartnerId,
      })
    );
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

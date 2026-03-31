import { beforeEach, describe, expect, it, vi } from "vitest";
import * as drive from "../services/drive.js";
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

  it("calls softDeleteOnDrive when drive IDs exist", async () => {
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
    expect(vi.mocked(drive.softDeleteOnDrive)).toHaveBeenCalledWith("file1", "folder1");
  });
});

describe("POST /v1/songs/:id/upload", () => {
  const mockSong = {
    id: "song1",
    userId: "user_test123",
    partnerId: null as string | null,
    division: "Classic",
    routineName: "TestRoutine",
    personalDescriptor: null as string | null,
    seasonYear: null as string | null,
    displayName: null as string | null,
    originalFilename: null as string | null,
    processedFilename: null as string | null,
    driveFileId: null as string | null,
    driveFolderId: null as string | null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const mockUser = {
    id: "user_test123",
    firstName: "Kaiano",
    lastName: "Levine",
    displayName: "Kaiano Levine",
    email: "test@example.com",
    role: "user" as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    resetSelectQueue();
    vi.mocked(drive.uploadSongToDrive).mockClear();
    vi.mocked(drive.softDeleteOnDrive).mockClear();
  });

  it("returns 401 without auth", async () => {
    const res = await app.request(`${BASE}/song1/upload`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when song not found", async () => {
    enqueueSelectResult([]);
    const form = new FormData();
    form.append("file", new Blob(["audio"], { type: "audio/mpeg" }), "test.mp3");
    const res = await app.request(`${BASE}/nonexistent/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(404);
  });

  it("returns 400 when no file provided", async () => {
    enqueueSelectResult([mockSong]);
    enqueueSelectResult([mockUser]);
    const form = new FormData();
    const res = await app.request(`${BASE}/song1/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("uploads file and returns 200 with processed filename", async () => {
    const updatedSong = {
      ...mockSong,
      processedFilename: "kaianolevine_classic_2026_testroutine_v1.mp3",
      driveFileId: "drive_file_1",
      driveFolderId: "drive_folder_1",
      originalFilename: "test.mp3",
    };
    enqueueSelectResult([mockSong]);
    enqueueSelectResult([mockUser]);
    enqueueSelectResult([{ c: 0 }]);
    enqueueSelectResult([
      {
        song: updatedSong,
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);
    const form = new FormData();
    form.append("file", new Blob(["audio data"], { type: "audio/mpeg" }), "test.mp3");
    const res = await app.request(`${BASE}/song1/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    assertSuccessEnvelope(body);
    expect(body.data.processed_filename).toBeTruthy();
    expect(vi.mocked(drive.uploadSongToDrive)).toHaveBeenCalled();
  });

  it("auto-increments version number for same division+routine+year", async () => {
    enqueueSelectResult([mockSong]);
    enqueueSelectResult([mockUser]);
    enqueueSelectResult([{ c: 2 }]);
    enqueueSelectResult([
      {
        song: { ...mockSong, processedFilename: "stem_v3.mp3" },
        partner_first_name: null,
        partner_last_name: null,
      },
    ]);
    const form = new FormData();
    form.append("file", new Blob(["audio"], { type: "audio/mpeg" }), "test.mp3");
    const res = await app.request(`${BASE}/song1/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    expect(String(body.data.processed_filename)).toContain("_v3");
  });

  it("orders filename as leader_follower when partner has follower role", async () => {
    const songWithPartner = { ...mockSong, partnerId: "partner1" };
    const partnerRow = {
      id: "partner1",
      userId: "user_test123",
      firstName: "Jane",
      lastName: "Doe",
      partnerRole: "follower" as const,
      email: null as string | null,
      linkedUserId: null as string | null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    enqueueSelectResult([songWithPartner]);
    enqueueSelectResult([mockUser]);
    enqueueSelectResult([partnerRow]);
    enqueueSelectResult([{ c: 0 }]);
    enqueueSelectResult([
      {
        song: {
          ...songWithPartner,
          processedFilename: "kaianolevine_janedoe_classic_2026_testroutine_v1.mp3",
        },
        partner_first_name: "Jane",
        partner_last_name: "Doe",
      },
    ]);
    const form = new FormData();
    form.append("file", new Blob(["audio"], { type: "audio/mpeg" }), "test.mp3");
    const res = await app.request(`${BASE}/song1/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    expect(res.status).toBe(200);
    const body = await readJson<SuccessEnvelope<Record<string, unknown>>>(res);
    expect(String(body.data.processed_filename).toLowerCase()).toContain("kaianolevine");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockFilesCreate = vi.fn();
  const mockFilesList = vi.fn();
  const mockFilesGet = vi.fn();
  const mockFilesUpdate = vi.fn();
  const mockFilesCopy = vi.fn();
  const driveApi = {
    files: {
      create: mockFilesCreate,
      list: mockFilesList,
      get: mockFilesGet,
      update: mockFilesUpdate,
      copy: mockFilesCopy,
    },
  };
  const mockGoogleDrive = vi.fn(() => driveApi);
  return {
    mockFilesCreate,
    mockFilesList,
    mockFilesGet,
    mockFilesUpdate,
    mockFilesCopy,
    mockGoogleDrive,
    driveApi,
  };
});

// Mock google-auth-library
vi.mock("google-auth-library", () => ({
  JWT: vi.fn().mockImplementation(() => ({ type: "jwt" })),
}));

// Mock googleapis
vi.mock("googleapis", () => ({
  google: {
    drive: mocks.mockGoogleDrive,
  },
}));

import { JWT } from "google-auth-library";
import {
  clearDriveFolderCache,
  copySongToEventFolder,
  renameDriveFile,
  softDeleteOnDrive,
  uploadSongToDrive,
} from "./drive.js";

const TEST_ENV = {
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@project.iam.gserviceaccount.com",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:
    "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----",
  GOOGLE_DRIVE_PARENT_FOLDER_ID: "parent_folder_123",
};

const DEFAULT_UPLOAD_OPTIONS = {
  filename: "test_v01.mp3",
  mimeType: "audio/mpeg",
  seasonYear: "2026",
  division: "Advanced",
};

function resetDriveTestState() {
  clearDriveFolderCache();
  vi.resetAllMocks();
  mocks.mockGoogleDrive.mockImplementation(() => mocks.driveApi);
  vi.mocked(JWT).mockImplementation(
    () => ({ type: "jwt" }) as unknown as InstanceType<typeof JWT>
  );
  Object.assign(process.env, TEST_ENV);
}

// Helper: set up list mocks so both year and division folders already exist.
function mockFoldersExist(yearFolderId = "year_folder_2026", divisionFolderId = "div_folder_adv") {
  mocks.mockFilesList
    .mockResolvedValueOnce({ data: { files: [{ id: yearFolderId }] } })   // year lookup
    .mockResolvedValueOnce({ data: { files: [{ id: divisionFolderId }] } }); // division lookup
  return { yearFolderId, divisionFolderId };
}

describe("uploadSongToDrive", () => {
  beforeEach(() => {
    resetDriveTestState();
  });

  const { mockFilesCreate, mockFilesList } = mocks;

  it("throws when env vars are missing", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    await expect(
      uploadSongToDrive(Buffer.from("test"), DEFAULT_UPLOAD_OPTIONS)
    ).rejects.toThrow("Google Drive environment variables are not configured");
  });

  it("uploads file into <root>/<year>/<division>/ when both folders exist", async () => {
    const { divisionFolderId } = mockFoldersExist();
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "file_abc123" } });

    await uploadSongToDrive(Buffer.from("audio data"), DEFAULT_UPLOAD_OPTIONS);

    // File create call should target the division folder, not root
    expect(mockFilesCreate).toHaveBeenCalledOnce();
    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: DEFAULT_UPLOAD_OPTIONS.filename,
          parents: [divisionFolderId],
        }),
        media: expect.objectContaining({ mimeType: DEFAULT_UPLOAD_OPTIONS.mimeType }),
        supportsAllDrives: true,
      })
    );
  });

  it("creates year and division folders when neither exists", async () => {
    // Both list calls return empty — folders need to be created
    mockFilesList
      .mockResolvedValueOnce({ data: { files: [] } }) // year lookup → not found
      .mockResolvedValueOnce({ data: { files: [] } }); // division lookup → not found
    // create year folder, create division folder, create file
    mockFilesCreate
      .mockResolvedValueOnce({ data: { id: "new_year_folder" } })
      .mockResolvedValueOnce({ data: { id: "new_div_folder" } })
      .mockResolvedValueOnce({ data: { id: "file_abc123" } });

    await uploadSongToDrive(Buffer.from("audio"), DEFAULT_UPLOAD_OPTIONS);

    expect(mockFilesCreate).toHaveBeenCalledTimes(3);

    // First create: year folder under root
    expect(mockFilesCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "2026",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["parent_folder_123"],
        }),
      })
    );

    // Second create: division folder under year
    expect(mockFilesCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "Advanced",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["new_year_folder"],
        }),
      })
    );

    // Third create: file under division folder
    expect(mockFilesCreate).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: DEFAULT_UPLOAD_OPTIONS.filename,
          parents: ["new_div_folder"],
        }),
      })
    );
  });

  it("returns fileId and the division folderId", async () => {
    const { divisionFolderId } = mockFoldersExist("yr_folder", "div_folder_xyz");
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "file_abc123" } });

    const result = await uploadSongToDrive(Buffer.from("audio"), DEFAULT_UPLOAD_OPTIONS);

    expect(result).toEqual({ fileId: "file_abc123", folderId: divisionFolderId });
  });

  it("falls back to 'unknown' for blank seasonYear and division", async () => {
    mockFilesList
      .mockResolvedValueOnce({ data: { files: [{ id: "yr_folder" }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: "div_folder" }] } });
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "file_xyz" } });

    await uploadSongToDrive(Buffer.from("audio"), {
      filename: "test.mp3",
      mimeType: "audio/mpeg",
      seasonYear: "  ",
      division: "",
    });

    // Year folder lookup should use "unknown"
    expect(mockFilesList).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ q: expect.stringContaining("name='unknown'") })
    );
  });

  it("sanitizes slashes and collapsed whitespace in folder names", async () => {
    mockFilesList
      .mockResolvedValueOnce({ data: { files: [{ id: "yr_folder" }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: "div_folder" }] } });
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "file_xyz" } });

    await uploadSongToDrive(Buffer.from("audio"), {
      filename: "test.mp3",
      mimeType: "audio/mpeg",
      seasonYear: "2026",
      division: "Latin  Rhythm/Open",
    });

    expect(mockFilesList).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        q: expect.stringContaining("name='Latin Rhythm-Open'"),
      })
    );
  });

  it("throws when Drive returns no file ID", async () => {
    mockFoldersExist();
    mockFilesCreate.mockResolvedValueOnce({ data: {} });

    await expect(
      uploadSongToDrive(Buffer.from("audio"), DEFAULT_UPLOAD_OPTIONS)
    ).rejects.toThrow("Drive upload did not return a file id");
  });
});

describe("softDeleteOnDrive", () => {
  beforeEach(() => {
    resetDriveTestState();
  });

  const { mockFilesCreate, mockFilesList, mockFilesGet, mockFilesUpdate } = mocks;

  it("throws when env vars are missing", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    await expect(softDeleteOnDrive("file1")).rejects.toThrow(
      "Google Drive environment variables are not configured"
    );
  });

  it("uses existing _deprecated folder at root when found", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: "deprecated_folder_1" }] },
    });
    mockFilesGet.mockResolvedValueOnce({
      data: { parents: ["year_folder_2026"] },
    });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc");

    expect(mockFilesCreate).not.toHaveBeenCalled();

    // _deprecated lookup must target the root folder
    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({
        q: expect.stringContaining("'parent_folder_123' in parents"),
      })
    );

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_abc",
        addParents: "deprecated_folder_1",
        supportsAllDrives: true,
      })
    );
  });

  it("creates _deprecated folder at root when not found", async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "new_deprecated_folder" } });
    mockFilesGet.mockResolvedValueOnce({ data: { parents: ["year_folder_2026"] } });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc");

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "_deprecated",
          mimeType: "application/vnd.google-apps.folder",
          parents: ["parent_folder_123"],
        }),
      })
    );

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_abc",
        addParents: "new_deprecated_folder",
      })
    );
  });

  it("throws when _deprecated folder cannot be created", async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    mockFilesCreate.mockResolvedValueOnce({ data: {} }); // no ID returned

    await expect(softDeleteOnDrive("file_abc")).rejects.toThrow(
      "Failed to create Drive folder: _deprecated"
    );
  });

  it("uses supportsAllDrives on all API calls", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: "dep_folder" }] },
    });
    mockFilesGet.mockResolvedValueOnce({ data: { parents: ["year_folder_2026"] } });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc");

    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({ supportsAllDrives: true, includeItemsFromAllDrives: true })
    );
    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ supportsAllDrives: true })
    );
  });

  it("removes all current parents when moving to _deprecated", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: "dep_folder" }] },
    });
    mockFilesGet.mockResolvedValueOnce({
      data: { parents: ["year_folder", "div_folder"] },
    });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc");

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        removeParents: "year_folder,div_folder",
      })
    );
  });
});

const DEFAULT_COPY_OPTIONS = {
  filename: "track.mp3",
  seasonYear: "2026",
  eventName: "Spring Classic",
  division: "Classic",
};

function mockEventCopyFolders(
  ids = {
    year: "year_folder_2026",
    events: "events_folder",
    event: "event_spring",
    division: "div_classic",
  }
) {
  mocks.mockFilesList
    .mockResolvedValueOnce({ data: { files: [{ id: ids.year }] } })
    .mockResolvedValueOnce({ data: { files: [{ id: ids.events }] } })
    .mockResolvedValueOnce({ data: { files: [{ id: ids.event }] } })
    .mockResolvedValueOnce({ data: { files: [{ id: ids.division }] } });
  return ids;
}

describe("copySongToEventFolder folder cache", () => {
  beforeEach(() => {
    resetDriveTestState();
  });

  const { mockFilesCopy, mockFilesList } = mocks;

  it("lists each event folder only once across two identical copies", async () => {
    mockEventCopyFolders();
    mockFilesCopy.mockResolvedValue({ data: { id: "copy_1" } });

    await copySongToEventFolder("source_1", DEFAULT_COPY_OPTIONS);
    expect(mockFilesList).toHaveBeenCalledTimes(4);

    mockFilesCopy.mockResolvedValue({ data: { id: "copy_2" } });
    await copySongToEventFolder("source_2", DEFAULT_COPY_OPTIONS);
    expect(mockFilesList).toHaveBeenCalledTimes(4);
  });

  it("re-lists only the division folder when division differs under the same event", async () => {
    const ids = mockEventCopyFolders();
    mockFilesCopy.mockResolvedValue({ data: { id: "copy_1" } });
    await copySongToEventFolder("source_1", DEFAULT_COPY_OPTIONS);
    expect(mockFilesList).toHaveBeenCalledTimes(4);

    mockFilesList.mockResolvedValueOnce({ data: { files: [{ id: "div_proam" }] } });
    mockFilesCopy.mockResolvedValue({ data: { id: "copy_2" } });
    await copySongToEventFolder("source_2", { ...DEFAULT_COPY_OPTIONS, division: "ProAm" });
    expect(mockFilesList).toHaveBeenCalledTimes(5);
    expect(mockFilesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: expect.stringContaining(`'${ids.event}' in parents`),
      })
    );
  });

  it("treats the same folder name under different parents as separate cache entries", async () => {
    mockEventCopyFolders({
      year: "year_2026",
      events: "events_folder",
      event: "event_a",
      division: "div_under_a",
    });
    mockFilesCopy.mockResolvedValueOnce({ data: { id: "copy_a" } });
    await copySongToEventFolder("source_a", DEFAULT_COPY_OPTIONS);

    mockEventCopyFolders({
      year: "year_2026",
      events: "events_folder",
      event: "event_b",
      division: "div_under_b",
    });
    mockFilesCopy.mockResolvedValueOnce({ data: { id: "copy_b" } });
    await copySongToEventFolder("source_b", { ...DEFAULT_COPY_OPTIONS, eventName: "Fall Classic" });

    // Four lookups for the first event, then event + division for the second (year/Events cached).
    expect(mockFilesList).toHaveBeenCalledTimes(6);
  });

  it("re-lists after clearDriveFolderCache", async () => {
    mockEventCopyFolders();
    mockFilesCopy.mockResolvedValue({ data: { id: "copy_1" } });
    await copySongToEventFolder("source_1", DEFAULT_COPY_OPTIONS);
    expect(mockFilesList).toHaveBeenCalledTimes(4);

    clearDriveFolderCache();
    mockEventCopyFolders();
    mockFilesCopy.mockResolvedValue({ data: { id: "copy_2" } });
    await copySongToEventFolder("source_2", DEFAULT_COPY_OPTIONS);
    expect(mockFilesList).toHaveBeenCalledTimes(8);
  });

  it("clears the cache and rethrows when files.copy fails", async () => {
    mockEventCopyFolders();
    mockFilesCopy.mockRejectedValueOnce(new Error("parent not found"));

    await expect(copySongToEventFolder("source_1", DEFAULT_COPY_OPTIONS)).rejects.toThrow(
      "parent not found"
    );
    expect(mockFilesList).toHaveBeenCalledTimes(4);

    mockEventCopyFolders();
    mockFilesCopy.mockResolvedValueOnce({ data: { id: "copy_2" } });
    await copySongToEventFolder("source_2", DEFAULT_COPY_OPTIONS);
    expect(mockFilesList).toHaveBeenCalledTimes(8);
  });

  it("clears the cache and rethrows when folder resolution fails", async () => {
    mockFilesList
      .mockResolvedValueOnce({ data: { files: [{ id: "year_1" }] } })
      .mockResolvedValueOnce({ data: { files: [{ id: "events_1" }] } })
      .mockRejectedValueOnce(new Error("folder list failed"));

    await expect(copySongToEventFolder("source_1", DEFAULT_COPY_OPTIONS)).rejects.toThrow(
      "folder list failed"
    );
    expect(mockFilesCopy).not.toHaveBeenCalled();

    mockEventCopyFolders();
    mockFilesCopy.mockResolvedValueOnce({ data: { id: "copy_2" } });
    await copySongToEventFolder("source_2", DEFAULT_COPY_OPTIONS);
    // Cache was cleared on the list failure, so the successful retry re-lists.
    // 3 lists before the failure + 4 on the successful retry.
    expect(mockFilesList).toHaveBeenCalledTimes(7);
  });

  it("nests the copy under a subfolder inside the division folder", async () => {
    const ids = mockEventCopyFolders();
    mockFilesList.mockResolvedValueOnce({ data: { files: [{ id: "finals_folder" }] } });
    mockFilesCopy.mockResolvedValue({ data: { id: "copy_finals" } });

    const result = await copySongToEventFolder("source_1", {
      ...DEFAULT_COPY_OPTIONS,
      subfolder: "Finals",
    });

    expect(mockFilesList).toHaveBeenCalledTimes(5);
    expect(mockFilesList).toHaveBeenLastCalledWith(
      expect.objectContaining({
        q: expect.stringContaining(`'${ids.division}' in parents`),
      })
    );
    expect(mockFilesCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({ parents: ["finals_folder"] }),
      })
    );
    expect(result.folderId).toBe("finals_folder");
  });
});

describe("renameDriveFile", () => {
  beforeEach(() => {
    resetDriveTestState();
  });

  const { mockFilesGet, mockFilesUpdate } = mocks;

  it("returns false and does not update when the current name already matches", async () => {
    mockFilesGet.mockResolvedValueOnce({ data: { name: "2026_Classic.mp3" } });

    await expect(renameDriveFile("file_1", "2026_Classic.mp3")).resolves.toBe(false);

    expect(mockFilesGet).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: "file_1", fields: "name", supportsAllDrives: true })
    );
    expect(mockFilesUpdate).not.toHaveBeenCalled();
  });

  it("returns true and updates when the name differs", async () => {
    mockFilesGet.mockResolvedValueOnce({ data: { name: "old name.mp3" } });
    mockFilesUpdate.mockResolvedValueOnce({ data: { id: "file_1", name: "2026_Classic.mp3" } });

    await expect(renameDriveFile("file_1", "2026_Classic.mp3")).resolves.toBe(true);

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_1",
        requestBody: { name: "2026_Classic.mp3" },
        fields: "id,name",
        supportsAllDrives: true,
      })
    );
  });
});

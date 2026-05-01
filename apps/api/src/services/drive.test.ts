import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const mockFilesCreate = vi.fn();
  const mockFilesList = vi.fn();
  const mockFilesGet = vi.fn();
  const mockFilesUpdate = vi.fn();
  const driveApi = {
    files: {
      create: mockFilesCreate,
      list: mockFilesList,
      get: mockFilesGet,
      update: mockFilesUpdate,
    },
  };
  const mockGoogleDrive = vi.fn(() => driveApi);
  return {
    mockFilesCreate,
    mockFilesList,
    mockFilesGet,
    mockFilesUpdate,
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
import { softDeleteOnDrive, uploadSongToDrive } from "./drive.js";

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

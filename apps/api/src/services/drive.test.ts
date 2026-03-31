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

function resetDriveTestState() {
  vi.resetAllMocks();
  mocks.mockGoogleDrive.mockImplementation(() => mocks.driveApi);
  vi.mocked(JWT).mockImplementation(
    () => ({ type: "jwt" }) as unknown as InstanceType<typeof JWT>
  );
  Object.assign(process.env, TEST_ENV);
}

describe("uploadSongToDrive", () => {
  beforeEach(() => {
    resetDriveTestState();
  });

  const { mockFilesCreate } = mocks;

  it("throws when env vars are missing", async () => {
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    await expect(
      uploadSongToDrive(Buffer.from("test"), { filename: "test.mp3", mimeType: "audio/mpeg" })
    ).rejects.toThrow("Google Drive environment variables are not configured");
  });

  it("calls drive.files.create with correct parameters", async () => {
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "file_abc123" } });

    const bytes = Buffer.from("audio data");
    await uploadSongToDrive(bytes, { filename: "test_v1.mp3", mimeType: "audio/mpeg" });

    expect(mockFilesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          name: "test_v1.mp3",
          parents: ["parent_folder_123"],
        }),
        media: expect.objectContaining({
          mimeType: "audio/mpeg",
        }),
        supportsAllDrives: true,
      })
    );
  });

  it("returns fileId and folderId on success", async () => {
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "file_abc123" } });

    const result = await uploadSongToDrive(Buffer.from("audio"), {
      filename: "test.mp3",
      mimeType: "audio/mpeg",
    });

    expect(result).toEqual({
      fileId: "file_abc123",
      folderId: "parent_folder_123",
    });
  });

  it("throws when Drive returns no file ID", async () => {
    mockFilesCreate.mockResolvedValueOnce({ data: {} });

    await expect(
      uploadSongToDrive(Buffer.from("audio"), { filename: "test.mp3", mimeType: "audio/mpeg" })
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
    await expect(softDeleteOnDrive("file1", "folder1")).rejects.toThrow(
      "Google Drive environment variables are not configured"
    );
  });

  it("uses existing _deprecated folder when found", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: "deprecated_folder_1" }] },
    });
    mockFilesGet.mockResolvedValueOnce({
      data: { parents: ["parent_folder_123"] },
    });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc", "parent_folder_123");

    expect(mockFilesCreate).not.toHaveBeenCalled();

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileId: "file_abc",
        addParents: "deprecated_folder_1",
        supportsAllDrives: true,
      })
    );
  });

  it("creates _deprecated folder when not found", async () => {
    mockFilesList.mockResolvedValueOnce({ data: { files: [] } });
    mockFilesCreate.mockResolvedValueOnce({ data: { id: "new_deprecated_folder" } });
    mockFilesGet.mockResolvedValueOnce({ data: { parents: ["parent_folder_123"] } });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc", "parent_folder_123");

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
    mockFilesCreate.mockResolvedValueOnce({ data: {} });

    await expect(softDeleteOnDrive("file_abc", "parent_folder_123")).rejects.toThrow(
      "Unable to locate or create _deprecated folder"
    );
  });

  it("uses supportsAllDrives on all API calls", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: "dep_folder" }] },
    });
    mockFilesGet.mockResolvedValueOnce({ data: { parents: ["parent_folder_123"] } });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc", "parent_folder_123");

    expect(mockFilesList).toHaveBeenCalledWith(
      expect.objectContaining({
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      })
    );
    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ supportsAllDrives: true })
    );
  });

  it("handles file with multiple parents — removes all current parents", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: { files: [{ id: "dep_folder" }] },
    });
    mockFilesGet.mockResolvedValueOnce({
      data: { parents: ["parent1", "parent2"] },
    });
    mockFilesUpdate.mockResolvedValueOnce({ data: {} });

    await softDeleteOnDrive("file_abc", "parent_folder_123");

    expect(mockFilesUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        removeParents: "parent1,parent2",
      })
    );
  });
});

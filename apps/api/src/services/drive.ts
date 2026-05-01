import { JWT } from "google-auth-library";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "node:stream";

function getAuthClient(): JWT {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const folderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;

  if (!email || !key || !folderId) {
    throw new Error("Google Drive environment variables are not configured");
  }

  return new JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
}

function getParentFolderId(): string {
  const folderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
  if (!folderId) {
    throw new Error("Google Drive environment variables are not configured");
  }
  return folderId;
}

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/**
 * Finds a subfolder by name inside `parentId`, creating it if it doesn't
 * exist. Returns the folder's Drive ID.
 */
async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId: string
): Promise<string> {
  const escaped = escapeDriveQueryValue(name);
  const listRes = await drive.files.list({
    q: `name='${escaped}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: "files(id)",
    spaces: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
  });

  const existing = listRes.data.files?.[0]?.id;
  if (existing) return existing;

  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const created = createRes.data.id;
  if (!created) throw new Error(`Failed to create Drive folder: ${name}`);
  return created;
}

export interface DriveUploadResult {
  fileId: string;
  folderId: string;
}

/**
 * Uploads a song file to Drive under:
 *   <root>/<seasonYear>/<division>/<filename>
 *
 * Year and division subfolders are created on demand.
 * Returns the file ID and the division folder ID.
 */
export async function uploadSongToDrive(
  bytes: Buffer,
  options: {
    filename: string;
    mimeType: string;
    seasonYear: string;
    division: string;
  }
): Promise<DriveUploadResult> {
  const auth = getAuthClient();
  const rootFolderId = getParentFolderId();
  const drive = google.drive({ version: "v3", auth });

  const yearLabel = options.seasonYear.trim() || "unknown";
  const divisionLabel = options.division.trim() || "unknown";

  const yearFolderId = await findOrCreateFolder(drive, yearLabel, rootFolderId);
  const divisionFolderId = await findOrCreateFolder(drive, divisionLabel, yearFolderId);

  const createRes = await drive.files.create({
    requestBody: {
      name: options.filename,
      parents: [divisionFolderId],
    },
    media: {
      mimeType: options.mimeType,
      body: Readable.from(bytes),
    },
    fields: "id",
    supportsAllDrives: true,
    uploadType: "resumable",
  });

  const fileId = createRes.data.id;
  if (!fileId) {
    throw new Error("Drive upload did not return a file id");
  }

  return { fileId, folderId: divisionFolderId };
}

/**
 * Moves a Drive file into the root-level `_deprecated` folder.
 * The deprecated folder is always a direct child of the root, regardless
 * of where the file currently lives (year/division subfolders).
 * Creates `_deprecated` if it doesn't already exist.
 */
export async function softDeleteOnDrive(fileId: string): Promise<void> {
  const auth = getAuthClient();
  const rootFolderId = getParentFolderId();
  const drive = google.drive({ version: "v3", auth });

  const deprecatedFolderId = await findOrCreateFolder(drive, "_deprecated", rootFolderId);

  const fileRes = await drive.files.get({
    fileId,
    fields: "parents",
    supportsAllDrives: true,
  });

  const currentParents = (fileRes.data.parents ?? []).join(",");

  await drive.files.update({
    fileId,
    addParents: deprecatedFolderId,
    removeParents: currentParents || undefined,
    fields: "id,parents",
    supportsAllDrives: true,
  });
}

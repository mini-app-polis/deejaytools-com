import { JWT } from "google-auth-library";
import { google } from "googleapis";
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

export interface DriveUploadResult {
  fileId: string;
  folderId: string;
}

export async function uploadSongToDrive(
  bytes: Buffer,
  options: { filename: string; mimeType: string }
): Promise<DriveUploadResult> {
  const auth = getAuthClient();
  const folderId = getParentFolderId();
  const drive = google.drive({ version: "v3", auth });

  const createRes = await drive.files.create({
    requestBody: {
      name: options.filename,
      parents: [folderId],
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

  return { fileId, folderId };
}

export async function softDeleteOnDrive(fileId: string, folderId: string): Promise<void> {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });
  const deprecatedName = "_deprecated";
  const escapedName = escapeDriveQueryValue(deprecatedName);

  const listRes = await drive.files.list({
    q: `name='${escapedName}' and mimeType='application/vnd.google-apps.folder' and '${folderId}' in parents and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    pageSize: 1,
  });

  let deprecatedFolderId = listRes.data.files?.[0]?.id;
  if (!deprecatedFolderId) {
    const createFolderRes = await drive.files.create({
      requestBody: {
        name: deprecatedName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [folderId],
      },
      fields: "id",
      supportsAllDrives: true,
    });
    deprecatedFolderId = createFolderRes.data.id;
  }

  if (!deprecatedFolderId) {
    throw new Error("Unable to locate or create _deprecated folder");
  }

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

import { JWT } from "google-auth-library";
import { google } from "googleapis";
import type { drive_v3 } from "googleapis";
import { Readable } from "node:stream";
import { TtlCache } from "../lib/cache.js";

/**
 * Drive folder ids keyed by (parent, name). Folder ids are stable for the life
 * of the folder, so this is cached for an hour rather than seconds — the TTL
 * exists to recover from a folder deleted out from under us, not to track
 * churn.
 *
 * A dedicated instance rather than the shared responseCache: different
 * lifetime, different invalidation, and no risk of key collisions with HTTP
 * response caching.
 */
const folderCache = new TtlCache();
const FOLDER_CACHE_TTL_MS = 60 * 60_000;

/** Exported for tests and for recovery when a cached parent turns out to be gone. */
export function clearDriveFolderCache(): void {
  folderCache.invalidatePrefix("drivefolder:");
}

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
  const cacheKey = `drivefolder:${parentId}:${name}`;
  const cached = folderCache.get<string>(cacheKey);
  if (cached) return cached;

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
  if (existing) {
    folderCache.set(cacheKey, existing, FOLDER_CACHE_TTL_MS);
    return existing;
  }

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
  folderCache.set(cacheKey, created, FOLDER_CACHE_TTL_MS);
  return created;
}

/**
 * Drive treats "/" as a path separator in some clients, and leading/trailing
 * whitespace produces folders that look identical but aren't. Event names are
 * free text typed by admins, so normalize before using one as a folder name.
 */
function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[/\\]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned || "unknown";
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
 * Copies an existing song file into its event folder:
 *   <root>/<seasonYear>/Events/<eventName>/<division>/<filename>
 *
 * Year, "Events", event and division subfolders are created on demand. The
 * source must be a file this service account created — the drive.file scope
 * grants no access to anything else, which holds for songs uploaded through
 * uploadSongToDrive.
 *
 * Returns the copy's file ID and the division folder ID.
 */
export async function copySongToEventFolder(
  sourceFileId: string,
  options: {
    filename: string;
    seasonYear: string;
    eventName: string;
    division: string;
    /** Optional folder nested under the division — "Finals" for finals-only entries. */
    subfolder?: string;
  }
): Promise<DriveUploadResult> {
  const auth = getAuthClient();
  const rootFolderId = getParentFolderId();
  const drive = google.drive({ version: "v3", auth });

  const yearFolderId = await findOrCreateFolder(
    drive,
    sanitizeFolderName(options.seasonYear),
    rootFolderId
  );
  const eventsFolderId = await findOrCreateFolder(drive, "Events", yearFolderId);
  const eventFolderId = await findOrCreateFolder(
    drive,
    sanitizeFolderName(options.eventName),
    eventsFolderId
  );
  const divisionFolderId = await findOrCreateFolder(
    drive,
    sanitizeFolderName(options.division),
    eventFolderId
  );

  const destinationFolderId = options.subfolder
    ? await findOrCreateFolder(drive, sanitizeFolderName(options.subfolder), divisionFolderId)
    : divisionFolderId;

  let copyRes;
  try {
    copyRes = await drive.files.copy({
      fileId: sourceFileId,
      requestBody: {
        name: options.filename,
        parents: [destinationFolderId],
      },
      fields: "id",
      supportsAllDrives: true,
    });
  } catch (err) {
    // The destination parent may be a cached id for a folder that has since
    // been trashed, which would fail identically on every retry for the whole
    // TTL. Cheap to rebuild, so drop the cache and let the retry re-resolve.
    clearDriveFolderCache();
    throw err;
  }

  const fileId = copyRes.data.id;
  if (!fileId) {
    throw new Error("Drive copy did not return a file id");
  }

  return { fileId, folderId: destinationFolderId };
}

/**
 * Renames an existing Drive file, returning true if a change was made.
 *
 * Reads the current name first so that re-running a rename sweep over files
 * already named correctly costs one metadata GET each and issues no writes —
 * this is what makes the backfill safe to run repeatedly after a naming-rule
 * change.
 */
export async function renameDriveFile(fileId: string, name: string): Promise<boolean> {
  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const current = await drive.files.get({
    fileId,
    fields: "name",
    supportsAllDrives: true,
  });

  if (current.data.name === name) return false;

  await drive.files.update({
    fileId,
    requestBody: { name },
    fields: "id,name",
    supportsAllDrives: true,
  });

  return true;
}

/**
 * Result of attempting to share a Drive file with one or more emails.
 * Failures are reported per-email so the caller can log them without
 * losing the successful shares.
 */
export interface DriveShareResult {
  shared: string[];
  failed: { email: string; error: unknown }[];
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Grants `reader` permission on a Drive file to each unique, syntactically
 * valid email. Notification emails are suppressed so users aren't spammed
 * on every upload — the app surfaces the Drive link directly.
 *
 * Per-email failures are collected and returned rather than thrown, so a
 * single bad address (e.g. an external partner whose Google account can't
 * be added by the service account) doesn't drop the other shares. The
 * caller is expected to log `failed` entries.
 */
export async function shareDriveFileWithUsers(
  fileId: string,
  emails: (string | null | undefined)[]
): Promise<DriveShareResult> {
  const cleaned = Array.from(
    new Set(
      emails
        .map((e) => e?.trim().toLowerCase() ?? "")
        .filter((e) => e.length > 0 && EMAIL_REGEX.test(e))
    )
  );

  if (cleaned.length === 0) return { shared: [], failed: [] };

  const auth = getAuthClient();
  const drive = google.drive({ version: "v3", auth });

  const shared: string[] = [];
  const failed: { email: string; error: unknown }[] = [];

  for (const email of cleaned) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: "reader",
          type: "user",
          emailAddress: email,
        },
        sendNotificationEmail: false,
        supportsAllDrives: true,
      });
      shared.push(email);
    } catch (err) {
      failed.push({ email, error: err });
    }
  }

  return { shared, failed };
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

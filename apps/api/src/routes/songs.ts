import { File } from "node:buffer";
import { mkdir, writeFile, readdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import * as Sentry from "@sentry/node";
import { CommonErrors, createLogger, error, success, successList } from "common-typescript-utils";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, isNull, ne, notInArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkins, eventSongSubmissions, managedPartnerships, partners, queueEntries, sessions, songs, teams, users } from "../db/schema.js";
import { isFollowerAmDivision } from "@deejaytools/schemas";
import { seasonYearFromTimestamp } from "../lib/seasonYear.js";
import { requireAuth } from "../middleware/auth.js";
import { shareDriveFileWithUsers, softDeleteOnDrive, uploadSongToDrive } from "../services/drive.js";
import { enqueueDriveJob } from "../services/driveJobs.js";
import { tagSongBytes } from "../services/tagger.js";
import { detectAudioFormat } from "../services/audioFormat.js";

const listQuery = z.object({
  partner_id: z.string().optional(),
});

const createBody = z.object({
  partner_id: z.string().optional(),
  display_name: z.string().optional(),
  original_filename: z.string().optional(),
  division: z.string().min(1, "division is required"),
  routine_name: z.string().nullable().optional(),
  personal_descriptor: z.string().nullable().optional(),
  season_year: z.string().optional(),
});

const patchBody = z.object({
  partner_id: z.string().nullable().optional(),
  display_name: z.string().optional(),
  original_filename: z.string().nullable().optional(),
  division: z.string().nullable().optional(),
  routine_name: z.string().nullable().optional(),
  personal_descriptor: z.string().nullable().optional(),
  season_year: z.string().nullable().optional(),
});

const CHUNK_TMP_BASE = "/tmp/dj-upload-chunks";
const MAX_CHUNK_BYTES = 10 * 1024 * 1024; // 10 MB per chunk
const MAX_ASSEMBLED_BYTES = 110 * 1024 * 1024; // ~110 MB assembled
const CHUNK_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Remove any stale upload dirs older than CHUNK_TTL_MS. Fire-and-forget — never throws. */
async function sweepStaleTmpDirs(): Promise<void> {
  try {
    const entries = await readdir(CHUNK_TMP_BASE);
    const now = Date.now();
    await Promise.all(
      entries.map(async (entry) => {
        const dir = join(CHUNK_TMP_BASE, entry);
        try {
          const s = await stat(dir);
          if (now - s.mtimeMs > CHUNK_TTL_MS) {
            await rm(dir, { recursive: true, force: true });
          }
        } catch {
          // ignore — dir may have been cleaned up by a concurrent request
        }
      })
    );
  } catch {
    // CHUNK_TMP_BASE doesn't exist yet or readdir failed — nothing to clean
  }
}

export const songRoutes = new Hono();
const logger = createLogger("songs-routes");

/**
 * Convert a string to PascalCase, stripping non-alphanumeric characters.
 * Each whitespace-separated word is capitalised:
 *   "Kaiano Levine"             → "KaianoLevine"
 *   "My Division Is Not Listed" → "MyDivisionIsNotListed"
 *   "Rising Star Classic"       → "RisingStarClassic"
 *   "2026"                      → "2026"
 */
function sanitizeSegment(input: string | null | undefined): string {
  if (!input) return "";
  const words = input.trim().split(/\s+/).filter(Boolean);
  return words
    .map((word) => {
      const clean = word.replace(/[^a-zA-Z0-9]/g, "");
      if (!clean) return "";
      const lower = clean.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join("");
}

/** Filename-safe segment that PRESERVES casing — for controlled values like
 *  division names that are already well-formed (e.g. "ProAm LeaderAm" → "ProAmLeaderAm"). */
function staticSegment(input: string | null | undefined): string {
  if (!input) return "";
  return input.replace(/[^a-zA-Z0-9]/g, "");
}

function splitNameAndExtension(filename: string): { base: string; ext: string } {
  const trimmed = filename.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return { base: trimmed, ext: "" };
  }
  return {
    base: trimmed.slice(0, lastDot),
    ext: trimmed.slice(lastDot + 1),
  };
}


function computedSongDisplayName(row: typeof songs.$inferSelect): string | null {
  const d = row.displayName?.trim();
  if (d) return d;
  const p = row.processedFilename?.trim();
  if (p) return p;
  const o = row.originalFilename?.trim();
  if (o) return o;
  return null;
}

/**
 * Legacy rows were created by the removed claim-legacy flow with a sentinel
 * processed_filename that starts with "[Legacy] ". They have no Drive file
 * and no playable audio — they exist purely so a user can attach historical
 * metadata to their account. Detecting them off the prefix keeps the logic
 * in one place; if we ever store this as a real column, swap this out.
 */
export function isLegacySong(processedFilename: string | null | undefined): boolean {
  return !!processedFilename && processedFilename.startsWith("[Legacy] ");
}

function mapSong(
  row: typeof songs.$inferSelect & {
    partner_first_name?: string | null;
    partner_last_name?: string | null;
    partner_kind?: string | null;
    managed_leader_first_name?: string | null;
    managed_leader_last_name?: string | null;
    managed_follower_first_name?: string | null;
    managed_follower_last_name?: string | null;
  }
) {
  return {
    id: row.id,
    user_id: row.userId,
    partner_id: row.partnerId,
    display_name: computedSongDisplayName(row),
    original_filename: row.originalFilename,
    drive_file_id: row.driveFileId,
    drive_folder_id: row.driveFolderId,
    processed_filename: row.processedFilename,
    division: row.division,
    routine_name: row.routineName,
    personal_descriptor: row.personalDescriptor,
    season_year: row.seasonYear,
    is_legacy: isLegacySong(row.processedFilename),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    partner_first_name: row.partner_first_name ?? null,
    partner_last_name: row.partner_last_name ?? null,
    partner_kind: row.partner_kind ?? null,
    managed_partnership_id: row.managedPartnershipId ?? null,
    managed_leader_first_name: row.managed_leader_first_name ?? null,
    managed_leader_last_name: row.managed_leader_last_name ?? null,
    managed_follower_first_name: row.managed_follower_first_name ?? null,
    managed_follower_last_name: row.managed_follower_last_name ?? null,
  };
}

/**
 * Shared logic: tag audio bytes, upload to Drive, update the song row.
 * Used by both the single-request upload endpoint and the chunked upload endpoint.
 */
async function buildAndUploadSong(
  song: typeof songs.$inferSelect,
  userId: string,
  inputBytes: Buffer,
  originalName: string,
  mimeType: string
): Promise<ReturnType<typeof mapSong>> {
  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) throw new Error("User not found");

  let partnerRow: typeof partners.$inferSelect | null = null;
  let managedPartnershipRow: typeof managedPartnerships.$inferSelect | null = null;
  if (song.managedPartnershipId) {
    const [mp] = await db
      .select()
      .from(managedPartnerships)
      .where(
        and(
          eq(managedPartnerships.id, song.managedPartnershipId),
          eq(managedPartnerships.userId, userId)
        )
      )
      .limit(1);
    managedPartnershipRow = mp ?? null;
    if (!managedPartnershipRow) throw new Error("Managed partnership not found");
  } else if (song.partnerId) {
    const [p] = await db
      .select()
      .from(partners)
      .where(and(eq(partners.id, song.partnerId), eq(partners.userId, userId)))
      .limit(1);
    partnerRow = p ?? null;
  }

  const seasonYearStr = seasonYearFromTimestamp(Date.now());

  // Derive version from the highest _vN found in existing filenames so that
  // deleted versions are still counted (e.g. if v1–v3 exist and v1/v2 are
  // deleted, the next upload becomes v4, not v2).
  const existingRows = await db
    .select({ processedFilename: songs.processedFilename })
    .from(songs)
    .where(
      and(
        eq(songs.userId, userId),
        sql`coalesce(${songs.division}, '') = ${song.division ?? ""}`,
        sql`coalesce(${songs.routineName}, '') = ${song.routineName ?? ""}`,
        eq(songs.seasonYear, seasonYearStr),
        sql`coalesce(${songs.partnerId}, '') = ${song.partnerId ?? ""}`,
        sql`coalesce(${songs.managedPartnershipId}, '') = ${song.managedPartnershipId ?? ""}`,
        ne(songs.id, song.id)
      )
    );
  const maxVersion = existingRows.reduce((max, row) => {
    const match = row.processedFilename?.match(/_v(\d+)(?:\.[^.]*)?$/);
    return match ? Math.max(max, parseInt(match[1], 10)) : max;
  }, 0);
  const version = maxVersion + 1;

  const userName =
    [userRow.firstName, userRow.lastName].filter(Boolean).join(" ") || userId;
  const partnerName = partnerRow
    ? [partnerRow.firstName, partnerRow.lastName].filter(Boolean).join(" ")
    : null;

  let leaderName: string;
  let followerName: string | null;
  if (managedPartnershipRow) {
    leaderName = [managedPartnershipRow.leaderFirstName, managedPartnershipRow.leaderLastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    followerName = [managedPartnershipRow.followerFirstName, managedPartnershipRow.followerLastName]
      .filter(Boolean)
      .join(" ")
      .trim();
  } else if (!partnerRow) {
    leaderName = userName;
    followerName = null;
  } else if (partnerRow.kind && partnerRow.kind !== "partner") {
    leaderName = partnerName ?? "";
    followerName = null;
  } else if (partnerRow.partnerRole === "leader") {
    leaderName = partnerName ?? "";
    followerName = userName;
  } else {
    leaderName = userName;
    followerName = partnerName ?? "";
  }

  const swapForProAm = followerName != null && isFollowerAmDivision(song.division);
  const entityFirst: string = swapForProAm ? followerName! : leaderName;
  const entitySecond = swapForProAm ? leaderName : followerName;

  const partnershipSegment = entitySecond
    ? `${sanitizeSegment(entityFirst)}_${sanitizeSegment(entitySecond)}`
    : sanitizeSegment(entityFirst);

  const originalParts = splitNameAndExtension(originalName);
  const pathSegments = [
    partnershipSegment || sanitizeSegment(userId) || "user",
    staticSegment(song.division),
    sanitizeSegment(seasonYearStr),
    sanitizeSegment(song.routineName),
    sanitizeSegment(song.personalDescriptor),
  ].filter((s) => s.length > 0);
  const baseWithoutVersion = pathSegments.join("_");
  const versionedStem = `${baseWithoutVersion}_v${String(version).padStart(2, "0")}`;
  // Extensions stay lowercase — file extensions are conventionally lowercase
  // and don't need the PascalCase treatment that sanitizeSegment applies to
  // human-facing path segments (which would turn "mp3" into "Mp3").
  const extSegment = originalParts.ext.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  const processedFilename = extSegment ? `${versionedStem}.${extSegment}` : versionedStem;

  // Same order as the filename so a DJ reading the player and the folder
  // listing sees one consistent entity.
  const newTitle = entitySecond ? `${entityFirst} & ${entitySecond}` : entityFirst;
  const newArtist = [song.division, seasonYearStr, song.routineName].filter(Boolean).join(" - ");

  const taggedBytes = await tagSongBytes({ bytes: inputBytes, newTitle, newArtist, mimeType });

  const uploadResult = await uploadSongToDrive(taggedBytes, {
    filename: processedFilename,
    mimeType,
    seasonYear: seasonYearStr,
    division: song.division ?? "",
  });

  // Share with the uploader and any partner email we know about.
  //
  // The Drive file lives under a service-account-owned root folder, so users
  // can't see it from their own Drive UI until we explicitly grant them
  // read access. We collect two potential recipients:
  //   1. The uploader's user account email (always present, always shared).
  //   2. The partner row's `email` column (free text the owner typed in).
  //
  // Sharing is best-effort: a per-email failure (e.g. a malformed address
  // or a non-Google account that Drive refuses) must not break the upload,
  // which has already succeeded. We log failures so they're discoverable in
  // ops without surfacing a misleading error to the user.
  const shareTargets: (string | null | undefined)[] = [userRow.email];
  if (partnerRow) {
    shareTargets.push(partnerRow.email);
  }
  try {
    const result = await shareDriveFileWithUsers(uploadResult.fileId, shareTargets);
    if (result.failed.length > 0) {
      logger.warn({
        event: "song_drive_share_partial_failure",
        category: "api",
        context: {
          songId: song.id,
          driveFileId: uploadResult.fileId,
          sharedCount: result.shared.length,
          failed: result.failed.map((f) => ({ email: f.email, error: String(f.error) })),
        },
      });
    }
  } catch (err) {
    logger.error({
      event: "song_drive_share_failed",
      category: "api",
      context: { songId: song.id, driveFileId: uploadResult.fileId },
      error: err,
    });
  }

  const now = Date.now();
  await db
    .update(songs)
    .set({
      originalFilename: originalName,
      processedFilename,
      seasonYear: seasonYearStr,
      driveFileId: uploadResult.fileId,
      driveFolderId: uploadResult.folderId,
      updatedAt: now,
    })
    .where(eq(songs.id, song.id));

  const [r] = await db
    .select({
      song: songs,
      partner_first_name: partners.firstName,
      partner_last_name: partners.lastName,
      partner_kind: partners.kind,
    })
    .from(songs)
    .leftJoin(partners, eq(partners.id, songs.partnerId))
    .where(eq(songs.id, song.id))
    .limit(1);

  return mapSong({
    ...r!.song,
    partner_first_name: r!.partner_first_name,
    partner_last_name: r!.partner_last_name,
    partner_kind: r!.partner_kind,
  });
}

async function assertPartnerOwned(userId: string, partnerId: string | null | undefined) {
  if (partnerId == null || partnerId === "") return true;
  const [p] = await db
    .select({ id: partners.id })
    .from(partners)
    .where(and(eq(partners.id, partnerId), eq(partners.userId, userId)))
    .limit(1);
  return !!p;
}

async function assertManagedPartnershipOwned(
  userId: string,
  managedPartnershipId: string | null | undefined
) {
  if (managedPartnershipId == null || managedPartnershipId === "") return true;
  const [row] = await db
    .select({ id: managedPartnerships.id })
    .from(managedPartnerships)
    .where(
      and(
        eq(managedPartnerships.id, managedPartnershipId),
        eq(managedPartnerships.userId, userId)
      )
    )
    .limit(1);
  return !!row;
}

songRoutes.get("/", requireAuth, zValidator("query", listQuery), async (c) => {
  const userId = c.get("user").userId;
  const { partner_id } = c.req.valid("query");

  const visibility = eq(songs.userId, userId);
  const partnerFilter =
    partner_id !== undefined && partner_id !== ""
      ? and(visibility, eq(songs.partnerId, partner_id), isNull(songs.deletedAt))
      : and(visibility, isNull(songs.deletedAt));

  const rows = await db
    .select({
      song: songs,
      partner_first_name: partners.firstName,
      partner_last_name: partners.lastName,
      partner_kind: partners.kind,
      managed_leader_first_name: managedPartnerships.leaderFirstName,
      managed_leader_last_name: managedPartnerships.leaderLastName,
      managed_follower_first_name: managedPartnerships.followerFirstName,
      managed_follower_last_name: managedPartnerships.followerLastName,
    })
    .from(songs)
    .leftJoin(partners, eq(partners.id, songs.partnerId))
    .leftJoin(managedPartnerships, eq(managedPartnerships.id, songs.managedPartnershipId))
    .where(partnerFilter)
    .orderBy(desc(songs.createdAt));

  return c.json(
    successList(
      rows.map((r) =>
        mapSong({
          ...r.song,
          partner_first_name: r.partner_first_name,
          partner_last_name: r.partner_last_name,
          partner_kind: r.partner_kind,
          managed_leader_first_name: r.managed_leader_first_name,
          managed_leader_last_name: r.managed_leader_last_name,
          managed_follower_first_name: r.managed_follower_first_name,
          managed_follower_last_name: r.managed_follower_last_name,
        })
      )
    )
  );
});

songRoutes.post("/", requireAuth, zValidator("json", createBody), async (c) => {
  const userId = c.get("user").userId;
  const body = c.req.valid("json");
  const now = Date.now();
  const id = crypto.randomUUID();

  if (body.partner_id != null && body.partner_id !== "") {
    const ok = await assertPartnerOwned(userId, body.partner_id);
    if (!ok) {
      return c.json(CommonErrors.badRequest("Partner not found or does not belong to you"), 400);
    }
  }

  const displayNameStored =
    body.display_name?.trim() ||
    body.routine_name?.trim() ||
    body.original_filename?.trim() ||
    null;

  // TODO: Google Drive upload — stub until drive service is wired.
  await db.insert(songs).values({
    id,
    userId,
    partnerId: body.partner_id && body.partner_id !== "" ? body.partner_id : null,
    displayName: displayNameStored,
    originalFilename: body.original_filename?.trim() || null,
    processedFilename: null,
    division: body.division?.trim() || null,
    routineName: body.routine_name?.trim() || null,
    personalDescriptor: body.personal_descriptor?.trim() || null,
    seasonYear: body.season_year?.trim() || null,
    driveFileId: null,
    driveFolderId: null,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(songs).where(eq(songs.id, id)).limit(1);
  return c.json(success(mapSong({ ...row!, partner_first_name: null, partner_last_name: null })), 201);
});

songRoutes.get("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");
  const [r] = await db
    .select({
      song: songs,
      partner_first_name: partners.firstName,
      partner_last_name: partners.lastName,
      partner_kind: partners.kind,
    })
    .from(songs)
    .leftJoin(partners, eq(partners.id, songs.partnerId))
    .where(and(eq(songs.id, id), eq(songs.userId, userId), isNull(songs.deletedAt)))
    .limit(1);
  if (!r) {
    return c.json(CommonErrors.notFound("Song"), 404);
  }
  return c.json(
    success(
      mapSong({
        ...r.song,
        partner_first_name: r.partner_first_name,
        partner_last_name: r.partner_last_name,
        partner_kind: r.partner_kind,
      })
    )
  );
});

songRoutes.patch("/:id", requireAuth, zValidator("json", patchBody), async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [existing] = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.userId, userId), isNull(songs.deletedAt)))
    .limit(1);
  if (!existing) {
    return c.json(CommonErrors.notFound("Song"), 404);
  }

  if (body.partner_id !== undefined && body.partner_id !== null && body.partner_id !== "") {
    const ok = await assertPartnerOwned(userId, body.partner_id);
    if (!ok) {
      return c.json(CommonErrors.badRequest("Partner not found or does not belong to you"), 400);
    }
  }

  const now = Date.now();
  await db
    .update(songs)
    .set({
      ...(body.partner_id !== undefined && {
        partnerId:
          body.partner_id === null || body.partner_id === "" ? null : body.partner_id,
      }),
      ...(body.display_name !== undefined && {
        displayName: body.display_name.trim() || null,
      }),
      ...(body.division !== undefined && { division: body.division }),
      ...(body.routine_name !== undefined && { routineName: body.routine_name }),
      ...(body.personal_descriptor !== undefined && {
        personalDescriptor: body.personal_descriptor,
      }),
      ...(body.season_year !== undefined && { seasonYear: body.season_year }),
      ...(body.original_filename !== undefined && {
        originalFilename: body.original_filename,
      }),
      updatedAt: now,
    })
    .where(eq(songs.id, id));

  const [r] = await db
    .select({
      song: songs,
      partner_first_name: partners.firstName,
      partner_last_name: partners.lastName,
      partner_kind: partners.kind,
    })
    .from(songs)
    .leftJoin(partners, eq(partners.id, songs.partnerId))
    .where(eq(songs.id, id))
    .limit(1);
  return c.json(
    success(
      mapSong({
        ...r!.song,
        partner_first_name: r!.partner_first_name,
        partner_last_name: r!.partner_last_name,
        partner_kind: r!.partner_kind,
      })
    )
  );
});

songRoutes.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");

  const [existing] = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.userId, userId), isNull(songs.deletedAt)))
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Song"), 404);
  }

  // Block if song is actively in the queue in a live session.
  // Completed or cancelled sessions are excluded — once a session is over
  // the queue entries are historical and should not prevent song deletion.
  const [activeHit] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .innerJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .innerJoin(sessions, eq(sessions.id, checkins.sessionId))
    .where(
      and(
        eq(checkins.songId, id),
        notInArray(sessions.status, ["completed", "cancelled"])
      )
    )
    .limit(1);

  if (activeHit) {
    return c.json(
      error(
        "SONG_IN_ACTIVE_CHECKIN",
        "This song is referenced by an active check-in. Complete or withdraw the check-in first."
      ),
      409
    );
  }

  // Soft-delete on Drive (intentionally best-effort).
  //
  // Drive cleanup is decoupled from the DB delete because Drive is external
  // infrastructure that can be temporarily unavailable. The DB soft-delete is
  // what controls visibility in the app — once deleted_at is stamped, the song
  // disappears from every user-facing list regardless of Drive state.
  //
  // If Drive soft-delete fails: the file remains in the Drive folder (not
  // trashed), Sentry captures the error, and an operator can clean it up
  // manually. We do NOT block the user's delete action for this.
  if (existing.driveFileId && existing.driveFolderId) {
    try {
      await softDeleteOnDrive(existing.driveFileId);
    } catch (err) {
      logger.error({
        event: "song_drive_soft_delete_failed",
        category: "api",
        context: {
          songId: id,
          driveFileId: existing.driveFileId,
          driveFolderId: existing.driveFolderId,
        },
        error: err,
      });
    }
  }

  // Soft-delete: stamp deleted_at, keep the row for historical FK references
  let orphanedCopyIds: string[] = [];
  try {
    await db.transaction(async (tx) => {
      // A removed song must not linger in any event — drop its submission
      // references. Capture the per-event Drive copies first: once these rows
      // are gone the file ids are unrecoverable and the copies would sit in
      // the event folders forever with nothing pointing at them.
      const copies = await tx
        .select({ driveCopyFileId: eventSongSubmissions.driveCopyFileId })
        .from(eventSongSubmissions)
        .where(eq(eventSongSubmissions.songId, id));
      orphanedCopyIds = copies
        .map((r) => r.driveCopyFileId)
        .filter((v): v is string => v !== null);

      await tx.delete(eventSongSubmissions).where(eq(eventSongSubmissions.songId, id));
      // Soft-delete the song itself (row kept for historical run/check-in FK references).
      await tx
        .update(songs)
        .set({ deletedAt: Date.now() })
        .where(and(eq(songs.id, id), eq(songs.userId, userId)));
    });
  } catch (err) {
    logger.error({
      event: "song_delete_failed",
      category: "api",
      context: { songId: id, userId },
      error: err,
    });
    return c.json(CommonErrors.internalError("Failed to delete song"), 500);
  }

  // Best-effort, matching the Drive soft-delete above: the DB state is what
  // controls the app, and a failed enqueue is reported rather than surfaced
  // to the user mid-delete.
  for (const fileId of orphanedCopyIds) {
    try {
      await enqueueDriveJob(db, { kind: "trash", fileId });
    } catch (err) {
      logger.error({
        event: "drive_trash_enqueue_failed",
        category: "api",
        context: { songId: id, userId, driveFileId: fileId, source: "song_delete" },
        error: err,
      });
      Sentry.withScope((scope) => {
        scope.setLevel("error");
        scope.setTag("subsystem", "drive_jobs");
        scope.setTag("drive_job_kind", "trash");
        scope.setContext("drive_job", { file_id: fileId, stage: "enqueue", source: "song_delete" });
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      });
    }
  }

  return c.body(null, 204);
});

// POST /v1/songs/upload/chunk — atomic chunked upload: no song record is created until the
// final chunk is processed and Drive confirms the upload. Song never exists in a broken state.
// Body fields (send on every chunk): chunk (File), upload_id (UUID), chunk_index (int),
//   total_chunks (int), original_filename (string), mime_type (string), division (string),
//   partner_id (string|"") XOR managed_partnership_id (string),
//   routine_name (string|""), personal_descriptor (string|"")
songRoutes.post("/upload/chunk", requireAuth, async (c) => {
  const userId = c.get("user").userId;

  // Best-effort cleanup of abandoned upload dirs — does not block the request.
  sweepStaleTmpDirs().catch((err) =>
    logger.warn({ event: "sweep_tmp_dirs_failed", category: "infra", context: { error: String(err) } })
  );

  const body = await c.req.parseBody();
  const uploadId = typeof body.upload_id === "string" ? body.upload_id.trim() : "";
  const chunkIndex = Number(body.chunk_index ?? -1);
  const totalChunks = Number(body.total_chunks ?? 0);
  const originalName =
    typeof body.original_filename === "string"
      ? body.original_filename.trim() || "song.mp3"
      : "song.mp3";
  const mimeType =
    typeof body.mime_type === "string" ? body.mime_type.trim() || "audio/mpeg" : "audio/mpeg";
  const division = typeof body.division === "string" ? body.division.trim() : "";
  const partnerId =
    typeof body.partner_id === "string" ? body.partner_id.trim() || null : null;
  const managedPartnershipId =
    typeof body.managed_partnership_id === "string"
      ? body.managed_partnership_id.trim() || null
      : null;
  const routineName =
    typeof body.routine_name === "string" ? body.routine_name.trim() || null : null;
  const personalDescriptor =
    typeof body.personal_descriptor === "string"
      ? body.personal_descriptor.trim() || null
      : null;
  const onBehalfOfUserId =
    typeof body.on_behalf_of_user_id === "string"
      ? body.on_behalf_of_user_id.trim() || null
      : null;
  const entityType =
    typeof body.entity_type === "string" ? body.entity_type.trim() : "";
  const entityName =
    typeof body.entity_name === "string" ? body.entity_name.trim() : "";
  const teamId =
    typeof body.team_id === "string" ? body.team_id.trim() : "";
  const chunkFile = body.chunk instanceof File ? body.chunk : null;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uploadId)) {
    return c.json(CommonErrors.badRequest("Invalid upload_id"), 400);
  }
  if (!division) return c.json(CommonErrors.badRequest("division is required"), 400);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return c.json(CommonErrors.badRequest("Invalid chunk_index"), 400);
  }
  if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > 30) {
    return c.json(CommonErrors.badRequest("Invalid total_chunks (max 30)"), 400);
  }
  if (chunkIndex >= totalChunks) {
    return c.json(CommonErrors.badRequest("chunk_index out of range"), 400);
  }
  if (!chunkFile) return c.json(CommonErrors.badRequest("Missing chunk field"), 400);

  if (onBehalfOfUserId && c.get("user").role !== "admin") {
    return c.json(CommonErrors.forbidden(), 403);
  }

  const chunkBytes = Buffer.from(await chunkFile.arrayBuffer());
  if (chunkBytes.length > MAX_CHUNK_BYTES) {
    return c.json(CommonErrors.badRequest("Chunk exceeds 10 MB limit"), 400);
  }

  const uploadDir = join(CHUNK_TMP_BASE, `${userId}_${uploadId}`);
  await mkdir(uploadDir, { recursive: true });
  await writeFile(join(uploadDir, `chunk_${String(chunkIndex).padStart(6, "0")}`), chunkBytes);

  const isLast = chunkIndex === totalChunks - 1;
  if (!isLast) {
    return c.json(success({ received: true, complete: false }));
  }

  // Final chunk — validate partner, managed partnership, or portal entity before assembling.
  const isPortalUpload = entityType !== "";
  if (isPortalUpload && (managedPartnershipId || partnerId)) {
    await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    return c.json(
      CommonErrors.badRequest("Portal uploads cannot specify partner_id or managed_partnership_id"),
      400
    );
  }
  if (isPortalUpload && !["solo", "team", "other"].includes(entityType)) {
    await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    return c.json(CommonErrors.badRequest("Invalid entity_type"), 400);
  }

  let effectiveUserId = userId;
  if (onBehalfOfUserId) {
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, onBehalfOfUserId))
      .limit(1);
    if (!target) {
      await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
      return c.json(CommonErrors.badRequest("Target user not found"), 400);
    }
    effectiveUserId = onBehalfOfUserId;
  }

  let resolvedPartnerId: string | null = partnerId;
  let portalPlaceholderName: string | null = null;
  if (isPortalUpload) {
    if (entityType === "team") {
      if (!teamId) {
        await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
        return c.json(CommonErrors.badRequest("team_id is required for team uploads"), 400);
      }
      const [team] = await db
        .select({ identifier: teams.identifier })
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.userId, effectiveUserId)))
        .limit(1);
      if (!team) {
        await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
        return c.json(CommonErrors.badRequest("Team not found"), 400);
      }
      portalPlaceholderName = team.identifier;
    } else if (entityType === "other") {
      portalPlaceholderName = entityName;
      if (!portalPlaceholderName) {
        await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
        return c.json(CommonErrors.badRequest("entity_name is required for other uploads"), 400);
      }
    } else {
      if (entityName) {
        portalPlaceholderName = entityName;
      } else {
        const [userRow] = await db
          .select({ firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(eq(users.id, effectiveUserId))
          .limit(1);
        if (!userRow) {
          await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
          return c.json(CommonErrors.badRequest("User not found"), 400);
        }
        portalPlaceholderName = [userRow.firstName, userRow.lastName].filter(Boolean).join(" ").trim();
        if (!portalPlaceholderName) {
          await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
          return c.json(CommonErrors.badRequest("Set your name on My Profile or provide entity_name"), 400);
        }
      }
    }
  } else {
    if (managedPartnershipId && partnerId) {
      await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
      return c.json(
        CommonErrors.badRequest("Specify either partner_id or managed_partnership_id, not both"),
        400
      );
    }
    if (managedPartnershipId) {
      const ok = await assertManagedPartnershipOwned(effectiveUserId, managedPartnershipId);
      if (!ok) {
        await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
        return c.json(
          CommonErrors.badRequest("Managed partnership not found or does not belong to you"),
          400
        );
      }
    } else if (partnerId) {
      const ok = await assertPartnerOwned(effectiveUserId, partnerId);
      if (!ok) {
        await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
        return c.json(CommonErrors.badRequest("Partner not found or does not belong to you"), 400);
      }
    }
  }

  let chunkFiles: string[];
  try {
    chunkFiles = (await readdir(uploadDir)).sort();
  } catch (err) {
    logger.error({ event: "chunk_readdir_failed", category: "api", context: { userId, uploadId }, error: err });
    return c.json(error("CHUNK_ERROR", "Failed to read uploaded chunks"), 500);
  }

  if (chunkFiles.length !== totalChunks) {
    await rm(uploadDir, { recursive: true, force: true }).catch(() => {});
    return c.json(
      error(
        "CHUNK_MISSING",
        `Expected ${totalChunks} chunks but only received ${chunkFiles.length}. Please retry the upload.`
      ),
      409
    );
  }

  const parts = await Promise.all(chunkFiles.map((f) => readFile(join(uploadDir, f))));
  const assembled = Buffer.concat(parts);
  await rm(uploadDir, { recursive: true, force: true }).catch(() => {});

  if (assembled.length > MAX_ASSEMBLED_BYTES) {
    return c.json(CommonErrors.badRequest("File exceeds 100 MB limit"), 400);
  }

  // Validate the assembled file by magic bytes rather than trusting the
  // client-reported mime_type. iOS Safari sometimes sends
  // application/octet-stream for valid MP3s, and the iOS Files app picker
  // filters by its own rules that don't always match our accept= attribute
  // — so we keep the client filter loose and gate quality here instead.
  const detectedMimeType = detectAudioFormat(assembled);
  if (!detectedMimeType) {
    return c.json(
      error(
        "UNSUPPORTED_FORMAT",
        "That file doesn't look like a supported audio format. Please upload an MP3, WAV, FLAC, or M4A."
      ),
      400
    );
  }

  const now = Date.now();

  if (isPortalUpload && portalPlaceholderName) {
    const [existing] = await db
      .select({ id: partners.id })
      .from(partners)
      .where(
        and(
          eq(partners.userId, effectiveUserId),
          eq(partners.kind, entityType),
          eq(partners.firstName, portalPlaceholderName),
          eq(partners.lastName, "")
        )
      )
      .limit(1);

    let placeholderPartnerId = existing?.id;
    if (!placeholderPartnerId) {
      placeholderPartnerId = crypto.randomUUID();
      const partnerNow = Date.now();
      await db.insert(partners).values({
        id: placeholderPartnerId,
        userId: effectiveUserId,
        firstName: portalPlaceholderName,
        lastName: "",
        partnerRole: "follower",
        kind: entityType,
        createdAt: partnerNow,
        updatedAt: partnerNow,
      });
    }
    resolvedPartnerId = placeholderPartnerId;
  }

  // Create the song record now — only reached if all chunks arrived successfully.
  const songId = crypto.randomUUID();
  await db.insert(songs).values({
    id: songId,
    userId: effectiveUserId,
    partnerId: managedPartnershipId ? null : resolvedPartnerId,
    managedPartnershipId,
    displayName: routineName || originalName || null,
    originalFilename: originalName,
    processedFilename: null,
    division: division || null,
    routineName,
    personalDescriptor,
    seasonYear: null,
    driveFileId: null,
    driveFolderId: null,
    createdAt: now,
    updatedAt: now,
  });

  const [songRow] = await db.select().from(songs).where(eq(songs.id, songId)).limit(1);
  if (!songRow) return c.json(CommonErrors.internalError(), 500);

  // Return the song record immediately so the client's HTTP request completes
  // without waiting for the Google Drive upload (which can take 30–120 s for
  // large files and was causing the connection to be dropped mid-flight,
  // manifesting as "Network error — check your connection" on the client).
  //
  // The Drive upload, audio tagging, and DB update (processedFilename /
  // driveFileId) all happen in the background after the response is sent.
  // If the background upload fails, the orphaned song record is deleted so
  // the user's library stays clean; they will need to retry the upload.
  const pendingSong = mapSong({ ...songRow, partner_first_name: null, partner_last_name: null });

  buildAndUploadSong(songRow, effectiveUserId, assembled, originalName, detectedMimeType).catch(async (err) => {
    logger.error({ event: "song_background_upload_failed", category: "api", context: { songId, uploadId }, error: err });
    await db.delete(songs).where(eq(songs.id, songId)).catch((deleteErr) => {
      logger.warn({
        event: "song_cleanup_delete_failed",
        category: "api",
        context: { songId, uploadId, error: String(deleteErr) },
      });
    });
  });

  return c.json(success({ received: true, complete: true, song: pendingSong }));
});



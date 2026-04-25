import { CommonErrors, createLogger, error, success, successList } from "common-typescript-utils";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, ne, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkins, partners, queueEntries, songs, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { softDeleteOnDrive, uploadSongToDrive } from "../services/drive.js";
import { tagSongBytes } from "../services/tagger.js";

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

export const songRoutes = new Hono();
const logger = createLogger("songs-routes");

function sanitizeSegment(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_-]/g, "");
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

function inferMimeType(file: File): string {
  return file.type?.trim() || "audio/mpeg";
}

/** Calendar months 11–12 (Nov–Dec) map to the next calendar year’s season label. */
function seasonYearFromTimestamp(ms: number): string {
  const d = new Date(ms);
  const calMonth = d.getMonth() + 1;
  const year = d.getFullYear();
  const seasonYear = calMonth >= 11 ? year + 1 : year;
  return String(seasonYear);
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

function mapSong(
  row: typeof songs.$inferSelect & {
    partner_first_name?: string | null;
    partner_last_name?: string | null;
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
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    partner_first_name: row.partner_first_name ?? null,
    partner_last_name: row.partner_last_name ?? null,
  };
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

songRoutes.get("/", requireAuth, zValidator("query", listQuery), async (c) => {
  const userId = c.get("user").userId;
  const { partner_id } = c.req.valid("query");

  const visibility = or(eq(songs.userId, userId), eq(partners.linkedUserId, userId));
  const partnerFilter =
    partner_id !== undefined && partner_id !== ""
      ? and(visibility, eq(songs.partnerId, partner_id))
      : visibility;

  const rows = await db
    .select({
      song: songs,
      partner_first_name: partners.firstName,
      partner_last_name: partners.lastName,
    })
    .from(songs)
    .leftJoin(partners, eq(partners.id, songs.partnerId))
    .where(partnerFilter)
    .orderBy(desc(songs.createdAt));

  return c.json(
    successList(
      rows.map((r) =>
        mapSong({
          ...r.song,
          partner_first_name: r.partner_first_name,
          partner_last_name: r.partner_last_name,
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
    })
    .from(songs)
    .leftJoin(partners, eq(partners.id, songs.partnerId))
    .where(and(eq(songs.id, id), or(eq(songs.userId, userId), eq(partners.linkedUserId, userId))))
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
    .where(and(eq(songs.id, id), eq(songs.userId, userId)))
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
    .where(and(eq(songs.id, id), eq(songs.userId, userId)))
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Song"), 404);
  }

  const [activeHit] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .innerJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .where(eq(checkins.songId, id))
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

  if (existing.driveFileId && existing.driveFolderId) {
    try {
      await softDeleteOnDrive(existing.driveFileId, existing.driveFolderId);
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

  await db.delete(songs).where(and(eq(songs.id, id), eq(songs.userId, userId)));
  return c.body(null, 204);
});

// POST /v1/songs/:id/upload — multipart/form-data with file field
songRoutes.post("/:id/upload", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");

  // IMPORTANT: drain the request body BEFORE any database queries.
  // Railway's edge proxy has an idle write timeout (~800ms) on inbound bodies.
  // If the Node process is blocked on db queries while the proxy is waiting to
  // stream a large multipart body, the proxy gives up and the client sees
  // ERR_TIMED_OUT. Reading the body first keeps the socket draining.
  const body = await c.req.parseBody();
  const fileValue = body.file;
  const uploadedFile =
    fileValue instanceof File
      ? fileValue
      : Array.isArray(fileValue)
        ? fileValue.find((entry): entry is File => entry instanceof File)
        : null;

  if (!uploadedFile) {
    return c.json(CommonErrors.badRequest("Missing file upload field"), 400);
  }

  const originalName = uploadedFile.name?.trim() || "song.mp3";
  const mimeType = inferMimeType(uploadedFile);
  const inputBytes = Buffer.from(await uploadedFile.arrayBuffer());

  const [song] = await db
    .select()
    .from(songs)
    .where(and(eq(songs.id, id), eq(songs.userId, userId)))
    .limit(1);

  if (!song) {
    return c.json(CommonErrors.notFound("Song"), 404);
  }

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!userRow) {
    return c.json(CommonErrors.notFound("User"), 404);
  }

  let partnerRow: typeof partners.$inferSelect | null = null;
  if (song.partnerId) {
    const [p] = await db
      .select()
      .from(partners)
      .where(and(eq(partners.id, song.partnerId), eq(partners.userId, userId)))
      .limit(1);
    partnerRow = p ?? null;
  }

  const seasonYearStr = seasonYearFromTimestamp(Date.now());

  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(songs)
    .where(
      and(
        eq(songs.userId, userId),
        sql`coalesce(${songs.division}, '') = ${song.division ?? ""}`,
        sql`coalesce(${songs.routineName}, '') = ${song.routineName ?? ""}`,
        eq(songs.seasonYear, seasonYearStr),
        ne(songs.id, id)
      )
    );

  const version = (countRow?.c ?? 0) + 1;

  const userName =
    [userRow.firstName, userRow.lastName].filter(Boolean).join("") || userId;
  const partnerName = partnerRow
    ? [partnerRow.firstName, partnerRow.lastName].filter(Boolean).join("")
    : null;

  let leaderName: string;
  let followerName: string | null;

  if (!partnerRow) {
    leaderName = userName;
    followerName = null;
  } else if (partnerRow.partnerRole === "leader") {
    leaderName = partnerName ?? "";
    followerName = userName;
  } else {
    leaderName = userName;
    followerName = partnerName ?? "";
  }

  const partnershipSegment = followerName
    ? `${sanitizeSegment(leaderName)}_${sanitizeSegment(followerName)}`
    : sanitizeSegment(leaderName);

  const originalParts = splitNameAndExtension(originalName);
  const pathSegments = [
    partnershipSegment || sanitizeSegment(userId) || "user",
    sanitizeSegment(song.division),
    sanitizeSegment(seasonYearStr),
    sanitizeSegment(song.routineName),
    sanitizeSegment(song.personalDescriptor),
  ].filter((s) => s.length > 0);
  const baseWithoutVersion = pathSegments.join("_");
  const versionedStem = `${baseWithoutVersion}_v${version}`;
  const extSegment = sanitizeSegment(originalParts.ext);
  const processedFilename = extSegment ? `${versionedStem}.${extSegment}` : versionedStem;

  const newTitle = followerName ? `${leaderName} & ${followerName}` : leaderName;
  const newArtist = [song.division, seasonYearStr, song.routineName].filter(Boolean).join(" - ");

  const taggedBytes = await tagSongBytes({
    bytes: inputBytes,
    newTitle,
    newArtist,
    mimeType,
  });

  const uploadResult = await uploadSongToDrive(taggedBytes, {
    filename: processedFilename,
    mimeType,
  });

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
    .where(eq(songs.id, id));

  const [r] = await db
    .select({
      song: songs,
      partner_first_name: partners.firstName,
      partner_last_name: partners.lastName,
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
      })
    )
  );
});
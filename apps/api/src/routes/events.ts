import { CommonErrors, createLogger, success, successList } from "common-typescript-utils";
import { DIVISIONS, songEntityKey } from "@deejaytools/schemas";
import { zValidator } from "../lib/validate.js";
import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";
import {
  checkins,
  eventDivisionRunLimits,
  eventSongSubmissions,
  events,
  managedPartnerships,
  partners,
  queueEntries,
  queueEvents,
  runs,
  sessionDivisions,
  sessions,
  songs,
  users,
} from "../db/schema.js";
import { partnershipDisplay } from "../lib/entityLabel.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { enqueueDriveJob } from "../services/driveJobs.js";
import { seasonYearFromDateString } from "../lib/seasonYear.js";

const logger = createLogger("deejaytools-api");

// YYYY-MM-DD
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const seasonYearString = z.string().regex(/^\d{4}$/, "Must be a 4-digit year");

/** Validate that a string is a recognised IANA timezone identifier. */
const ianaTimezone = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid IANA timezone (e.g. 'America/Chicago')" }
  );

const createEvent = z.object({
  name: z.string().min(1),
  start_date: dateString,
  end_date: dateString,
  timezone: ianaTimezone.default("America/Chicago"),
  /** Omit to derive from start_date. */
  season_year: seasonYearString.optional(),
});

const patchEvent = z.object({
  name: z.string().min(1).optional(),
  start_date: dateString.optional(),
  end_date: dateString.optional(),
  timezone: ianaTimezone.optional(),
  season_year: seasonYearString.optional(),
});

export const eventRoutes = new Hono();

/**
 * Current calendar date in a given IANA timezone, as YYYY-MM-DD.
 *
 * The "en-CA" locale is used because it formats as YYYY-MM-DD, which compares
 * correctly as a string against the start_date / end_date columns.
 *
 * Falls back to UTC if the zone is unusable. events.timezone is validated on
 * write and defaults to America/Chicago, so this should be unreachable — but a
 * bad stored value must not turn every event listing into a 500.
 */
function todayInZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Derive status from start/end dates without storing it.
 *
 * start_date and end_date are local calendar dates for the event, so "today"
 * must be evaluated in the event's own timezone. Using the server's date (UTC
 * on Railway) marked a Chicago event "completed" at 19:00 on its final day and
 * dropped it out of the submission pages mid-event.
 *
 * timezone is required rather than defaulted: every caller has it, and a
 * silent default would reintroduce exactly this bug at a new call site.
 */
export function computeStatus(startDate: string, endDate: string, timezone: string): string {
  const today = todayInZone(timezone);
  if (today < startDate) return "upcoming";
  if (today > endDate) return "completed";
  return "active";
}

function mapEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    start_date: row.startDate,
    end_date: row.endDate,
    timezone: row.timezone,
    // Fall back for rows predating the column so consumers never see null.
    season_year: row.seasonYear ?? seasonYearFromDateString(row.startDate),
    status: computeStatus(row.startDate, row.endDate, row.timezone),
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

eventRoutes.get("/", async (c) => {
  // Sort by start_date (newest first); fall back to createdAt for stable ordering
  // when multiple events share a start_date.
  const rows = await db
    .select()
    .from(events)
    .orderBy(desc(events.startDate), desc(events.createdAt));
  return c.json(successList(rows.map(mapEvent)));
});

// Public, matching GET /v1/events: the event listing is the signed-out entry
// point to the platform, so a name and its dates must open without an account.
// The entity roster below is the part that requires auth.
eventRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row) return c.json(CommonErrors.notFound("Event"), 404);
  return c.json(success(mapEvent(row)));
});

/**
 * Display name for a competing entity, from the joined song row.
 *
 * Mirrors the label built for submissions (see admin-event-submissions.ts and
 * event-song-submissions.ts) so the same couple reads identically everywhere.
 */
function entityLabel(row: {
  managedLeaderFirst: string | null;
  managedLeaderLast: string | null;
  managedFollowerFirst: string | null;
  managedFollowerLast: string | null;
  ownerFirst: string | null;
  ownerLast: string | null;
  partnerFirst: string | null;
  partnerLast: string | null;
  partnerKind: string | null;
}): string {
  if (row.managedLeaderFirst != null) {
    const leaderName = [row.managedLeaderFirst, row.managedLeaderLast]
      .filter(Boolean)
      .join(" ")
      .trim();
    const followerName = [row.managedFollowerFirst, row.managedFollowerLast]
      .filter(Boolean)
      .join(" ")
      .trim();
    return followerName ? `${leaderName} & ${followerName}` : leaderName;
  }

  const ownerName = [row.ownerFirst, row.ownerLast].filter(Boolean).join(" ").trim();
  const partnerName = [row.partnerFirst, row.partnerLast].filter(Boolean).join(" ").trim();
  return partnershipDisplay({ ownerName, partnerName, partnerKind: row.partnerKind });
}

/**
 * Bucket for a submission with no division on either the submission or the
 * song. Matches the manager Event Songs view, which uses the same label.
 */
const UNSPECIFIED_DIVISION = "Unspecified";

/** Position in the canonical display order; Unspecified and unknowns sort last. */
function divisionOrder(division: string): number {
  if (division === UNSPECIFIED_DIVISION) return DIVISIONS.length + 1;
  const idx = (DIVISIONS as readonly string[]).indexOf(division);
  return idx === -1 ? DIVISIONS.length : idx;
}

/**
 * Entities with at least one song submitted to this event, grouped by division.
 *
 * requireAuth, unlike the event itself: who is entered is competitor-visible
 * information, not a public listing. The response deliberately carries no song
 * identity — only the entity label and how many songs it has in that division.
 * The count is the whole point of the collapse: a couple with three Classic
 * entries is one row, not three chances to read a routine name.
 */
eventRoutes.get("/:id/entities", requireAuth, async (c) => {
  const eventId = c.req.param("id");

  const [event] = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);
  if (!event) return c.json(CommonErrors.notFound("Event"), 404);

  const songOwner = alias(users, "song_owner");
  const managedPartnership = alias(managedPartnerships, "managed_partnership");

  try {
    const rows = await db
      .select({
        songUserId: songs.userId,
        songPartnerId: songs.partnerId,
        songManagedPartnershipId: songs.managedPartnershipId,
        songDivision: songs.division,
        submissionDivision: eventSongSubmissions.division,
        ownerFirst: songOwner.firstName,
        ownerLast: songOwner.lastName,
        partnerFirst: partners.firstName,
        partnerLast: partners.lastName,
        partnerKind: partners.kind,
        managedLeaderFirst: managedPartnership.leaderFirstName,
        managedLeaderLast: managedPartnership.leaderLastName,
        managedFollowerFirst: managedPartnership.followerFirstName,
        managedFollowerLast: managedPartnership.followerLastName,
      })
      .from(eventSongSubmissions)
      .innerJoin(songs, eq(songs.id, eventSongSubmissions.songId))
      .leftJoin(songOwner, eq(songOwner.id, songs.userId))
      .leftJoin(partners, eq(partners.id, songs.partnerId))
      .leftJoin(managedPartnership, eq(managedPartnership.id, songs.managedPartnershipId))
      .where(eq(eventSongSubmissions.eventId, eventId));

    // Grouped in memory rather than with GROUP BY: the entity key is a
    // three-way precedence rule that already lives in songEntityKey, and
    // duplicating it as SQL would let the two drift apart.
    const byDivision = new Map<string, Map<string, { label: string; songCount: number }>>();

    for (const row of rows) {
      // Same precedence as a submission's effective division: the per-event
      // override when set, otherwise the song's own.
      const division =
        (row.submissionDivision ?? row.songDivision ?? "").trim() || UNSPECIFIED_DIVISION;
      const key = songEntityKey({
        userId: row.songUserId,
        partnerId: row.songPartnerId,
        managedPartnershipId: row.songManagedPartnershipId,
      });

      let entities = byDivision.get(division);
      if (!entities) {
        entities = new Map();
        byDivision.set(division, entities);
      }

      const existing = entities.get(key);
      if (existing) {
        existing.songCount += 1;
      } else {
        // A row whose owner and partner names are all null still represents a
        // real entry — label it rather than emitting a blank row.
        entities.set(key, { label: entityLabel(row) || "Unnamed entry", songCount: 1 });
      }
    }

    const divisions = [...byDivision.entries()]
      .map(([division, entities]) => ({
        division,
        entities: [...entities.entries()]
          .map(([entityKey, entity]) => ({
            entity_key: entityKey,
            label: entity.label,
            song_count: entity.songCount,
          }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      }))
      .sort(
        (a, b) =>
          divisionOrder(a.division) - divisionOrder(b.division) ||
          a.division.localeCompare(b.division)
      );

    return c.json(successList(divisions));
  } catch (err) {
    logger.error({
      event: "event_entity_list_failed",
      category: "api",
      context: { eventId },
      error: err,
    });
    return c.json(CommonErrors.internalError(), 500);
  }
});

eventRoutes.post("/", requireAdmin, zValidator("json", createEvent), async (c) => {
  const body = c.req.valid("json");
  if (body.start_date > body.end_date) {
    return c.json(CommonErrors.badRequest("start_date must be on or before end_date"), 400);
  }
  const uid = c.get("user").userId;
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.insert(events).values({
    id,
    name: body.name,
    startDate: body.start_date,
    endDate: body.end_date,
    timezone: body.timezone,
    // Explicit override wins; otherwise derive from the start date.
    seasonYear: body.season_year ?? seasonYearFromDateString(body.start_date),
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return c.json(success(mapEvent(row!)), 201);
});

eventRoutes.patch("/:id", requireAdmin, zValidator("json", patchEvent), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) return c.json(CommonErrors.notFound("Event"), 404);

  const nextStart = body.start_date ?? existing.startDate;
  const nextEnd = body.end_date ?? existing.endDate;
  if (nextStart > nextEnd) {
    return c.json(CommonErrors.badRequest("start_date must be on or before end_date"), 400);
  }

  const now = Date.now();
  await db
    .update(events)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.start_date !== undefined && { startDate: body.start_date }),
      // season_year is NOT recomputed when start_date changes — it only moves
      // when set explicitly, so a deliberate override is never silently lost.
      ...(body.end_date !== undefined && { endDate: body.end_date }),
      ...(body.timezone !== undefined && { timezone: body.timezone }),
      ...(body.season_year !== undefined && { seasonYear: body.season_year }),
      updatedAt: now,
    })
    .where(eq(events.id, id));
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return c.json(success(mapEvent(row!)));
});

eventRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) return c.json(CommonErrors.notFound("Event"), 404);

  let orphanedCopyIds: string[] = [];
  await db.transaction(async (tx) => {
    const eventSessions = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.eventId, id));
    const sessionIds = eventSessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      await tx.delete(queueEntries).where(inArray(queueEntries.sessionId, sessionIds));
      await tx.delete(queueEvents).where(inArray(queueEvents.sessionId, sessionIds));
      await tx.delete(runs).where(inArray(runs.sessionId, sessionIds));
      await tx.delete(checkins).where(inArray(checkins.sessionId, sessionIds));
      await tx.delete(sessionDivisions).where(inArray(sessionDivisions.sessionId, sessionIds));
      await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
    }

    // Song submissions cascade with the event. event_song_submissions.event_id
    // is NOT NULL with no ON DELETE rule, so without this the final delete
    // below fails on the foreign key for any event that has entries.
    // Capture the Drive copies first — after the delete the file ids are gone.
    const submissionCopies = await tx
      .select({ driveCopyFileId: eventSongSubmissions.driveCopyFileId })
      .from(eventSongSubmissions)
      .where(eq(eventSongSubmissions.eventId, id));
    orphanedCopyIds = submissionCopies
      .map((r) => r.driveCopyFileId)
      .filter((v): v is string => v !== null);

    await tx.delete(eventSongSubmissions).where(eq(eventSongSubmissions.eventId, id));
    await tx.delete(eventDivisionRunLimits).where(eq(eventDivisionRunLimits.eventId, id));
    await tx.delete(events).where(eq(events.id, id));
  });

  for (const fileId of orphanedCopyIds) {
    try {
      await enqueueDriveJob(db, { kind: "trash", fileId });
    } catch (err) {
      logger.error({
        event: "drive_trash_enqueue_failed",
        category: "api",
        context: { eventId: id, driveFileId: fileId, source: "event_delete" },
        error: err,
      });
      Sentry.withScope((scope) => {
        scope.setLevel("error");
        scope.setTag("subsystem", "drive_jobs");
        scope.setTag("drive_job_kind", "trash");
        scope.setContext("drive_job", { file_id: fileId, stage: "enqueue", source: "event_delete" });
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      });
    }
  }

  return c.json(success({ deleted: true }));
});

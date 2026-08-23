import { CommonErrors, createLogger, error, success, successList } from "common-typescript-utils";
import { createEventSongSubmissionBodySchema } from "@deejaytools/schemas";
import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/index.js";
import { eventSongSubmissions, events, managedPartnerships, partners, songs, users } from "../db/schema.js";
import { buildStructuredSongLabel } from "../lib/songLabel.js";
import { partnershipDisplay } from "../lib/entityLabel.js";
import { zValidator } from "../lib/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { computeStatus } from "./events.js";

const logger = createLogger("deejaytools-api");

const listQuery = z.object({
  event_id: z.string().optional(),
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

type JoinedSubmissionRow = {
  id: string;
  eventId: string;
  songId: string;
  createdAt: number;
  eventName: string;
  eventStartDate: string;
  eventEndDate: string;
  songDivision: string | null;
  songDisplayName: string | null;
  songProcessedFilename: string | null;
  songRoutineName: string | null;
  songSeasonYear: string | null;
  ownerFirst: string | null;
  ownerLast: string | null;
  partnerFirst: string | null;
  partnerLast: string | null;
  partnerKind: string | null;
  managedLeaderFirst: string | null;
  managedLeaderLast: string | null;
  managedFollowerFirst: string | null;
  managedFollowerLast: string | null;
};

function partnershipLabel(row: {
  managedLeaderFirst: string | null;
  managedLeaderLast: string | null;
  managedFollowerFirst: string | null;
  managedFollowerLast: string | null;
  ownerFirst: string | null;
  ownerLast: string | null;
  partnerFirst: string | null;
  partnerLast: string | null;
  partnerKind?: string | null;
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

export function mapSubmissionRow(row: JoinedSubmissionRow) {
  const partnership = partnershipLabel(row);

  return {
    id: row.id,
    event_id: row.eventId,
    event_name: row.eventName,
    event_start_date: row.eventStartDate,
    event_status: computeStatus(row.eventStartDate, row.eventEndDate),
    song_id: row.songId,
    song_label: buildStructuredSongLabel({
      partnership,
      division: row.songDivision,
      seasonYear: row.songSeasonYear,
      routineName: row.songRoutineName,
      processedFilename: row.songProcessedFilename,
      displayName: row.songDisplayName,
      songId: row.songId,
    }),
    division: row.songDivision,
    created_at: row.createdAt,
  };
}

export async function fetchUserSubmissionRows(
  userId: string,
  filters?: { eventId?: string; submissionId?: string }
) {
  const songOwner = alias(users, "song_owner");
  const managedPartnership = alias(managedPartnerships, "managed_partnership");
  const conditions = [eq(eventSongSubmissions.submittedByUserId, userId)];
  if (filters?.eventId) {
    conditions.push(eq(eventSongSubmissions.eventId, filters.eventId));
  }
  if (filters?.submissionId) {
    conditions.push(eq(eventSongSubmissions.id, filters.submissionId));
  }

  return db
    .select({
      id: eventSongSubmissions.id,
      eventId: eventSongSubmissions.eventId,
      songId: eventSongSubmissions.songId,
      createdAt: eventSongSubmissions.createdAt,
      eventName: events.name,
      eventStartDate: events.startDate,
      eventEndDate: events.endDate,
      songDivision: songs.division,
      songDisplayName: songs.displayName,
      songProcessedFilename: songs.processedFilename,
      songRoutineName: songs.routineName,
      songSeasonYear: songs.seasonYear,
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
    .innerJoin(events, eq(events.id, eventSongSubmissions.eventId))
    .innerJoin(songs, eq(songs.id, eventSongSubmissions.songId))
    .leftJoin(songOwner, eq(songOwner.id, songs.userId))
    .leftJoin(partners, eq(partners.id, songs.partnerId))
    .leftJoin(managedPartnership, eq(managedPartnership.id, songs.managedPartnershipId))
    .where(and(...conditions))
    .orderBy(desc(eventSongSubmissions.createdAt));
}

export const eventSongSubmissionRoutes = new Hono();

eventSongSubmissionRoutes.get("/", requireAuth, zValidator("query", listQuery), async (c) => {
  const userId = c.get("user").userId;
  const { event_id: eventId } = c.req.valid("query");

  try {
    const rows = await fetchUserSubmissionRows(userId, eventId ? { eventId } : undefined);
    return c.json(successList(rows.map(mapSubmissionRow)));
  } catch (err) {
    logger.error({
      event: "event_song_submission_list_failed",
      category: "api",
      context: { userId, eventId: eventId ?? null },
      error: err,
    });
    return c.json(CommonErrors.internalError(), 500);
  }
});

eventSongSubmissionRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createEventSongSubmissionBodySchema),
  async (c) => {
    const userId = c.get("user").userId;
    const body = c.req.valid("json");

    const [song] = await db
      .select({ id: songs.id })
      .from(songs)
      .where(and(eq(songs.id, body.song_id), eq(songs.userId, userId)))
      .limit(1);

    if (!song) {
      return c.json(CommonErrors.notFound("Song"), 404);
    }

    const [event] = await db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, body.event_id))
      .limit(1);

    if (!event) {
      return c.json(CommonErrors.notFound("Event"), 404);
    }

    const id = crypto.randomUUID();
    const now = Date.now();

    try {
      await db.insert(eventSongSubmissions).values({
        id,
        eventId: body.event_id,
        songId: body.song_id,
        submittedByUserId: userId,
        createdAt: now,
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        return c.json(error("conflict", "That song is already submitted to this event."), 409);
      }
      logger.error({
        event: "event_song_submission_create_failed",
        category: "api",
        context: { userId, eventId: body.event_id, songId: body.song_id },
        error: err,
      });
      return c.json(CommonErrors.internalError(), 500);
    }

    const [row] = await fetchUserSubmissionRows(userId, { submissionId: id });
    return c.json(success(mapSubmissionRow(row)), 201);
  }
);

eventSongSubmissionRoutes.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: eventSongSubmissions.id })
    .from(eventSongSubmissions)
    .where(
      and(eq(eventSongSubmissions.id, id), eq(eventSongSubmissions.submittedByUserId, userId))
    )
    .limit(1);

  if (!existing) {
    return c.json(CommonErrors.notFound("Event song submission"), 404);
  }

  try {
    await db
      .delete(eventSongSubmissions)
      .where(
        and(eq(eventSongSubmissions.id, id), eq(eventSongSubmissions.submittedByUserId, userId))
      );
  } catch (err) {
    logger.error({
      event: "event_song_submission_delete_failed",
      category: "api",
      context: { userId, submissionId: id },
      error: err,
    });
    return c.json(CommonErrors.internalError(), 500);
  }

  return c.body(null, 204);
});

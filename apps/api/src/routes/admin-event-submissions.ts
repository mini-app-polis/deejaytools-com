import { CommonErrors, createLogger, successList } from "common-typescript-utils";
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/index.js";
import { eventSongSubmissions, events, partners, songs, users } from "../db/schema.js";
import { buildStructuredSongLabel } from "../lib/songLabel.js";
import { zValidator } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

const listQuery = z.object({
  event_id: z.string().min(1),
});

export const adminEventSubmissionRoutes = new Hono();

adminEventSubmissionRoutes.get(
  "/",
  requireAdmin,
  zValidator("query", listQuery),
  async (c) => {
    const { event_id: eventId } = c.req.valid("query");
    const songOwner = alias(users, "song_owner");
    const submitter = alias(users, "submitter");

    try {
      const rows = await db
        .select({
          id: eventSongSubmissions.id,
          eventId: eventSongSubmissions.eventId,
          createdAt: eventSongSubmissions.createdAt,
          eventName: events.name,
          songId: songs.id,
          songDivision: songs.division,
          songDisplayName: songs.displayName,
          songProcessedFilename: songs.processedFilename,
          songRoutineName: songs.routineName,
          songSeasonYear: songs.seasonYear,
          ownerFirst: songOwner.firstName,
          ownerLast: songOwner.lastName,
          partnerFirst: partners.firstName,
          partnerLast: partners.lastName,
          submitterEmail: submitter.email,
        })
        .from(eventSongSubmissions)
        .innerJoin(events, eq(events.id, eventSongSubmissions.eventId))
        .innerJoin(songs, eq(songs.id, eventSongSubmissions.songId))
        .leftJoin(songOwner, eq(songOwner.id, songs.userId))
        .leftJoin(partners, eq(partners.id, songs.partnerId))
        .innerJoin(submitter, eq(submitter.id, eventSongSubmissions.submittedByUserId))
        .where(eq(eventSongSubmissions.eventId, eventId))
        .orderBy(desc(eventSongSubmissions.createdAt));

      return c.json(
        successList(
          rows.map((r) => {
            const ownerName = [r.ownerFirst, r.ownerLast].filter(Boolean).join(" ").trim();
            const partnerName = [r.partnerFirst, r.partnerLast].filter(Boolean).join(" ").trim();
            const partnershipLabel = partnerName ? `${ownerName} & ${partnerName}` : ownerName;

            return {
              id: r.id,
              event_id: r.eventId,
              event_name: r.eventName,
              division: r.songDivision,
              song_id: r.songId,
              song_label: buildStructuredSongLabel({
                partnership: partnershipLabel,
                division: r.songDivision,
                seasonYear: r.songSeasonYear,
                routineName: r.songRoutineName,
                processedFilename: r.songProcessedFilename,
                displayName: r.songDisplayName,
                songId: r.songId,
              }),
              partnership_label: partnershipLabel,
              submitter_email: r.submitterEmail ?? "",
              created_at: r.createdAt,
            };
          })
        )
      );
    } catch (err) {
      logger.error({
        event: "admin_event_song_submission_list_failed",
        category: "api",
        context: { eventId },
        error: err,
      });
      return c.json(CommonErrors.internalError(), 500);
    }
  }
);

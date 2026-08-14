import { CommonErrors, createLogger, successList } from "common-typescript-utils";
import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "../db/index.js";
import { eventSongSubmissions, events, managedPartnerships, partners, songs, users } from "../db/schema.js";
import { buildStructuredSongLabel } from "../lib/songLabel.js";
import { partnershipDisplay } from "../lib/entityLabel.js";
import { zValidator } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

const listQuery = z.object({
  event_id: z.string().min(1),
});

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

export const adminEventSubmissionRoutes = new Hono();

adminEventSubmissionRoutes.get(
  "/",
  requireAdmin,
  zValidator("query", listQuery),
  async (c) => {
    const { event_id: eventId } = c.req.valid("query");
    const songOwner = alias(users, "song_owner");
    const submitter = alias(users, "submitter");
    const managedPartnership = alias(managedPartnerships, "managed_partnership");

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
          partnerKind: partners.kind,
          managedLeaderFirst: managedPartnership.leaderFirstName,
          managedLeaderLast: managedPartnership.leaderLastName,
          managedFollowerFirst: managedPartnership.followerFirstName,
          managedFollowerLast: managedPartnership.followerLastName,
          submitterEmail: submitter.email,
        })
        .from(eventSongSubmissions)
        .innerJoin(events, eq(events.id, eventSongSubmissions.eventId))
        .innerJoin(songs, eq(songs.id, eventSongSubmissions.songId))
        .leftJoin(songOwner, eq(songOwner.id, songs.userId))
        .leftJoin(partners, eq(partners.id, songs.partnerId))
        .leftJoin(managedPartnership, eq(managedPartnership.id, songs.managedPartnershipId))
        .innerJoin(submitter, eq(submitter.id, eventSongSubmissions.submittedByUserId))
        .where(eq(eventSongSubmissions.eventId, eventId))
        .orderBy(desc(eventSongSubmissions.createdAt));

      return c.json(
        successList(
          rows.map((r) => {
            const partnershipLabelValue = partnershipLabel(r);

            return {
              id: r.id,
              event_id: r.eventId,
              event_name: r.eventName,
              division: r.songDivision,
              song_id: r.songId,
              song_label: buildStructuredSongLabel({
                partnership: partnershipLabelValue,
                division: r.songDivision,
                seasonYear: r.songSeasonYear,
                routineName: r.songRoutineName,
                processedFilename: r.songProcessedFilename,
                displayName: r.songDisplayName,
                songId: r.songId,
              }),
              partnership_label: partnershipLabelValue,
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

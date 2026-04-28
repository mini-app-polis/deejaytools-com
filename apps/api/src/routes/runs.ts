import { successList } from "common-typescript-utils";
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { events, pairs, partners, runs, sessions, songs, users } from "../db/schema.js";
import { buildStructuredSongLabel } from "../lib/songLabel.js";
import { zValidator } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

export const runRoutes = new Hono();

const listQuery = z.object({
  session_id: z.string().optional(),
  event_id: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/**
 * GET /v1/runs
 *
 * Admin-only run history. Joins each run row with its session, event, song
 * (including the song's owner + partner so the structured label can be built),
 * the run's entity (pair → user + partner, or solo user), and the admin who
 * completed it. Flattens into display-ready labels for the UI.
 *
 * Query params:
 *   - session_id: filter to a single session
 *   - event_id:   filter to a single event
 *   - limit:      cap rows (default 200, max 500)
 *
 * Sort: most recent completion first.
 */
runRoutes.get("/", requireAdmin, zValidator("query", listQuery), async (c) => {
  const { session_id, event_id, limit } = c.req.valid("query");

  // Three distinct joins onto users (one for the pair's leader, one for the
  // solo entity, one for the admin who completed it, one for the song's owner)
  // and one onto partners for the song's partner. Each needs its own alias.
  const pairUser = alias(users, "pair_user");
  const soloUser = alias(users, "solo_user");
  const completedBy = alias(users, "completed_by");
  const songOwner = alias(users, "song_owner");
  const songPartnerAlias = alias(partners, "song_partner");

  const filters = [];
  if (session_id) filters.push(eq(runs.sessionId, session_id));
  if (event_id) filters.push(eq(runs.eventId, event_id));

  const rows = await db
    .select({
      id: runs.id,
      completedAt: runs.completedAt,
      divisionName: runs.divisionName,
      sessionId: runs.sessionId,
      sessionFloorTrialStartsAt: sessions.floorTrialStartsAt,
      eventId: runs.eventId,
      eventName: events.name,
      songId: runs.songId,
      songDisplayName: songs.displayName,
      songProcessedFilename: songs.processedFilename,
      songDivision: songs.division,
      songSeasonYear: songs.seasonYear,
      songRoutineName: songs.routineName,
      // Song's owner / partner — used to build the structured "Partnership" prefix.
      songOwnerFirst: songOwner.firstName,
      songOwnerLast: songOwner.lastName,
      songPartnerFirst: songPartnerAlias.firstName,
      songPartnerLast: songPartnerAlias.lastName,
      // The run's entity (which may equal the song's owner/partner, but for solo
      // runs comes from a different column entirely).
      pairUserFirst: pairUser.firstName,
      pairUserLast: pairUser.lastName,
      pairPartnerFirst: partners.firstName,
      pairPartnerLast: partners.lastName,
      soloUserFirst: soloUser.firstName,
      soloUserLast: soloUser.lastName,
      completedByFirst: completedBy.firstName,
      completedByLast: completedBy.lastName,
    })
    .from(runs)
    .leftJoin(sessions, eq(sessions.id, runs.sessionId))
    .leftJoin(events, eq(events.id, runs.eventId))
    .leftJoin(songs, eq(songs.id, runs.songId))
    .leftJoin(songOwner, eq(songOwner.id, songs.userId))
    .leftJoin(songPartnerAlias, eq(songPartnerAlias.id, songs.partnerId))
    .leftJoin(pairs, eq(pairs.id, runs.entityPairId))
    .leftJoin(pairUser, eq(pairUser.id, pairs.userAId))
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .leftJoin(soloUser, eq(soloUser.id, runs.entitySoloUserId))
    .leftJoin(completedBy, eq(completedBy.id, runs.completedByUserId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(desc(runs.completedAt))
    .limit(limit ?? 200);

  return c.json(
    successList(
      rows.map((r) => {
        // Entity (who ran): "Leader & Follower" for pairs, full name for solo.
        let entityLabel: string;
        if (r.pairUserFirst || r.pairUserLast) {
          const a = [r.pairUserFirst, r.pairUserLast].filter(Boolean).join(" ").trim();
          const b = [r.pairPartnerFirst, r.pairPartnerLast].filter(Boolean).join(" ").trim();
          entityLabel = b ? `${a} & ${b}` : a || "Pair";
        } else if (r.soloUserFirst || r.soloUserLast) {
          entityLabel = [r.soloUserFirst, r.soloUserLast].filter(Boolean).join(" ").trim();
        } else {
          entityLabel = "—";
        }

        // Song's own partnership (independent of the run's entity).
        const songOwnerName = [r.songOwnerFirst, r.songOwnerLast]
          .filter(Boolean)
          .join(" ")
          .trim();
        const songPartnerName = [r.songPartnerFirst, r.songPartnerLast]
          .filter(Boolean)
          .join(" ")
          .trim();
        const songPartnership = songPartnerName
          ? `${songOwnerName} & ${songPartnerName}`
          : songOwnerName;

        const songLabel = buildStructuredSongLabel({
          partnership: songPartnership,
          division: r.songDivision,
          seasonYear: r.songSeasonYear,
          routineName: r.songRoutineName,
          processedFilename: r.songProcessedFilename,
          displayName: r.songDisplayName,
          songId: r.songId,
        });

        const completedByLabel =
          [r.completedByFirst, r.completedByLast].filter(Boolean).join(" ").trim() || "Admin";

        return {
          id: r.id,
          completed_at: r.completedAt,
          division_name: r.divisionName,
          session_id: r.sessionId,
          session_floor_trial_starts_at: r.sessionFloorTrialStartsAt,
          event_id: r.eventId,
          event_name: r.eventName,
          song_id: r.songId,
          song_label: songLabel,
          entity_label: entityLabel,
          completed_by_label: completedByLabel,
        };
      })
    )
  );
});

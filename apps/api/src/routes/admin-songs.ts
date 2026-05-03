import { successList } from "common-typescript-utils";
import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { partners, songs, users } from "../db/schema.js";
import { buildStructuredSongLabel } from "../lib/songLabel.js";
import { zValidator } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

export const adminSongRoutes = new Hono();

const listQuery = z.object({
  /**
   * Free-text filter applied across owner + partner names, song display name,
   * processed filename, division, routine name, and season year.
   */
  q: z.string().optional(),
  /**
   * Include soft-deleted songs (default: only live rows). Use "true" to flip on.
   */
  include_deleted: z.enum(["true", "false"]).optional(),
});

/**
 * GET /v1/admin/songs
 *
 * Admin-only directory of every song in the system. Each row carries:
 *   - the structured "Partnership Division Year RoutineName v##" label
 *   - the primary owner (the uploading user) — id, email, full name
 *   - the partner record, if attached: full name plus the linked user's
 *     email when the partner has been claimed by an account
 *   - core song fields (division, routine, season year, created_at)
 *   - deleted_at so the UI can flag soft-deleted rows when include_deleted=true
 *
 * Conceptually a song has up to two owners: the uploader and the partner.
 * The partner side may be a free-text name (no DeejayTools account) or a
 * linked user account; this endpoint surfaces both shapes uniformly. Sort
 * is newest-first because new uploads are what admins want to verify after
 * the door opens at an event.
 */
adminSongRoutes.get(
  "/",
  requireAdmin,
  zValidator("query", listQuery),
  async (c) => {
    const { q, include_deleted } = c.req.valid("query");
    const includeDeleted = include_deleted === "true";

    // Three aliases onto users: the song's owner, the partner's owner (the
    // user who created the partner record), and the partner's linked user
    // (if the partner has its own account). Each is independent so we keep
    // them as separate aliases.
    const owner = alias(users, "song_owner");
    const partnerLinkedUser = alias(users, "partner_linked_user");

    const conditions = [];
    if (!includeDeleted) {
      conditions.push(isNull(songs.deletedAt));
    }
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      conditions.push(
        or(
          ilike(songs.displayName, term),
          ilike(songs.processedFilename, term),
          ilike(songs.division, term),
          ilike(songs.routineName, term),
          ilike(songs.seasonYear, term),
          ilike(owner.firstName, term),
          ilike(owner.lastName, term),
          ilike(owner.email, term),
          ilike(partners.firstName, term),
          ilike(partners.lastName, term)
        )
      );
    }

    const rows = await db
      .select({
        id: songs.id,
        displayName: songs.displayName,
        processedFilename: songs.processedFilename,
        division: songs.division,
        routineName: songs.routineName,
        seasonYear: songs.seasonYear,
        createdAt: songs.createdAt,
        deletedAt: songs.deletedAt,
        ownerId: owner.id,
        ownerEmail: owner.email,
        ownerFirst: owner.firstName,
        ownerLast: owner.lastName,
        partnerId: partners.id,
        partnerFirst: partners.firstName,
        partnerLast: partners.lastName,
        partnerLinkedUserEmail: partnerLinkedUser.email,
      })
      .from(songs)
      .leftJoin(owner, eq(owner.id, songs.userId))
      .leftJoin(partners, eq(partners.id, songs.partnerId))
      .leftJoin(partnerLinkedUser, eq(partnerLinkedUser.id, partners.linkedUserId))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(songs.createdAt));

    return c.json(
      successList(
        rows.map((r) => {
          const ownerName = [r.ownerFirst, r.ownerLast]
            .filter(Boolean)
            .join(" ")
            .trim();
          const partnerName = [r.partnerFirst, r.partnerLast]
            .filter(Boolean)
            .join(" ")
            .trim();

          // Partnership label fed into buildStructuredSongLabel — same shape
          // the runs endpoint uses so labels are visually consistent across
          // the admin UI.
          const partnership = partnerName
            ? `${ownerName} & ${partnerName}`
            : ownerName;

          const songLabel = buildStructuredSongLabel({
            partnership,
            division: r.division,
            seasonYear: r.seasonYear,
            routineName: r.routineName,
            processedFilename: r.processedFilename,
            displayName: r.displayName,
            songId: r.id,
          });

          return {
            id: r.id,
            song_label: songLabel,
            display_name: r.displayName,
            division: r.division,
            routine_name: r.routineName,
            season_year: r.seasonYear,
            created_at: r.createdAt,
            deleted_at: r.deletedAt,
            owner: {
              id: r.ownerId ?? "",
              email: r.ownerEmail ?? "",
              full_name: ownerName || null,
            },
            partner: r.partnerId
              ? {
                  id: r.partnerId,
                  full_name: partnerName || null,
                  linked_user_email: r.partnerLinkedUserEmail ?? null,
                }
              : null,
          };
        })
      )
    );
  }
);

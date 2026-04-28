/**
 * Legacy songs — read-only, intentionally public.
 *
 * This module exposes a read-only view of the historical song catalog
 * (pre-routine-system data imported from the legacy platform). No auth
 * is required because the data is already public on the marketing site
 * and includes no personally identifiable information — just
 * partnership names, division, and routine metadata.
 *
 * If this ever becomes writable or starts exposing user data, add
 * `requireAuth` middleware like the other /v1 route modules.
 */
import { createLogger, successList } from "common-typescript-utils";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, ilike, or } from "drizzle-orm";
import { bigint, index, pgTable, text } from "drizzle-orm/pg-core";
import { db } from "../db/index.js";

const logger = createLogger("legacy-songs-routes");

// Inline table def — legacy_songs is read-only and not part of the main schema.
// Exported so other modules (e.g. claim-legacy in songs.ts) can read from it.
export const legacySongs = pgTable(
  "legacy_songs",
  {
    id: text("id").primaryKey(),
    partnership: text("partnership").notNull(),
    division: text("division"),
    routineName: text("routine_name"),
    descriptor: text("descriptor"),
    version: text("version"),
    submittedAt: text("submitted_at"),
    createdAt: bigint("created_at", { mode: "number" }).notNull(),
  },
  (t) => ({
    divisionIdx: index("idx_legacy_songs_division").on(t.division),
  })
);

const listQuery = z.object({
  q: z.string().optional(),
  division: z.string().optional(),
});

export const legacySongRoutes = new Hono();

legacySongRoutes.get("/", zValidator("query", listQuery), async (c) => {
  const { q, division } = c.req.valid("query");

  const conditions = [];

  if (q && q.trim()) {
    const term = `%${q.trim()}%`;
    conditions.push(
      or(
        ilike(legacySongs.partnership, term),
        ilike(legacySongs.routineName, term)
      )
    );
  }

  if (division && division.trim()) {
    conditions.push(eq(legacySongs.division, division.trim()));
  }

  const rows = await db
    .select({
      id: legacySongs.id,
      partnership: legacySongs.partnership,
      division: legacySongs.division,
      routine_name: legacySongs.routineName,
      descriptor: legacySongs.descriptor,
      version: legacySongs.version,
      submitted_at: legacySongs.submittedAt,
    })
    .from(legacySongs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(legacySongs.partnership);

  // Most legacy entries have an empty routine name and use the version field
  // for event/season info (e.g. "The Open 2025"). Surface the version as the
  // routine when routine is missing so downstream displays — including the
  // structured song label used elsewhere — always have something useful.
  const mapped = rows.map((r) => ({
    ...r,
    routine_name: r.routine_name?.trim() || r.version?.trim() || null,
  }));

  logger.info({ event: "legacy_songs_listed", category: "api" });

  return c.json(successList(mapped));
});
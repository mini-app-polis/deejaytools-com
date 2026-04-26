import { CommonErrors, error, success, successList } from "common-typescript-utils";
import { CheckinStatusSchema, QueueTypeSchema } from "@deejaytools/schemas";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, isNull, max, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  checkins,
  eventRegistrations,
  pairs,
  partners,
  sessionDivisions,
  sessions,
  songs,
} from "../db/schema.js";
import { loadPairDisplayNames } from "../lib/pair-display.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

const listQuery = z.object({
  session_id: z.string().min(1, "session_id is required"),
});

const createBody = z
  .object({
    session_id: z.string().min(1),
    pair_id: z.string().optional(),
    partner_id: z.string().nullable().optional(),
    division: z.string().min(1),
    queue_type: QueueTypeSchema,
    song_id: z.string().optional(),
    event_registration_id: z.string().optional(),
  })
  .refine((b) => Boolean(b.pair_id?.trim()) || b.partner_id !== undefined, {
    message: "Provide pair_id or partner_id (use null for solo check-in)",
  });

const patchBody = z
  .object({
    status: CheckinStatusSchema.optional(),
    queue_position: z.number().int().min(1).optional(),
  })
  .refine((b) => b.status !== undefined || b.queue_position !== undefined, {
    message: "At least one of status or queue_position is required",
  });

const withdrawQuery = z.object({
  session_id: z.string().min(1, "session_id is required"),
});

export const checkinRoutes = new Hono();

type CheckinRow = typeof checkins.$inferSelect;

function mapCheckinBase(row: CheckinRow) {
  return {
    id: row.id,
    session_id: row.sessionId,
    event_registration_id: row.eventRegistrationId,
    pair_id: row.pairId,
    submitted_by_user_id: row.submittedByUserId,
    song_id: row.songId,
    division: row.division,
    queue_type: row.queueType,
    queue_position: row.queuePosition,
    status: row.status,
    checked_in_at: row.checkedInAt,
    last_run_at: row.lastRunAt,
  };
}

checkinRoutes.get("/", zValidator("query", listQuery), async (c) => {
  const { session_id } = c.req.valid("query");

  const rows = await db
    .select({
      id: checkins.id,
      session_id: checkins.sessionId,
      pair_id: checkins.pairId,
      submitted_by_user_id: checkins.submittedByUserId,
      song_id: checkins.songId,
      division: checkins.division,
      queue_type: checkins.queueType,
      queue_position: checkins.queuePosition,
      status: checkins.status,
      checked_in_at: checkins.checkedInAt,
      last_run_at: checkins.lastRunAt,
      processed_filename: songs.processedFilename,
    })
    .from(checkins)
    .leftJoin(songs, eq(songs.id, checkins.songId))
    .where(eq(checkins.sessionId, session_id))
    .orderBy(
      sql`(CASE WHEN ${checkins.queueType}::text = 'priority' THEN 0 ELSE 1 END)`,
      asc(checkins.queuePosition)
    );

  const pairIds = rows.map((r) => r.pair_id);
  const displayByPair = await loadPairDisplayNames(pairIds);

  const results = rows.map((r) => {
    const { processed_filename, ...rest } = r;
    return {
      ...rest,
      pair_display_name: displayByPair.get(r.pair_id) ?? "— / —",
      ...(processed_filename !== undefined && { processed_filename }),
    };
  });

  return c.json(successList(results));
});

checkinRoutes.post("/", requireAuth, zValidator("json", createBody), async (c) => {
  const auth = c.get("user");
  const body = c.req.valid("json");
  const sessionId = body.session_id;
  const now = Date.now();

  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) {
    return c.json(CommonErrors.notFound("Session"), 404);
  }
  if (session.status !== "checkin_open" && session.status !== "in_progress") {
    return c.json(
      error(
        "CHECKIN_NOT_OPEN",
        "Check-in is not open for this session (session must be checkin_open or in_progress)."
      ),
      409
    );
  }
  if (now < session.checkinOpensAt) {
    return c.json(CommonErrors.badRequest("Check-in has not opened yet"), 400);
  }
  if (now >= session.floorTrialEndsAt) {
    return c.json(CommonErrors.badRequest("Check-in has ended for this session"), 400);
  }

  const division = body.division.trim();
  if (!division) {
    return c.json(CommonErrors.badRequest("division is required"), 400);
  }

  if (division !== "Other") {
    const [divRow] = await db
      .select({ id: sessionDivisions.id })
      .from(sessionDivisions)
      .where(
        and(eq(sessionDivisions.sessionId, sessionId), eq(sessionDivisions.divisionName, division))
      )
      .limit(1);
    if (!divRow) {
      return c.json(CommonErrors.badRequest("Invalid division for this session"), 400);
    }
  }

  let pairId: string;
  const trimmedPairId = body.pair_id?.trim();
  if (trimmedPairId) {
    const [pair] = await db
      .select({ id: pairs.id })
      .from(pairs)
      .leftJoin(partners, eq(partners.id, pairs.partnerBId))
      .where(
        and(
          eq(pairs.id, trimmedPairId),
          or(eq(pairs.userAId, auth.userId), eq(partners.linkedUserId, auth.userId))
        )
      )
      .limit(1);
    if (!pair) {
      return c.json(CommonErrors.badRequest("Pair not found or you are not part of this pair"), 400);
    }
    pairId = pair.id;
  } else {
    const partnerId = body.partner_id ?? null;
    if (partnerId) {
      const [ownedPartner] = await db
        .select({ id: partners.id })
        .from(partners)
        .where(and(eq(partners.id, partnerId), eq(partners.userId, auth.userId)))
        .limit(1);
      if (!ownedPartner) {
        return c.json(CommonErrors.badRequest("Partner not found"), 400);
      }
    }
    const partnerCond = partnerId ? eq(pairs.partnerBId, partnerId) : isNull(pairs.partnerBId);
    const [existingPair] = await db
      .select({ id: pairs.id })
      .from(pairs)
      .where(and(eq(pairs.userAId, auth.userId), partnerCond))
      .limit(1);
    if (existingPair) {
      pairId = existingPair.id;
    } else {
      pairId = crypto.randomUUID();
      await db.insert(pairs).values({
        id: pairId,
        userAId: auth.userId,
        partnerBId: partnerId,
        createdAt: now,
      });
    }
  }

  let eventRegistrationId: string | null = null;
  if (body.event_registration_id?.trim()) {
    const regId = body.event_registration_id.trim();
    const [reg] = await db
      .select({ id: eventRegistrations.id })
      .from(eventRegistrations)
      .where(and(eq(eventRegistrations.id, regId), eq(eventRegistrations.userId, auth.userId)))
      .limit(1);
    if (!reg) {
      return c.json(CommonErrors.badRequest("Registration not found"), 400);
    }
    eventRegistrationId = regId;
  }

  const [activeDuplicate] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .where(
      and(
        eq(checkins.sessionId, sessionId),
        eq(checkins.pairId, pairId),
        inArray(checkins.status, ["waiting", "on_deck", "running"])
      )
    )
    .limit(1);
  if (activeDuplicate) {
    return c.json(
      error("DUPLICATE_CHECKIN", "This pair already has an active check-in for this session."),
      409
    );
  }

  if (body.queue_type === "priority") {
    const [prioRow] = await db
      .select({ c: count() })
      .from(checkins)
      .where(
        and(
          eq(checkins.sessionId, sessionId),
          eq(checkins.submittedByUserId, auth.userId),
          eq(checkins.queueType, "priority"),
          inArray(checkins.status, ["waiting", "on_deck", "running"])
        )
      );
    const priorityActive = Number(prioRow?.c ?? 0);
    if (priorityActive >= session.maxPriorityRuns) {
      return c.json(
        error("PRIORITY_LIMIT_REACHED", "Maximum priority check-ins for this session reached."),
        409
      );
    }
  }

  let songId: string | null = null;
  if (body.song_id) {
    const [song] = await db
      .select({ id: songs.id })
      .from(songs)
      .leftJoin(partners, eq(partners.id, songs.partnerId))
      .where(
        and(
          eq(songs.id, body.song_id),
          or(eq(songs.userId, auth.userId), eq(partners.linkedUserId, auth.userId))
        )
      )
      .limit(1);
    if (!song) {
      return c.json(
        CommonErrors.badRequest("Song not found or not owned or co-owned by you"),
        400
      );
    }
    songId = song.id;
  } else {
    const [defaultSong] = await db
      .select({ id: songs.id })
      .from(songs)
      .leftJoin(partners, eq(partners.id, songs.partnerId))
      .where(or(eq(songs.userId, auth.userId), eq(partners.linkedUserId, auth.userId)))
      .orderBy(desc(songs.updatedAt))
      .limit(1);
    if (!defaultSong) {
      return c.json(CommonErrors.badRequest("No song found; pass song_id or add a song first"), 400);
    }
    songId = defaultSong.id;
  }

  const [maxRow] = await db
    .select({ mx: max(checkins.queuePosition) })
    .from(checkins)
    .where(
      and(eq(checkins.sessionId, sessionId), eq(checkins.queueType, body.queue_type))
    );
  const queuePosition = (maxRow?.mx ?? 0) + 1;

  const checkinId = crypto.randomUUID();

  await db.insert(checkins).values({
    id: checkinId,
    sessionId,
    eventRegistrationId,
    pairId,
    submittedByUserId: auth.userId,
    songId,
    division,
    queueType: body.queue_type,
    queuePosition,
    status: "waiting",
    checkedInAt: now,
    lastRunAt: null,
  });

  const [created] = await db.select().from(checkins).where(eq(checkins.id, checkinId)).limit(1);
  const displayMap = await loadPairDisplayNames([pairId]);
  const pair_display_name = displayMap.get(pairId) ?? "— / —";

  return c.json(
    success({
      ...mapCheckinBase(created!),
      pair_display_name,
    }),
    201
  );
});

checkinRoutes.delete("/mine", requireAuth, zValidator("query", withdrawQuery), async (c) => {
  const auth = c.get("user");
  const { session_id } = c.req.valid("query");

  const [active] = await db
    .select({ id: checkins.id })
    .from(checkins)
    .innerJoin(pairs, eq(pairs.id, checkins.pairId))
    .where(
      and(
        eq(checkins.sessionId, session_id),
        eq(pairs.userAId, auth.userId),
        inArray(checkins.status, ["waiting", "on_deck"])
      )
    )
    .limit(1);

  if (!active) {
    return c.json(CommonErrors.notFound("Active check-in"), 404);
  }

  await db.update(checkins).set({ status: "withdrawn" }).where(eq(checkins.id, active.id));
  return c.body(null, 204);
});

checkinRoutes.patch("/:id", requireAdmin, zValidator("json", patchBody), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [row] = await db.select().from(checkins).where(eq(checkins.id, id)).limit(1);
  if (!row) {
    return c.json(CommonErrors.notFound("Check-in"), 404);
  }

  const now = Date.now();
  const updates: Partial<typeof checkins.$inferInsert> = {};
  if (body.queue_position !== undefined) {
    updates.queuePosition = body.queue_position;
  }
  if (body.status !== undefined) {
    updates.status = body.status;
    if (body.status === "running" && row.status !== "running") {
      updates.lastRunAt = now;
    }
  }

  await db.update(checkins).set(updates).where(eq(checkins.id, id));

  const [updated] = await db.select().from(checkins).where(eq(checkins.id, id)).limit(1);
  const displayMap = await loadPairDisplayNames([updated!.pairId]);
  return c.json(
    success({
      ...mapCheckinBase(updated!),
      pair_display_name: displayMap.get(updated!.pairId) ?? "— / —",
    })
  );
});

checkinRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(checkins).where(eq(checkins.id, id)).limit(1);
  if (!row) {
    return c.json(CommonErrors.notFound("Check-in"), 404);
  }

  const displayMap = await loadPairDisplayNames([row.pairId]);
  return c.json(
    success({
      ...mapCheckinBase(row),
      pair_display_name: displayMap.get(row.pairId) ?? "— / —",
    })
  );
});

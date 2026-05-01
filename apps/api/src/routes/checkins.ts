import { CommonErrors, createLogger, error, success } from "common-typescript-utils";
import { desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { checkins, events, pairs, partners, queueEntries, queueEvents, runs, sessions, songs, users } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { determineInitialQueue, loadAdmissionContext } from "../lib/queue/admission.js";
import { entityHasLiveEntry } from "../lib/queue/singleEntry.js";
import { nextBottomPosition } from "../lib/queue/compaction.js";
import { requireAuth } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

export const checkinRoutes = new Hono();

const createCheckinBody = z
  .object({
    sessionId: z.string().min(1),
    divisionName: z.string().min(1),
    entityPairId: z.string().nullish(),
    entitySoloUserId: z.string().nullish(),
    songId: z.string().min(1),
    notes: z.string().nullish(),
  })
  .refine(
    (b) =>
      (Boolean(b.entityPairId) && !b.entitySoloUserId) ||
      (!b.entityPairId && Boolean(b.entitySoloUserId)),
    { message: "Exactly one of entityPairId / entitySoloUserId must be provided" }
  );

/** POST /v1/checkins — create a new check-in for an entity in an open session. */
checkinRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createCheckinBody),
  async (c) => {
    const userId = c.get("user").userId;
    const body = c.req.valid("json");
    const now = Date.now();

    const [session] = await db
      .select({
        id: sessions.id,
        eventId: sessions.eventId,
        checkinOpensAt: sessions.checkinOpensAt,
        floorTrialEndsAt: sessions.floorTrialEndsAt,
      })
      .from(sessions)
      .where(eq(sessions.id, body.sessionId));
    if (!session) return c.json(CommonErrors.notFound("Session"), 404);
    if (now < session.checkinOpensAt)
      return c.json(CommonErrors.badRequest("Check-in has not opened yet"), 400);
    if (now > session.floorTrialEndsAt)
      return c.json(CommonErrors.badRequest("Check-in is closed for this session"), 400);

    if (body.entityPairId) {
      const [pair] = await db
        .select({ userAId: pairs.userAId, partnerBId: pairs.partnerBId })
        .from(pairs)
        .where(eq(pairs.id, body.entityPairId));
      if (!pair) return c.json(CommonErrors.badRequest("Pair not found"), 400);
      if (pair.userAId !== userId)
        return c.json(CommonErrors.badRequest("You are not a member of this pair"), 400);
    } else {
      if (body.entitySoloUserId !== userId)
        return c.json(CommonErrors.badRequest("You may only submit a solo check-in for yourself"), 400);
    }

    const entity = {
      pairId: body.entityPairId ?? undefined,
      soloUserId: body.entitySoloUserId ?? undefined,
    };
    if (await entityHasLiveEntry(entity, body.sessionId))
      return c.json(
        error("conflict", "This entity already has a live queue entry in this session"),
        409
      );

    let initialQueue: "priority" | "non_priority";
    try {
      const ctx = await loadAdmissionContext(body.sessionId, body.divisionName);
      initialQueue = await determineInitialQueue(entity, ctx);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Admission lookup failed";
      return c.json(CommonErrors.badRequest(msg), 400);
    }

    const checkinId = crypto.randomUUID();
    const queueEntryId = crypto.randomUUID();
    const queueEventRowId = crypto.randomUUID();

    try {
      await db.transaction(async (tx) => {
        await tx.insert(checkins).values({
          id: checkinId,
          sessionId: body.sessionId,
          divisionName: body.divisionName,
          entityPairId: body.entityPairId ?? null,
          entitySoloUserId: body.entitySoloUserId ?? null,
          songId: body.songId,
          submittedByUserId: userId,
          initialQueue,
          notes: body.notes ?? null,
          createdAt: now,
        });

        const position = await nextBottomPosition(tx, body.sessionId, initialQueue);

        await tx.insert(queueEntries).values({
          id: queueEntryId,
          checkinId,
          sessionId: body.sessionId,
          entityPairId: body.entityPairId ?? null,
          entitySoloUserId: body.entitySoloUserId ?? null,
          queueType: initialQueue,
          position,
          enteredQueueAt: now,
        });

        await tx.insert(queueEvents).values({
          id: queueEventRowId,
          sessionId: body.sessionId,
          checkinId,
          action: "checked_in",
          fromQueue: null,
          fromPosition: null,
          toQueue: initialQueue,
          toPosition: position,
          actorUserId: userId,
          reason: null,
          createdAt: now,
        });
      });
    } catch (err) {
      logger.error({
        event: "checkin_create_failed",
        category: "api",
        context: {
          sessionId: body.sessionId,
          divisionName: body.divisionName,
          userId,
          entityPairId: body.entityPairId ?? null,
          entitySoloUserId: body.entitySoloUserId ?? null,
        },
        error: err,
      });
      return c.json(
        error("conflict", "Check-in conflicted with concurrent activity; please retry"),
        409
      );
    }

    return c.json(
      success({
        id: checkinId,
        sessionId: body.sessionId,
        divisionName: body.divisionName,
        initialQueue,
      }),
      201
    );
  }
);

/**
 * GET /v1/checkins/mine — return the current user's check-in history (most
 * recent first, capped at 100), joined with queue status, run status, session
 * info, and song info so the UI doesn't need extra requests.
 */
checkinRoutes.get("/mine", requireAuth, async (c) => {
  const userId = c.get("user").userId;

  const pairUser = alias(users, "pair_user");

  // Collect the user's pair IDs so we can include pair check-ins.
  const userPairs = await db
    .select({ id: pairs.id })
    .from(pairs)
    .where(eq(pairs.userAId, userId));
  const pairIds = userPairs.map((p) => p.id);

  const whereClause =
    pairIds.length > 0
      ? or(
          eq(checkins.entitySoloUserId, userId),
          inArray(checkins.entityPairId, pairIds)
        )
      : eq(checkins.entitySoloUserId, userId);

  const rows = await db
    .select({
      id: checkins.id,
      sessionId: checkins.sessionId,
      sessionName: sessions.name,
      sessionFloorTrialStartsAt: sessions.floorTrialStartsAt,
      sessionStatus: sessions.status,
      eventTimezone: events.timezone,
      divisionName: checkins.divisionName,
      entityPairId: checkins.entityPairId,
      entitySoloUserId: checkins.entitySoloUserId,
      initialQueue: checkins.initialQueue,
      notes: checkins.notes,
      checkedInAt: checkins.createdAt,
      songDisplayName: songs.displayName,
      songProcessedFilename: songs.processedFilename,
      // Current queue position (null if no longer in any queue)
      queueEntryId: queueEntries.id,
      queueType: queueEntries.queueType,
      queuePosition: queueEntries.position,
      // Run completion
      runId: runs.id,
      completedAt: runs.completedAt,
      // Entity label parts
      pairUserFirst: pairUser.firstName,
      pairUserLast: pairUser.lastName,
      pairPartnerFirst: partners.firstName,
      pairPartnerLast: partners.lastName,
    })
    .from(checkins)
    .innerJoin(sessions, eq(sessions.id, checkins.sessionId))
    .leftJoin(events, eq(events.id, sessions.eventId))
    .leftJoin(songs, eq(songs.id, checkins.songId))
    .leftJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .leftJoin(runs, eq(runs.checkinId, checkins.id))
    .leftJoin(pairs, eq(pairs.id, checkins.entityPairId))
    .leftJoin(pairUser, eq(pairUser.id, pairs.userAId))
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .where(whereClause)
    .orderBy(desc(checkins.createdAt))
    .limit(100);

  const data = rows.map((r) => {
    let entityLabel: string;
    if (r.entityPairId && (r.pairUserFirst || r.pairUserLast)) {
      const a = [r.pairUserFirst, r.pairUserLast].filter(Boolean).join(" ").trim();
      const b = [r.pairPartnerFirst, r.pairPartnerLast].filter(Boolean).join(" ").trim();
      entityLabel = b ? `${a} & ${b}` : a;
    } else {
      entityLabel = "Solo";
    }

    return {
      id: r.id,
      sessionId: r.sessionId,
      sessionName: r.sessionName,
      sessionFloorTrialStartsAt: r.sessionFloorTrialStartsAt,
      sessionStatus: r.sessionStatus,
      eventTimezone: r.eventTimezone ?? null,
      divisionName: r.divisionName,
      entityLabel,
      songDisplayName: r.songDisplayName ?? null,
      songProcessedFilename: r.songProcessedFilename ?? null,
      initialQueue: r.initialQueue,
      notes: r.notes ?? null,
      checkedInAt: r.checkedInAt,
      queueEntryId: r.queueEntryId ?? null,
      queueType: r.queueType ?? null,
      queuePosition: r.queuePosition ?? null,
      hasRun: r.runId !== null,
      completedAt: r.completedAt ?? null,
    };
  });

  return c.json(success(data));
});

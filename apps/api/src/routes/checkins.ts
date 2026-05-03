import { CommonErrors, createLogger, error, success } from "common-typescript-utils";
import { and, count, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { checkins, events, pairs, partners, queueEntries, queueEvents, runs, sessions, songs, users } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { determineInitialQueue, loadAdmissionContext } from "../lib/queue/admission.js";
import { entityHasLiveEntry } from "../lib/queue/singleEntry.js";
import { nextBottomPosition, compactAfterRemoval } from "../lib/queue/compaction.js";
import { requireAuth } from "../middleware/auth.js";
import { invalidateSessionCache } from "./sessions.js";

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
 * GET /v1/checkins/mine — return the current user's active check-ins (ones
 * that still have a live queue entry). Inner-joins queue_entries so only
 * in-queue check-ins are returned — completed or withdrawn ones are excluded.
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

  // Filter on queueEntries.* so the ownership check uses the same authoritative
  // source as the has_active_checkin queries in sessions.ts.
  const whereClause =
    pairIds.length > 0
      ? or(
          eq(queueEntries.entitySoloUserId, userId),
          inArray(queueEntries.entityPairId, pairIds)
        )
      : eq(queueEntries.entitySoloUserId, userId);

  const rows = await db
    .select({
      id: checkins.id,
      sessionId: checkins.sessionId,
      eventName: events.name,
      sessionName: sessions.name,
      sessionFloorTrialStartsAt: sessions.floorTrialStartsAt,
      sessionStatus: sessions.status,
      eventTimezone: events.timezone,
      divisionName: checkins.divisionName,
      entityPairId: checkins.entityPairId,
      entitySoloUserId: checkins.entitySoloUserId,
      notes: checkins.notes,
      checkedInAt: checkins.createdAt,
      songDisplayName: songs.displayName,
      songProcessedFilename: songs.processedFilename,
      // Current queue position — always present (inner join)
      queueEntryId: queueEntries.id,
      queueType: queueEntries.queueType,
      queuePosition: queueEntries.position,
      // Entity label parts
      pairUserFirst: pairUser.firstName,
      pairUserLast: pairUser.lastName,
      pairPartnerFirst: partners.firstName,
      pairPartnerLast: partners.lastName,
    })
    .from(checkins)
    .innerJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .innerJoin(sessions, eq(sessions.id, checkins.sessionId))
    .leftJoin(events, eq(events.id, sessions.eventId))
    .leftJoin(songs, eq(songs.id, checkins.songId))
    .leftJoin(pairs, eq(pairs.id, checkins.entityPairId))
    .leftJoin(pairUser, eq(pairUser.id, pairs.userAId))
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .where(whereClause)
    .orderBy(desc(checkins.createdAt));

  // For each session the user is in, fetch how many entries are in each
  // queue type so we can compute an overall position (active → priority → standard).
  const sessionIds = [...new Set(rows.map((r) => r.sessionId))];
  const countsMap = new Map<string, { active: number; priority: number; non_priority: number }>();

  if (sessionIds.length > 0) {
    const queueCounts = await db
      .select({
        sessionId: queueEntries.sessionId,
        queueType: queueEntries.queueType,
        n: count(),
      })
      .from(queueEntries)
      .where(inArray(queueEntries.sessionId, sessionIds))
      .groupBy(queueEntries.sessionId, queueEntries.queueType);

    for (const row of queueCounts) {
      if (!countsMap.has(row.sessionId)) {
        countsMap.set(row.sessionId, { active: 0, priority: 0, non_priority: 0 });
      }
      const c = countsMap.get(row.sessionId)!;
      if (row.queueType === "active") c.active = Number(row.n);
      if (row.queueType === "priority") c.priority = Number(row.n);
      if (row.queueType === "non_priority") c.non_priority = Number(row.n);
    }
  }

  // Count runs per session per specific partnership (pair or solo).
  // Each unique pair is tracked independently — runs with partner A don't
  // affect priority for partner B. Key: `${sessionId}:${pairId|soloUserId}`.
  const runCountMap = new Map<string, number>();
  if (sessionIds.length > 0) {
    const runCountParts = [eq(runs.entitySoloUserId, userId)];
    if (pairIds.length > 0) runCountParts.push(inArray(runs.entityPairId, pairIds));

    const runCounts = await db
      .select({
        sessionId: runs.sessionId,
        entityPairId: runs.entityPairId,
        entitySoloUserId: runs.entitySoloUserId,
        n: count(),
      })
      .from(runs)
      .where(and(inArray(runs.sessionId, sessionIds), or(...runCountParts)))
      .groupBy(runs.sessionId, runs.entityPairId, runs.entitySoloUserId);

    for (const rc of runCounts) {
      const entityKey = rc.entityPairId ?? rc.entitySoloUserId;
      if (entityKey) runCountMap.set(`${rc.sessionId}:${entityKey}`, Number(rc.n));
    }
  }

  const overallPosition = (sessionId: string, queueType: string, queuePos: number): number => {
    const c = countsMap.get(sessionId) ?? { active: 0, priority: 0, non_priority: 0 };
    if (queueType === "active") return queuePos;
    if (queueType === "priority") return c.active + queuePos;
    return c.active + c.priority + queuePos;
  };

  const data = rows.map((r) => {
    let entityLabel: string;
    if (r.entityPairId && (r.pairUserFirst || r.pairUserLast)) {
      const a = [r.pairUserFirst, r.pairUserLast].filter(Boolean).join(" ").trim();
      const b = [r.pairPartnerFirst, r.pairPartnerLast].filter(Boolean).join(" ").trim();
      entityLabel = b ? `${a} & ${b}` : a;
    } else {
      entityLabel = "Solo";
    }

    const entityKey = r.entityPairId ?? r.entitySoloUserId;
    const runCount = entityKey ? (runCountMap.get(`${r.sessionId}:${entityKey}`) ?? 0) : 0;

    return {
      id: r.id,
      sessionId: r.sessionId,
      eventName: r.eventName ?? null,
      sessionName: r.sessionName,
      sessionFloorTrialStartsAt: r.sessionFloorTrialStartsAt,
      sessionStatus: r.sessionStatus,
      eventTimezone: r.eventTimezone ?? null,
      divisionName: r.divisionName,
      entityLabel,
      songDisplayName: r.songDisplayName ?? null,
      songProcessedFilename: r.songProcessedFilename ?? null,
      notes: r.notes ?? null,
      checkedInAt: r.checkedInAt,
      queueEntryId: r.queueEntryId,
      queueType: r.queueType,
      queuePosition: r.queuePosition,
      overallPosition: overallPosition(r.sessionId, r.queueType, r.queuePosition),
      runCount,
    };
  });

  return c.json(success(data));
});

/**
 * DELETE /v1/checkins/:id — self-service withdrawal.
 *
 * Lets the authenticated user remove their own check-in from the queue.
 * Ownership is verified by confirming the check-in's entitySoloUserId or
 * entityPairId (via pairs.userAId) belongs to the requesting user.
 * The queue entry is deleted, the queue is compacted, and a "withdrawn"
 * event is logged — identical to the admin-only POST /v1/queue/withdraw.
 */
checkinRoutes.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("user").userId;
  const checkinId = c.req.param("id");
  const now = Date.now();

  // Load the check-in and its live queue entry in one query.
  const [row] = await db
    .select({
      checkinId: checkins.id,
      sessionId: checkins.sessionId,
      entityPairId: checkins.entityPairId,
      entitySoloUserId: checkins.entitySoloUserId,
      queueEntryId: queueEntries.id,
      queueType: queueEntries.queueType,
      position: queueEntries.position,
    })
    .from(checkins)
    .innerJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .where(eq(checkins.id, checkinId))
    .limit(1);

  if (!row) return c.json(CommonErrors.notFound("Check-in"), 404);

  // Verify ownership: either solo user or pair led by this user.
  let owned = row.entitySoloUserId === userId;
  if (!owned && row.entityPairId) {
    const [pair] = await db
      .select({ userAId: pairs.userAId })
      .from(pairs)
      .where(eq(pairs.id, row.entityPairId))
      .limit(1);
    owned = pair?.userAId === userId;
  }

  if (!owned) return c.json(CommonErrors.forbidden(), 403);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(queueEntries).where(eq(queueEntries.id, row.queueEntryId));
      await compactAfterRemoval(tx, row.sessionId, row.queueType, row.position);

      await tx.insert(queueEvents).values({
        id: crypto.randomUUID(),
        sessionId: row.sessionId,
        checkinId: row.checkinId,
        action: "withdrawn",
        fromQueue: row.queueType,
        fromPosition: row.position,
        toQueue: null,
        toPosition: null,
        actorUserId: userId,
        reason: "self_withdrew",
        createdAt: now,
      });
    });
  } catch (err) {
    logger.error({
      event: "checkin_self_withdraw_failed",
      category: "api",
      context: { checkinId, userId },
      error: err,
    });
    return c.json(error("conflict", "Withdraw conflicted with concurrent activity; please retry"), 409);
  }

  invalidateSessionCache(row.sessionId);
  return c.json(success({ withdrawn: true }));
});

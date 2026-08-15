import { CommonErrors, createLogger, error, success } from "common-typescript-utils";
import { createCheckinBodySchema } from "@deejaytools/schemas";
import { and, count, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  checkins,
  events,
  eventSongSubmissions,
  managedPartnerships,
  pairs,
  partners,
  queueEntries,
  queueEvents,
  runs,
  sessions,
  songs,
  users,
} from "../db/schema.js";
import { partnershipDisplay } from "../lib/entityLabel.js";
import { zValidator } from "../lib/validate.js";
import { determineInitialQueue, loadAdmissionContext } from "../lib/queue/admission.js";
import type { EntityRef } from "../lib/queue/runCounts.js";
import { entityHasLiveEntry } from "../lib/queue/singleEntry.js";
import { nextBottomPosition, compactAfterRemoval } from "../lib/queue/compaction.js";
import { fillActiveQueue } from "../lib/queue/fill.js";
import { invalidateQueueCache } from "../lib/cache.js";
import { requireAuth } from "../middleware/auth.js";
import { invalidateSessionCache } from "./sessions.js";

const logger = createLogger("deejaytools-api");

export const checkinRoutes = new Hono();

/** POST /v1/checkins — create a new check-in for an entity in an open session. */
checkinRoutes.post(
  "/",
  requireAuth,
  zValidator("json", createCheckinBodySchema),
  async (c) => {
    const body = c.req.valid("json");
    const caller = c.get("user");
    const onBehalfUserId =
      typeof body.on_behalf_of_user_id === "string" && body.on_behalf_of_user_id.trim()
        ? body.on_behalf_of_user_id.trim()
        : null;
    if (onBehalfUserId && caller.role !== "admin") {
      return c.json(CommonErrors.forbidden(), 403);
    }
    const effectiveUserId = onBehalfUserId ?? caller.userId;
    if (onBehalfUserId) {
      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, onBehalfUserId))
        .limit(1);
      if (!target) return c.json(CommonErrors.badRequest("Target user not found"), 400);
    }
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

    const [song] = await db
      .select({
        id: songs.id,
        managedPartnershipId: songs.managedPartnershipId,
        partnerId: songs.partnerId,
      })
      .from(songs)
      .where(
        and(eq(songs.id, body.songId), eq(songs.userId, effectiveUserId), isNull(songs.deletedAt))
      )
      .limit(1);
    if (!song) return c.json(CommonErrors.notFound("Song"), 404);

    let entityPairId: string | null = null;
    let entitySoloUserId: string | null = null;
    let entityManagedPartnershipId: string | null = null;
    let entity: EntityRef;

    if (onBehalfUserId) {
      if (song.managedPartnershipId) {
        const [managed] = await db
          .select({ id: managedPartnerships.id, userId: managedPartnerships.userId })
          .from(managedPartnerships)
          .where(
            and(
              eq(managedPartnerships.id, song.managedPartnershipId),
              isNull(managedPartnerships.deletedAt)
            )
          )
          .limit(1);
        if (!managed || managed.userId !== effectiveUserId) {
          return c.json(CommonErrors.badRequest("Managed partnership not found"), 400);
        }
        entityManagedPartnershipId = song.managedPartnershipId;
        entity = { managedPartnershipId: song.managedPartnershipId };
      } else if (song.partnerId) {
        let [pair] = await db
          .select({ id: pairs.id })
          .from(pairs)
          .where(and(eq(pairs.userAId, effectiveUserId), eq(pairs.partnerBId, song.partnerId)))
          .limit(1);
        if (!pair) {
          const pairId = crypto.randomUUID();
          await db.insert(pairs).values({
            id: pairId,
            userAId: effectiveUserId,
            partnerBId: song.partnerId,
            createdAt: now,
          });
          pair = { id: pairId };
        }
        entityPairId = pair.id;
        entity = { pairId: pair.id };
      } else {
        entitySoloUserId = effectiveUserId;
        entity = { soloUserId: effectiveUserId };
      }
    } else if (song.managedPartnershipId) {
      const [managed] = await db
        .select({ id: managedPartnerships.id, userId: managedPartnerships.userId })
        .from(managedPartnerships)
        .where(
          and(
            eq(managedPartnerships.id, song.managedPartnershipId),
            isNull(managedPartnerships.deletedAt)
          )
        )
        .limit(1);
      if (!managed || managed.userId !== effectiveUserId) {
        return c.json(CommonErrors.badRequest("Managed partnership not found"), 400);
      }
      entityManagedPartnershipId = song.managedPartnershipId;
      entity = { managedPartnershipId: song.managedPartnershipId };
    } else if (body.entityPairId) {
      const [pair] = await db
        .select({ userAId: pairs.userAId, partnerBId: pairs.partnerBId })
        .from(pairs)
        .where(eq(pairs.id, body.entityPairId));
      if (!pair) return c.json(CommonErrors.badRequest("Pair not found"), 400);
      if (pair.userAId !== effectiveUserId)
        return c.json(CommonErrors.badRequest("You are not a member of this pair"), 400);
      entityPairId = body.entityPairId;
      entity = { pairId: body.entityPairId };
    } else if (body.entityManagedPartnershipId) {
      return c.json(
        CommonErrors.badRequest("This song is not associated with a managed partnership"),
        400
      );
    } else {
      if (body.entitySoloUserId !== effectiveUserId)
        return c.json(CommonErrors.badRequest("You may only submit a solo check-in for yourself"), 400);
      entitySoloUserId = body.entitySoloUserId ?? null;
      entity = { soloUserId: body.entitySoloUserId! };
    }

    if (await entityHasLiveEntry(entity, body.sessionId))
      return c.json(
        error("conflict", "This entity already has a live queue entry in this session"),
        409
      );

    if (session.eventId != null) {
      const [submission] = await db
        .select({ id: eventSongSubmissions.id })
        .from(eventSongSubmissions)
        .where(
          and(
            eq(eventSongSubmissions.eventId, session.eventId),
            eq(eventSongSubmissions.songId, body.songId)
          )
        )
        .limit(1);

      if (!submission) {
        logger.error({
          event: "checkin_song_not_submitted",
          category: "api",
          context: {
            sessionId: body.sessionId,
            eventId: session.eventId,
            songId: body.songId,
            userId: effectiveUserId,
          },
        });
        return c.json(
          CommonErrors.badRequest(
            "This song hasn't been submitted to this event. Add it to the event on My Content before checking in."
          ),
          400
        );
      }
    }

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
          entityPairId,
          entitySoloUserId,
          entityManagedPartnershipId,
          songId: body.songId,
          submittedByUserId: effectiveUserId,
          initialQueue,
          notes: body.notes ?? null,
          createdAt: now,
        });

        const position = await nextBottomPosition(tx, body.sessionId, initialQueue);

        await tx.insert(queueEntries).values({
          id: queueEntryId,
          checkinId,
          sessionId: body.sessionId,
          entityPairId,
          entitySoloUserId,
          entityManagedPartnershipId,
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
          actorUserId: caller.userId,
          reason: null,
          createdAt: now,
        });

        await fillActiveQueue(tx, body.sessionId, caller.userId, now);
      });
    } catch (err) {
      logger.error({
        event: "checkin_create_failed",
        category: "api",
        context: {
          sessionId: body.sessionId,
          divisionName: body.divisionName,
          userId: effectiveUserId,
          entityPairId,
          entitySoloUserId,
          entityManagedPartnershipId,
        },
        error: err,
      });
      return c.json(
        error("conflict", "Check-in conflicted with concurrent activity; please retry"),
        409
      );
    }

    invalidateQueueCache(body.sessionId);
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

  const userManagedPartnerships = await db
    .select({ id: managedPartnerships.id })
    .from(managedPartnerships)
    .where(eq(managedPartnerships.userId, userId));
  const managedPartnershipIds = userManagedPartnerships.map((p) => p.id);

  // Filter on queueEntries.* so the ownership check uses the same authoritative
  // source as the has_active_checkin queries in sessions.ts.
  const whereParts = [eq(queueEntries.entitySoloUserId, userId)];
  if (pairIds.length > 0) whereParts.push(inArray(queueEntries.entityPairId, pairIds));
  if (managedPartnershipIds.length > 0) {
    whereParts.push(inArray(queueEntries.entityManagedPartnershipId, managedPartnershipIds));
  }
  const whereClause = whereParts.length > 1 ? or(...whereParts) : whereParts[0]!;

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
      // Use queueEntries as the authoritative entity source — checkins.entity*
      // can be stale on legacy rows that pre-date the entity-column alignment fix.
      entityPairId: queueEntries.entityPairId,
      entitySoloUserId: queueEntries.entitySoloUserId,
      entityManagedPartnershipId: queueEntries.entityManagedPartnershipId,
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
      pairPartnerKind: partners.kind,
      managedLeaderFirst: managedPartnerships.leaderFirstName,
      managedLeaderLast: managedPartnerships.leaderLastName,
      managedFollowerFirst: managedPartnerships.followerFirstName,
      managedFollowerLast: managedPartnerships.followerLastName,
    })
    .from(checkins)
    .innerJoin(queueEntries, eq(queueEntries.checkinId, checkins.id))
    .innerJoin(sessions, eq(sessions.id, checkins.sessionId))
    .leftJoin(events, eq(events.id, sessions.eventId))
    .leftJoin(songs, eq(songs.id, checkins.songId))
    .leftJoin(pairs, eq(pairs.id, queueEntries.entityPairId))
    .leftJoin(pairUser, eq(pairUser.id, pairs.userAId))
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .leftJoin(
      managedPartnerships,
      eq(managedPartnerships.id, queueEntries.entityManagedPartnershipId)
    )
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
    if (managedPartnershipIds.length > 0) {
      runCountParts.push(inArray(runs.entityManagedPartnershipId, managedPartnershipIds));
    }

    const runCounts = await db
      .select({
        sessionId: runs.sessionId,
        entityPairId: runs.entityPairId,
        entitySoloUserId: runs.entitySoloUserId,
        entityManagedPartnershipId: runs.entityManagedPartnershipId,
        n: count(),
      })
      .from(runs)
      .where(and(inArray(runs.sessionId, sessionIds), or(...runCountParts)))
      .groupBy(
        runs.sessionId,
        runs.entityPairId,
        runs.entitySoloUserId,
        runs.entityManagedPartnershipId
      );

    for (const rc of runCounts) {
      const entityKey =
        rc.entityPairId ?? rc.entitySoloUserId ?? rc.entityManagedPartnershipId;
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
    if (r.entityManagedPartnershipId && r.managedLeaderFirst != null) {
      const leader = [r.managedLeaderFirst, r.managedLeaderLast].filter(Boolean).join(" ").trim();
      const follower = [r.managedFollowerFirst, r.managedFollowerLast]
        .filter(Boolean)
        .join(" ")
        .trim();
      entityLabel = follower ? `${leader} & ${follower}` : leader;
    } else if (r.entityPairId && (r.pairUserFirst || r.pairUserLast)) {
      const a = [r.pairUserFirst, r.pairUserLast].filter(Boolean).join(" ").trim();
      const b = [r.pairPartnerFirst, r.pairPartnerLast].filter(Boolean).join(" ").trim();
      entityLabel = partnershipDisplay({
        ownerName: a,
        partnerName: b,
        partnerKind: r.pairPartnerKind,
      });
    } else {
      entityLabel = "Solo";
    }

    const entityKey =
      r.entityPairId ?? r.entitySoloUserId ?? r.entityManagedPartnershipId;
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
  // Use queueEntries as the authoritative entity source — checkins.entity*
  // can be stale on legacy rows that pre-date the entity-column alignment fix.
  const [row] = await db
    .select({
      checkinId: checkins.id,
      sessionId: checkins.sessionId,
      entityPairId: queueEntries.entityPairId,
      entitySoloUserId: queueEntries.entitySoloUserId,
      entityManagedPartnershipId: queueEntries.entityManagedPartnershipId,
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
  if (!owned && row.entityManagedPartnershipId) {
    const [managed] = await db
      .select({ userId: managedPartnerships.userId })
      .from(managedPartnerships)
      .where(eq(managedPartnerships.id, row.entityManagedPartnershipId))
      .limit(1);
    owned = managed?.userId === userId;
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

      await fillActiveQueue(tx, row.sessionId, userId, now);
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
  invalidateQueueCache(row.sessionId);
  return c.json(success({ withdrawn: true }));
});

import { CommonErrors, createLogger, error, success } from "common-typescript-utils";
import { and, asc, count, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  checkins,
  pairs,
  partners,
  queueEntries,
  queueEvents,
  runs,
  sessions,
  users,
} from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { canPromoteNonPriority, canPromotePriority } from "../lib/queue/admission.js";
import { compactAfterRemoval, nextBottomPosition } from "../lib/queue/compaction.js";
import { requireAdmin } from "../middleware/auth.js";
import { responseCache, CACHE_TTL } from "../lib/cache.js";

/** Invalidate all cached queue views for a session after any mutation. */
function invalidateQueueCache(sessionId: string): void {
  responseCache.invalidatePrefix(`queue:${sessionId}:`);
}

const logger = createLogger("deejaytools-api");

export const queueRoutes = new Hono();

const promoteBody = z.object({ queueEntryId: z.string().min(1) });
const slotOneBody = z.object({
  sessionId: z.string().min(1),
  reason: z.string().nullish(),
});
const withdrawBody = z.object({
  queueEntryId: z.string().min(1),
  reason: z.string().nullish(),
});

/**
 * Sentinel errors thrown from inside the promote transaction so the outer
 * catch can return the right HTTP status without masking real DB failures.
 */
class PromoteAbortError extends Error {
  constructor(
    public readonly reason:
      | "session_not_found"
      | "priority_cap"
      | "non_priority_cap"
  ) {
    super(reason);
    this.name = "PromoteAbortError";
  }
}

/**
 * POST /v1/queue/promote — move a waiting entry (priority or non_priority) into
 * the active queue, subject to the session's cap limits.
 *
 * Concurrency safety (see ADR-004):
 *   The session row is locked with SELECT … FOR UPDATE at the start of the
 *   transaction. Any concurrent promote targeting the same session blocks until
 *   this transaction commits or rolls back, then re-reads the current counts.
 *   This prevents two simultaneous promotes from both seeing room in the active
 *   queue and both succeeding past the cap.
 *
 * Admission gates (evaluated inside the transaction, after the lock):
 *   Priority entry   → allowed when activeCount < activePriorityMax
 *   Non-priority entry → allowed when activeCount < activeNonPriorityMax
 *                        AND priorityCount === 0 (priority queue must be empty)
 *
 * PromoteAbortError is a sentinel thrown from inside the transaction so the
 * outer catch can map specific reasons to the correct HTTP status without
 * accidentally masking real DB failures (which become 409s).
 */
queueRoutes.post("/promote", requireAdmin, zValidator("json", promoteBody), async (c) => {
  const adminId = c.get("user").userId;
  const { queueEntryId } = c.req.valid("json");
  const now = Date.now();

  const [entry] = await db
    .select({
      id: queueEntries.id,
      checkinId: queueEntries.checkinId,
      sessionId: queueEntries.sessionId,
      entityPairId: queueEntries.entityPairId,
      entitySoloUserId: queueEntries.entitySoloUserId,
      queueType: queueEntries.queueType,
      position: queueEntries.position,
    })
    .from(queueEntries)
    .where(eq(queueEntries.id, queueEntryId));
  if (!entry) return c.json(CommonErrors.notFound("Queue entry"), 404);

  if (entry.queueType === "active")
    return c.json(CommonErrors.badRequest("Entry is already active"), 400);

  try {
    await db.transaction(async (tx) => {
      // Lock the session row for the duration of this transaction. Any
      // concurrent promote targeting the same session will block here and
      // re-read the up-to-date caps + counts, preventing the race where two
      // simultaneous promotes both see an empty active queue and both succeed.
      const [session] = await tx
        .select({
          activePriorityMax: sessions.activePriorityMax,
          activeNonPriorityMax: sessions.activeNonPriorityMax,
        })
        .from(sessions)
        .where(eq(sessions.id, entry.sessionId))
        .for("update");
      if (!session) throw new PromoteAbortError("session_not_found");

      // Count active and priority entries inside the transaction, after the lock,
      // so the numbers are consistent with the locked session row.
      const [activeRow] = await tx
        .select({ n: count() })
        .from(queueEntries)
        .where(and(eq(queueEntries.sessionId, entry.sessionId), eq(queueEntries.queueType, "active")));
      const [priorityRow] = await tx
        .select({ n: count() })
        .from(queueEntries)
        .where(and(eq(queueEntries.sessionId, entry.sessionId), eq(queueEntries.queueType, "priority")));

      const gate = {
        activeCount: Number(activeRow?.n ?? 0),
        priorityCount: Number(priorityRow?.n ?? 0),
        activePriorityMax: session.activePriorityMax,
        activeNonPriorityMax: session.activeNonPriorityMax,
      };

      if (entry.queueType === "priority" && !canPromotePriority(gate))
        throw new PromoteAbortError("priority_cap");
      if (entry.queueType === "non_priority" && !canPromoteNonPriority(gate))
        throw new PromoteAbortError("non_priority_cap");

      await tx.delete(queueEntries).where(eq(queueEntries.id, entry.id));
      await compactAfterRemoval(tx, entry.sessionId, entry.queueType, entry.position);

      const newPosition = await nextBottomPosition(tx, entry.sessionId, "active");
      const newId = crypto.randomUUID();
      await tx.insert(queueEntries).values({
        id: newId,
        checkinId: entry.checkinId,
        sessionId: entry.sessionId,
        entityPairId: entry.entityPairId,
        entitySoloUserId: entry.entitySoloUserId,
        queueType: "active",
        position: newPosition,
        enteredQueueAt: now,
      });

      await tx.insert(queueEvents).values({
        id: crypto.randomUUID(),
        sessionId: entry.sessionId,
        checkinId: entry.checkinId,
        action: "promoted_to_active",
        fromQueue: entry.queueType,
        fromPosition: entry.position,
        toQueue: "active",
        toPosition: newPosition,
        actorUserId: adminId,
        reason: null,
        createdAt: now,
      });
    });
  } catch (err) {
    if (err instanceof PromoteAbortError) {
      if (err.reason === "session_not_found")
        return c.json(CommonErrors.notFound("Session"), 404);
      if (err.reason === "priority_cap")
        return c.json(CommonErrors.badRequest("Active queue is at priority cap"), 400);
      return c.json(
        CommonErrors.badRequest(
          "Cannot promote non-priority while priority queue has entries or active is at non-priority cap"
        ),
        400
      );
    }
    logger.error({
      event: "queue_promote_failed",
      category: "api",
      context: { queueEntryId },
      error: err,
    });
    return c.json(error("conflict", "Promotion conflicted with concurrent activity; please retry"), 409);
  }

  invalidateQueueCache(entry.sessionId);
  return c.json(success({ promoted: true }));
});

/** Helper: load slot 1 of a session's active queue. */
async function loadSlotOne(sessionId: string) {
  const [row] = await db
    .select({
      id: queueEntries.id,
      checkinId: queueEntries.checkinId,
      entityPairId: queueEntries.entityPairId,
      entitySoloUserId: queueEntries.entitySoloUserId,
      position: queueEntries.position,
    })
    .from(queueEntries)
    .where(
      and(
        eq(queueEntries.sessionId, sessionId),
        eq(queueEntries.queueType, "active"),
        eq(queueEntries.position, 1)
      )
    );
  return row ?? null;
}

/** POST /v1/queue/complete — mark slot-1 active entry as run complete. */
queueRoutes.post("/complete", requireAdmin, zValidator("json", slotOneBody), async (c) => {
  const adminId = c.get("user").userId;
  const { sessionId, reason } = c.req.valid("json");
  const now = Date.now();

  const slotOne = await loadSlotOne(sessionId);
  if (!slotOne) return c.json(CommonErrors.badRequest("No entry currently running"), 400);

  const [checkin] = await db
    .select({
      sessionId: checkins.sessionId,
      divisionName: checkins.divisionName,
      songId: checkins.songId,
    })
    .from(checkins)
    .where(eq(checkins.id, slotOne.checkinId));
  if (!checkin) return c.json(CommonErrors.notFound("Check-in"), 404);

  const [session] = await db
    .select({ eventId: sessions.eventId })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  try {
    await db.transaction(async (tx) => {
      await tx.delete(queueEntries).where(eq(queueEntries.id, slotOne.id));
      await compactAfterRemoval(tx, sessionId, "active", slotOne.position);

      await tx.insert(runs).values({
        id: crypto.randomUUID(),
        checkinId: slotOne.checkinId,
        sessionId,
        eventId: session?.eventId ?? null,
        divisionName: checkin.divisionName,
        entityPairId: slotOne.entityPairId,
        entitySoloUserId: slotOne.entitySoloUserId,
        songId: checkin.songId,
        completedAt: now,
        completedByUserId: adminId,
      });

      await tx.insert(queueEvents).values({
        id: crypto.randomUUID(),
        sessionId,
        checkinId: slotOne.checkinId,
        action: "run_completed",
        fromQueue: "active",
        fromPosition: 1,
        toQueue: null,
        toPosition: null,
        actorUserId: adminId,
        reason: reason ?? null,
        createdAt: now,
      });
    });
  } catch (err) {
    logger.error({
      event: "queue_complete_failed",
      category: "api",
      context: { sessionId },
      error: err,
    });
    return c.json(error("conflict", "Completion conflicted with concurrent activity; please retry"), 409);
  }

  invalidateQueueCache(sessionId);
  return c.json(success({ completed: true }));
});

/** POST /v1/queue/incomplete — rotate slot-1 active entry to bottom of active. */
queueRoutes.post("/incomplete", requireAdmin, zValidator("json", slotOneBody), async (c) => {
  const adminId = c.get("user").userId;
  const { sessionId, reason } = c.req.valid("json");
  const now = Date.now();

  const slotOne = await loadSlotOne(sessionId);
  if (!slotOne) return c.json(CommonErrors.badRequest("No entry currently running"), 400);

  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: queueEntries.id, position: queueEntries.position })
        .from(queueEntries)
        .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, "active")))
        .orderBy(asc(queueEntries.position));

      const first = rows[0];
      if (!first || first.position !== 1) {
        throw new Error("slot_one_missing");
      }

      const n = rows.length;
      // 2_000_000 is a safe out-of-range position — active queues never grow
      // anywhere near this size, so it cannot collide with any real position
      // while we shift the other entries down by one.
      const sentinel = 2_000_000;
      await tx
        .update(queueEntries)
        .set({ position: sentinel })
        .where(eq(queueEntries.id, first.id));

      for (const row of rows) {
        if (row.position > 1) {
          await tx
            .update(queueEntries)
            .set({ position: row.position - 1 })
            .where(eq(queueEntries.id, row.id));
        }
      }

      await tx
        .update(queueEntries)
        .set({ position: n, enteredQueueAt: now })
        .where(eq(queueEntries.id, first.id));

      await tx.insert(queueEvents).values({
        id: crypto.randomUUID(),
        sessionId,
        checkinId: slotOne.checkinId,
        action: "run_incomplete_rotated",
        fromQueue: "active",
        fromPosition: 1,
        toQueue: "active",
        toPosition: n,
        actorUserId: adminId,
        reason: reason ?? null,
        createdAt: now,
      });
    });
  } catch (e) {
    if (e instanceof Error && e.message === "slot_one_missing") {
      return c.json(CommonErrors.badRequest("No entry currently running"), 400);
    }
    logger.error({
      event: "queue_incomplete_failed",
      category: "api",
      context: { sessionId },
      error: e,
    });
    return c.json(error("conflict", "Rotation conflicted with concurrent activity; please retry"), 409);
  }

  invalidateQueueCache(sessionId);
  return c.json(success({ rotated: true }));
});

/** POST /v1/queue/withdraw — remove a queue entry from any queue without recording a run. */
queueRoutes.post("/withdraw", requireAdmin, zValidator("json", withdrawBody), async (c) => {
  const adminId = c.get("user").userId;
  const { queueEntryId, reason } = c.req.valid("json");
  const now = Date.now();

  const [entry] = await db
    .select({
      id: queueEntries.id,
      checkinId: queueEntries.checkinId,
      sessionId: queueEntries.sessionId,
      queueType: queueEntries.queueType,
      position: queueEntries.position,
    })
    .from(queueEntries)
    .where(eq(queueEntries.id, queueEntryId));
  if (!entry) return c.json(CommonErrors.notFound("Queue entry"), 404);

  try {
    await db.transaction(async (tx) => {
      await tx.delete(queueEntries).where(eq(queueEntries.id, entry.id));
      await compactAfterRemoval(tx, entry.sessionId, entry.queueType, entry.position);

      await tx.insert(queueEvents).values({
        id: crypto.randomUUID(),
        sessionId: entry.sessionId,
        checkinId: entry.checkinId,
        action: "withdrawn",
        fromQueue: entry.queueType,
        fromPosition: entry.position,
        toQueue: null,
        toPosition: null,
        actorUserId: adminId,
        reason: reason ?? null,
        createdAt: now,
      });
    });
  } catch (err) {
    logger.error({
      event: "queue_withdraw_failed",
      category: "api",
      context: {
        queueEntryId,
        entry_session_id: entry.sessionId,
        entry_queue_type: entry.queueType,
        entry_position: entry.position,
      },
      error: err,
    });
    return c.json(error("conflict", "Withdraw conflicted with concurrent activity; please retry"), 409);
  }

  invalidateQueueCache(entry.sessionId);
  return c.json(success({ withdrawn: true }));
});

/**
 * Internal: list a queue's entries with check-in details and a server-rendered
 * entity label so the UI doesn't have to resolve names client-side. Joins
 * through pairs → leader user + follower partner for pair entities, and
 * directly to users for solo entities.
 *
 * Each returned item has the shape:
 * ```
 * {
 *   queueEntryId:     string          // queue_entries.id
 *   checkinId:        string
 *   position:         number          // 1-based; lower = closer to front
 *   enteredQueueAt:   number          // ms epoch when placed in this queue
 *   entityPairId:     string | null
 *   entitySoloUserId: string | null
 *   entityLabel:      string          // "Leader & Follower", "Solo Name", or "—"
 *   divisionName:     string
 *   songId:           string | null
 *   notes:            string | null
 *   initialQueue:     string          // queue the entity checked into originally
 *   checkedInAt:      number          // ms epoch of check-in creation
 * }
 * ```
 * The `/waiting` endpoint adds a `subQueue: "priority" | "non_priority"` field
 * so the UI can render the two sections without a second request.
 */
async function listQueue(sessionId: string, queueType: "priority" | "non_priority" | "active") {
  const pairUser = alias(users, "pair_user");
  const soloUser = alias(users, "solo_user");

  const rows = await db
    .select({
      queueEntryId: queueEntries.id,
      checkinId: queueEntries.checkinId,
      position: queueEntries.position,
      enteredQueueAt: queueEntries.enteredQueueAt,
      entityPairId: queueEntries.entityPairId,
      entitySoloUserId: queueEntries.entitySoloUserId,
      divisionName: checkins.divisionName,
      songId: checkins.songId,
      notes: checkins.notes,
      initialQueue: checkins.initialQueue,
      checkedInAt: checkins.createdAt,
      pairUserFirst: pairUser.firstName,
      pairUserLast: pairUser.lastName,
      pairPartnerFirst: partners.firstName,
      pairPartnerLast: partners.lastName,
      soloUserFirst: soloUser.firstName,
      soloUserLast: soloUser.lastName,
    })
    .from(queueEntries)
    .innerJoin(checkins, eq(queueEntries.checkinId, checkins.id))
    .leftJoin(pairs, eq(pairs.id, queueEntries.entityPairId))
    .leftJoin(pairUser, eq(pairUser.id, pairs.userAId))
    .leftJoin(partners, eq(partners.id, pairs.partnerBId))
    .leftJoin(soloUser, eq(soloUser.id, queueEntries.entitySoloUserId))
    .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, queueType)))
    .orderBy(asc(queueEntries.position));

  return rows.map((r) => {
    let entityLabel: string;
    if (r.entityPairId && (r.pairUserFirst || r.pairUserLast)) {
      const a = [r.pairUserFirst, r.pairUserLast].filter(Boolean).join(" ").trim();
      const b = [r.pairPartnerFirst, r.pairPartnerLast].filter(Boolean).join(" ").trim();
      entityLabel = b ? `${a} & ${b}` : a;
    } else if (r.entitySoloUserId && (r.soloUserFirst || r.soloUserLast)) {
      entityLabel = [r.soloUserFirst, r.soloUserLast].filter(Boolean).join(" ").trim();
    } else {
      entityLabel = "—";
    }
    return {
      queueEntryId: r.queueEntryId,
      checkinId: r.checkinId,
      position: r.position,
      enteredQueueAt: r.enteredQueueAt,
      entityPairId: r.entityPairId,
      entitySoloUserId: r.entitySoloUserId,
      entityLabel,
      divisionName: r.divisionName,
      songId: r.songId,
      notes: r.notes,
      initialQueue: r.initialQueue,
      checkedInAt: r.checkedInAt,
    };
  });
}

/** GET /v1/queue/:sessionId/active */
queueRoutes.get("/:sessionId/active", async (c) => {
  const sessionId = c.req.param("sessionId");
  const cacheKey = `queue:${sessionId}:active`;
  const cached = responseCache.get<ReturnType<typeof success>>(cacheKey);
  if (cached) return c.json(cached);
  const data = await listQueue(sessionId, "active");
  const result = success(data);
  responseCache.set(cacheKey, result, CACHE_TTL.QUEUE);
  return c.json(result);
});

/**
 * GET /v1/queue/:sessionId/waiting — public combined waiting queue (priority then non-priority).
 * Returns entries tagged with their sub-queue so the UI can distinguish them.
 */
queueRoutes.get("/:sessionId/waiting", async (c) => {
  const sessionId = c.req.param("sessionId");
  const cacheKey = `queue:${sessionId}:waiting`;
  const cached = responseCache.get<ReturnType<typeof success>>(cacheKey);
  if (cached) return c.json(cached);
  const [priorityRows, nonPriorityRows] = await Promise.all([
    listQueue(sessionId, "priority"),
    listQueue(sessionId, "non_priority"),
  ]);
  const data = [
    ...priorityRows.map((r) => ({ ...r, subQueue: "priority" as const })),
    ...nonPriorityRows.map((r) => ({ ...r, subQueue: "non_priority" as const })),
  ];
  const result = success(data);
  responseCache.set(cacheKey, result, CACHE_TTL.QUEUE);
  return c.json(result);
});

/** GET /v1/queue/:sessionId/priority */
queueRoutes.get("/:sessionId/priority", requireAdmin, async (c) => {
  const sessionId = c.req.param("sessionId");
  const cacheKey = `queue:${sessionId}:priority`;
  const cached = responseCache.get<ReturnType<typeof success>>(cacheKey);
  if (cached) return c.json(cached);
  const data = await listQueue(sessionId, "priority");
  const result = success(data);
  responseCache.set(cacheKey, result, CACHE_TTL.QUEUE);
  return c.json(result);
});

/** GET /v1/queue/:sessionId/non-priority */
queueRoutes.get("/:sessionId/non-priority", requireAdmin, async (c) => {
  const sessionId = c.req.param("sessionId");
  const cacheKey = `queue:${sessionId}:non-priority`;
  const cached = responseCache.get<ReturnType<typeof success>>(cacheKey);
  if (cached) return c.json(cached);
  const data = await listQueue(sessionId, "non_priority");
  const result = success(data);
  responseCache.set(cacheKey, result, CACHE_TTL.QUEUE);
  return c.json(result);
});

import { CommonErrors, error, success } from "common-typescript-utils";
import { and, asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db/index.js";
import { checkins, queueEntries, queueEvents, runs, sessions } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { canPromoteNonPriority, canPromotePriority } from "../lib/queue/admission.js";
import { compactAfterRemoval, nextBottomPosition } from "../lib/queue/compaction.js";
import { requireAdmin } from "../middleware/auth.js";

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

/** Counts active and priority entries for a session. */
async function getQueueCounts(sessionId: string) {
  const [active] = await db
    .select({ n: count() })
    .from(queueEntries)
    .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, "active")));
  const [priority] = await db
    .select({ n: count() })
    .from(queueEntries)
    .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, "priority")));
  return { activeCount: active?.n ?? 0, priorityCount: priority?.n ?? 0 };
}

/** POST /v1/queue/promote — move a priority or non-priority entry into active. */
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

  const [session] = await db
    .select({
      activePriorityMax: sessions.activePriorityMax,
      activeNonPriorityMax: sessions.activeNonPriorityMax,
    })
    .from(sessions)
    .where(eq(sessions.id, entry.sessionId));
  if (!session) return c.json(CommonErrors.notFound("Session"), 404);

  const counts = await getQueueCounts(entry.sessionId);
  const gate = {
    activeCount: counts.activeCount,
    priorityCount: counts.priorityCount,
    activePriorityMax: session.activePriorityMax,
    activeNonPriorityMax: session.activeNonPriorityMax,
  };

  if (entry.queueType === "priority" && !canPromotePriority(gate))
    return c.json(CommonErrors.badRequest("Active queue is at priority cap"), 400);
  if (entry.queueType === "non_priority" && !canPromoteNonPriority(gate))
    return c.json(
      CommonErrors.badRequest(
        "Cannot promote non-priority while priority queue has entries or active is at non-priority cap"
      ),
      400
    );

  try {
    await db.transaction(async (tx) => {
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
  } catch {
    return c.json(error("conflict", "Promotion conflicted with concurrent activity; please retry"), 409);
  }

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
  } catch {
    return c.json(error("conflict", "Completion conflicted with concurrent activity; please retry"), 409);
  }

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
    return c.json(error("conflict", "Rotation conflicted with concurrent activity; please retry"), 409);
  }

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
  } catch {
    return c.json(error("conflict", "Withdraw conflicted with concurrent activity; please retry"), 409);
  }

  return c.json(success({ withdrawn: true }));
});

/** Internal: list a queue's entries with check-in details. */
async function listQueue(sessionId: string, queueType: "priority" | "non_priority" | "active") {
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
    })
    .from(queueEntries)
    .innerJoin(checkins, eq(queueEntries.checkinId, checkins.id))
    .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, queueType)))
    .orderBy(asc(queueEntries.position));
  return rows;
}

/** GET /v1/queue/:sessionId/active */
queueRoutes.get("/:sessionId/active", async (c) => {
  const sessionId = c.req.param("sessionId");
  const data = await listQueue(sessionId, "active");
  return c.json(success(data));
});

/**
 * GET /v1/queue/:sessionId/waiting — public combined waiting queue (priority then non-priority).
 * Returns entries tagged with their sub-queue so the UI can distinguish them.
 */
queueRoutes.get("/:sessionId/waiting", async (c) => {
  const sessionId = c.req.param("sessionId");
  const [priorityRows, nonPriorityRows] = await Promise.all([
    listQueue(sessionId, "priority"),
    listQueue(sessionId, "non_priority"),
  ]);
  const data = [
    ...priorityRows.map((r) => ({ ...r, subQueue: "priority" as const })),
    ...nonPriorityRows.map((r) => ({ ...r, subQueue: "non_priority" as const })),
  ];
  return c.json(success(data));
});

/** GET /v1/queue/:sessionId/priority */
queueRoutes.get("/:sessionId/priority", requireAdmin, async (c) => {
  const sessionId = c.req.param("sessionId");
  const data = await listQueue(sessionId, "priority");
  return c.json(success(data));
});

/** GET /v1/queue/:sessionId/non-priority */
queueRoutes.get("/:sessionId/non-priority", requireAdmin, async (c) => {
  const sessionId = c.req.param("sessionId");
  const data = await listQueue(sessionId, "non_priority");
  return c.json(success(data));
});

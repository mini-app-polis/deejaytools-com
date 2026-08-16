import { and, asc, count, eq } from "drizzle-orm";
import { queueEntries, queueEvents, sessions } from "../../db/schema.js";
import type { DbTransaction } from "./compaction.js";
import { compactAfterRemoval, nextBottomPosition } from "./compaction.js";
import { canPromoteNonPriority, canPromotePriority, type PromotionGate } from "./admission.js";

/** The session fields fillActiveQueue needs, read under a FOR UPDATE lock. */
export interface LockedSession {
  id: string;
  status: (typeof sessions.$inferSelect)["status"];
  activePriorityMax: number;
  activeNonPriorityMax: number;
  floorTrialStartsAt: number;
  floorTrialEndsAt: number;
}

/**
 * Lock a session row FOR UPDATE and return the fields fillActiveQueue needs.
 * MUST be the FIRST statement of any transaction that will call
 * fillActiveQueue, so the session lock is always taken before any
 * queue_entries row lock (single global lock order → serialized fills, no
 * deadlocks). Returns null if the session doesn't exist.
 */
export async function lockSessionForFill(
  tx: DbTransaction,
  sessionId: string
): Promise<LockedSession | null> {
  const [row] = await tx
    .select({
      id: sessions.id,
      status: sessions.status,
      activePriorityMax: sessions.activePriorityMax,
      activeNonPriorityMax: sessions.activeNonPriorityMax,
      floorTrialStartsAt: sessions.floorTrialStartsAt,
      floorTrialEndsAt: sessions.floorTrialEndsAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .for("update");
  return row ?? null;
}

/**
 * Auto-fill the active queue for a running floor-trial session.
 *
 * The caller MUST have already locked `session` via lockSessionForFill in this
 * transaction and pass it in. Promotes waiting entries (priority first, then
 * standard) into the active queue until the caps are reached or no eligible
 * waiting entry remains. Admission rules are identical to the manual
 * POST /v1/queue/promote.
 *
 * Gated to the live floor-trial window: does nothing unless the session is
 * within [floorTrialStartsAt, floorTrialEndsAt) and not cancelled — matching
 * deriveSessionStatus()'s "in_progress" definition. Check-ins that arrive
 * before the trial starts accumulate in the waiting queues and are filled when
 * the trial opens (by the scheduler's next pass).
 *
 * actorUserId is who triggered the fill (admin completing/withdrawing, or the
 * member checking in). Pass null for the scheduler.
 *
 * Returns the number of entries promoted (0 when nothing was eligible).
 */
export async function fillActiveQueue(
  tx: DbTransaction,
  session: LockedSession,
  actorUserId: string | null,
  now: number
): Promise<number> {
  if (session.status === "cancelled") return 0;
  // Wall-clock gate — persisted status may lag, so derive liveness from the
  // trial window the same way deriveSessionStatus() does.
  if (now < session.floorTrialStartsAt || now >= session.floorTrialEndsAt) return 0;

  const sessionId = session.id;
  let promoted = 0;
  // Defensive iteration cap. Each successful pass moves exactly one waiting
  // entry to active, so this terminates naturally well before the bound.
  for (let guard = 0; guard < 10_000; guard++) {
    const [activeRow] = await tx
      .select({ n: count() })
      .from(queueEntries)
      .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, "active")));
    const [priorityRow] = await tx
      .select({ n: count() })
      .from(queueEntries)
      .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, "priority")));

    const gate: PromotionGate = {
      activeCount: Number(activeRow?.n ?? 0),
      priorityCount: Number(priorityRow?.n ?? 0),
      activePriorityMax: session.activePriorityMax,
      activeNonPriorityMax: session.activeNonPriorityMax,
    };

    // Priority first (only if a priority entry is waiting and the priority cap
    // has room); otherwise a standard entry (only when priority is empty and
    // the standard cap has room). Priority waiting + priority cap full → stop,
    // exactly like the manual gate.
    let fromQueue: "priority" | "non_priority" | null = null;
    if (gate.priorityCount > 0 && canPromotePriority(gate)) {
      fromQueue = "priority";
    } else if (canPromoteNonPriority(gate)) {
      fromQueue = "non_priority";
    }
    if (!fromQueue) break;

    const [next] = await tx
      .select({
        id: queueEntries.id,
        checkinId: queueEntries.checkinId,
        entityPairId: queueEntries.entityPairId,
        entitySoloUserId: queueEntries.entitySoloUserId,
        entityManagedPartnershipId: queueEntries.entityManagedPartnershipId,
        position: queueEntries.position,
      })
      .from(queueEntries)
      .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, fromQueue)))
      .orderBy(asc(queueEntries.position))
      .limit(1);

    // canPromoteNonPriority can be true with an empty standard queue — bail.
    if (!next) break;

    await tx.delete(queueEntries).where(eq(queueEntries.id, next.id));
    await compactAfterRemoval(tx, sessionId, fromQueue, next.position);

    const newPosition = await nextBottomPosition(tx, sessionId, "active");
    await tx.insert(queueEntries).values({
      id: crypto.randomUUID(),
      checkinId: next.checkinId,
      sessionId,
      entityPairId: next.entityPairId,
      entitySoloUserId: next.entitySoloUserId,
      entityManagedPartnershipId: next.entityManagedPartnershipId,
      queueType: "active",
      position: newPosition,
      enteredQueueAt: now,
    });

    await tx.insert(queueEvents).values({
      id: crypto.randomUUID(),
      sessionId,
      checkinId: next.checkinId,
      action: "promoted_to_active",
      fromQueue,
      fromPosition: next.position,
      toQueue: "active",
      toPosition: newPosition,
      actorUserId,
      reason: null,
      createdAt: now,
    });

    promoted++;
  }

  return promoted;
}

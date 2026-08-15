import { and, asc, count, eq } from "drizzle-orm";
import { queueEntries, queueEvents, sessions } from "../../db/schema.js";
import type { DbTransaction } from "./compaction.js";
import { compactAfterRemoval, nextBottomPosition } from "./compaction.js";
import { canPromoteNonPriority, canPromotePriority, type PromotionGate } from "./admission.js";

/**
 * Auto-fill the active queue for a running floor-trial session.
 *
 * Promotes waiting entries (priority first, then standard) into the active
 * queue until the caps are reached or no eligible waiting entry remains.
 * Admission rules are identical to the manual POST /v1/queue/promote.
 *
 * MUST be called inside a transaction. Locks the session row FOR UPDATE so
 * concurrent fills / promotes for the same session serialize (see promote()
 * in routes/queue.ts, ADR-004).
 *
 * Gated to the live floor-trial window: does nothing unless the session is
 * within [floorTrialStartsAt, floorTrialEndsAt) and not cancelled — matching
 * deriveSessionStatus()'s "in_progress" definition. Check-ins that arrive
 * before the trial starts simply accumulate in the waiting queues and are
 * filled when the trial opens (via the cron backstop).
 *
 * actorUserId is the user who triggered the fill (the admin completing /
 * withdrawing, or the member checking in). Pass null for the cron backstop.
 *
 * Returns the number of entries promoted (0 when nothing was eligible).
 */
export async function fillActiveQueue(
  tx: DbTransaction,
  sessionId: string,
  actorUserId: string | null,
  now: number
): Promise<number> {
  const [session] = await tx
    .select({
      status: sessions.status,
      activePriorityMax: sessions.activePriorityMax,
      activeNonPriorityMax: sessions.activeNonPriorityMax,
      floorTrialStartsAt: sessions.floorTrialStartsAt,
      floorTrialEndsAt: sessions.floorTrialEndsAt,
    })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .for("update");

  if (!session) return 0;
  if (session.status === "cancelled") return 0;
  // Wall-clock gate — persisted status may lag the cron, so derive liveness
  // from the trial window the same way deriveSessionStatus() does.
  if (now < session.floorTrialStartsAt || now >= session.floorTrialEndsAt) return 0;

  let promoted = 0;
  // Defensive iteration cap. Each successful pass moves exactly one waiting
  // entry to active, so this terminates naturally well before the bound; the
  // guard only exists to contain a hypothetical logic bug.
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

    // Priority first (only if a priority entry is actually waiting and the
    // priority cap has room); otherwise a standard entry (only when priority
    // is empty and the standard cap has room). If priority entries are waiting
    // but the priority cap is full, we stop — standard stays blocked, exactly
    // like the manual gate.
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

    // canPromoteNonPriority can be true with an empty standard queue — bail out.
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

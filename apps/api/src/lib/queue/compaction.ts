import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { queueEntries } from "../../db/schema.js";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type QueueType = "priority" | "non_priority" | "active";

/**
 * After deleting a queue_entries row at `removedPosition`, shift everything below
 * up by one. Caller is responsible for invoking this inside the same transaction
 * as the delete.
 */
export async function compactAfterRemoval(
  tx: DbTransaction,
  sessionId: string,
  queueType: QueueType,
  removedPosition: number
): Promise<void> {
  await tx
    .update(queueEntries)
    .set({ position: sql`${queueEntries.position} - 1` })
    .where(
      and(
        eq(queueEntries.sessionId, sessionId),
        eq(queueEntries.queueType, queueType),
        gt(queueEntries.position, removedPosition)
      )
    );
}

/**
 * Returns the next position to use when appending to the bottom of a queue.
 * Caller must read inside the same transaction as the subsequent insert.
 */
export async function nextBottomPosition(
  tx: DbTransaction,
  sessionId: string,
  queueType: QueueType
): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`COALESCE(MAX(${queueEntries.position}), 0)` })
    .from(queueEntries)
    .where(and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.queueType, queueType)));
  return (row?.max ?? 0) + 1;
}

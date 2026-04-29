import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../../db/index.js";
import { queueEntries } from "../../db/schema.js";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type QueueType = "priority" | "non_priority" | "active";

/**
 * After deleting a queue_entries row at `removedPosition`, shift everything below
 * up by one. Caller is responsible for invoking this inside the same transaction
 * as the delete.
 *
 * Uses a two-step approach: first move affected rows to large sentinel positions
 * (avoiding any unique constraint clash with existing rows), then shift them to
 * their final positions. This prevents the duplicate-key race that occurs when
 * a concurrent transaction has already compacted the same queue.
 */
export async function compactAfterRemoval(
  tx: DbTransaction,
  sessionId: string,
  queueType: QueueType,
  removedPosition: number
): Promise<void> {
  // Fetch affected rows ordered from lowest to highest position.
  const rows = await tx
    .select({ id: queueEntries.id, position: queueEntries.position })
    .from(queueEntries)
    .where(
      and(
        eq(queueEntries.sessionId, sessionId),
        eq(queueEntries.queueType, queueType),
        gt(queueEntries.position, removedPosition)
      )
    )
    .orderBy(asc(queueEntries.position));

  if (rows.length === 0) return;

  // Step 1: move each row to a sentinel position (position + 1_000_000) so
  // the target positions are unoccupied before we fill them.
  // 1_000_000 is chosen because queue positions are 1-based integers that grow
  // by 1 per entry. A queue would never have anywhere near 1 000 000 entries in
  // practice, so position + 1_000_000 is always safely above any real position
  // in the same queue and cannot collide with another row.
  for (const row of rows) {
    await tx
      .update(queueEntries)
      .set({ position: row.position + 1_000_000 })
      .where(eq(queueEntries.id, row.id));
  }

  // Step 2: move each row to its final compacted position (original - 1).
  for (const row of rows) {
    await tx
      .update(queueEntries)
      .set({ position: row.position - 1 })
      .where(eq(queueEntries.id, row.id));
  }
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

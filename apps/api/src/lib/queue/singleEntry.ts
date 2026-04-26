import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { queueEntries } from "../../db/schema.js";
import type { EntityRef } from "./runCounts.js";

/**
 * Returns true if the entity already has a live queue_entries row in this session.
 * Used to reject duplicate check-ins; the partial unique indexes also enforce this
 * at the DB level, but the application-side check produces a clean 409 response
 * rather than an integrity error.
 */
export async function entityHasLiveEntry(entity: EntityRef, sessionId: string): Promise<boolean> {
  const filter = entity.pairId
    ? and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.entityPairId, entity.pairId))
    : and(eq(queueEntries.sessionId, sessionId), eq(queueEntries.entitySoloUserId, entity.soloUserId!));

  const [row] = await db.select({ id: queueEntries.id }).from(queueEntries).where(filter).limit(1);
  return Boolean(row);
}

import { and, count, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { runs } from "../../db/schema.js";

export interface EntityRef {
  pairId?: string;
  soloUserId?: string;
  managedPartnershipId?: string;
}

function entityFilter(entity: EntityRef) {
  if (entity.pairId) return eq(runs.entityPairId, entity.pairId);
  if (entity.managedPartnershipId) {
    return eq(runs.entityManagedPartnershipId, entity.managedPartnershipId);
  }
  return eq(runs.entitySoloUserId, entity.soloUserId!);
}

/**
 * Count of completed runs for an entity in a division within a single session.
 * Used by the admission predicate to decide priority vs non-priority at check-in.
 */
export async function runsForEntityInSession(
  entity: EntityRef,
  sessionId: string,
  divisionName: string
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.sessionId, sessionId), eq(runs.divisionName, divisionName), entityFilter(entity)));
  return row?.n ?? 0;
}

/**
 * Count of completed runs for an entity in a division across all sessions of a single event.
 * Used by the admission predicate when an event-level run limit is configured.
 */
export async function runsForEntityInEvent(
  entity: EntityRef,
  eventId: string,
  divisionName: string
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.eventId, eventId), eq(runs.divisionName, divisionName), entityFilter(entity)));
  return row?.n ?? 0;
}

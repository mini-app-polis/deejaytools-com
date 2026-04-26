import { and, count, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { runs } from "../../db/schema.js";

export interface EntityRef {
  pairId?: string;
  soloUserId?: string;
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
  const entityFilter = entity.pairId
    ? eq(runs.entityPairId, entity.pairId)
    : eq(runs.entitySoloUserId, entity.soloUserId!);

  const [row] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.sessionId, sessionId), eq(runs.divisionName, divisionName), entityFilter));
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
  const entityFilter = entity.pairId
    ? eq(runs.entityPairId, entity.pairId)
    : eq(runs.entitySoloUserId, entity.soloUserId!);

  const [row] = await db
    .select({ n: count() })
    .from(runs)
    .where(and(eq(runs.eventId, eventId), eq(runs.divisionName, divisionName), entityFilter));
  return row?.n ?? 0;
}

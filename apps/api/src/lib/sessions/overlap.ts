import { and, eq, gt, lt, ne } from "drizzle-orm";
import { db } from "../../db/index.js";
import { sessions } from "../../db/schema.js";

/**
 * Returns true if the given [start, end) window overlaps any existing session
 * in the same event other than `excludeSessionId` (used when updating an existing
 * session and you want to exclude that row from the overlap check).
 *
 * Sessions in different events may overlap. Sessions in the same event may not.
 */
export async function sessionOverlapsInEvent(opts: {
  eventId: string;
  startTime: number;
  endTime: number;
  excludeSessionId?: string;
}): Promise<boolean> {
  const conditions = [
    eq(sessions.eventId, opts.eventId),
    lt(sessions.floorTrialStartsAt, opts.endTime),
    gt(sessions.floorTrialEndsAt, opts.startTime),
  ];
  if (opts.excludeSessionId) conditions.push(ne(sessions.id, opts.excludeSessionId));

  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(...conditions))
    .limit(1);

  return Boolean(row);
}

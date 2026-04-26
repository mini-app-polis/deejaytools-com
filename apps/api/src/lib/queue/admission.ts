import { and, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { eventDivisionRunLimits, sessionDivisions, sessions } from "../../db/schema.js";
import { runsForEntityInEvent, runsForEntityInSession, type EntityRef } from "./runCounts.js";

export type InitialQueue = "priority" | "non_priority";

export interface AdmissionContext {
  sessionId: string;
  eventId: string | null;
  divisionName: string;
  isDivisionPriority: boolean;
  sessionPriorityRunLimit: number;
  eventPriorityRunLimit: number | null;
}

/**
 * Computes which queue a fresh check-in should land in.
 *
 * Predicate (ADR-004):
 *   priority IFF
 *     session_division.is_priority
 *     AND runs_this_session(entity, division) < session_division.priority_run_limit
 *     AND (event_limit is null OR runs_this_event(entity, division) < event_limit)
 */
export async function determineInitialQueue(
  entity: EntityRef,
  ctx: AdmissionContext
): Promise<InitialQueue> {
  if (!ctx.isDivisionPriority) return "non_priority";

  const sessionRuns = await runsForEntityInSession(entity, ctx.sessionId, ctx.divisionName);
  if (sessionRuns >= ctx.sessionPriorityRunLimit) return "non_priority";

  if (ctx.eventPriorityRunLimit !== null && ctx.eventId) {
    const eventRuns = await runsForEntityInEvent(entity, ctx.eventId, ctx.divisionName);
    if (eventRuns >= ctx.eventPriorityRunLimit) return "non_priority";
  }

  return "priority";
}

/** Loads admission context for a session+division combo. Throws if division isn't in the session. */
export async function loadAdmissionContext(
  sessionId: string,
  divisionName: string
): Promise<AdmissionContext> {
  const [session] = await db
    .select({ id: sessions.id, eventId: sessions.eventId })
    .from(sessions)
    .where(eq(sessions.id, sessionId));

  if (!session) throw new Error("Session not found");

  const [division] = await db
    .select({
      isPriority: sessionDivisions.isPriority,
      priorityRunLimit: sessionDivisions.priorityRunLimit,
    })
    .from(sessionDivisions)
    .where(
      and(eq(sessionDivisions.sessionId, sessionId), eq(sessionDivisions.divisionName, divisionName))
    );

  if (!division) throw new Error("Division not configured for this session");

  let eventPriorityRunLimit: number | null = null;
  if (session.eventId) {
    const [eventLimit] = await db
      .select({ priorityRunLimit: eventDivisionRunLimits.priorityRunLimit })
      .from(eventDivisionRunLimits)
      .where(
        and(
          eq(eventDivisionRunLimits.eventId, session.eventId),
          eq(eventDivisionRunLimits.divisionName, divisionName)
        )
      );
    eventPriorityRunLimit = eventLimit?.priorityRunLimit ?? null;
  }

  return {
    sessionId,
    eventId: session.eventId,
    divisionName,
    isDivisionPriority: division.isPriority,
    sessionPriorityRunLimit: division.priorityRunLimit,
    eventPriorityRunLimit,
  };
}

export interface PromotionGate {
  activeCount: number;
  priorityCount: number;
  activePriorityMax: number;
  activeNonPriorityMax: number;
}

/** Returns true iff a priority-queue entry can be promoted to active right now. */
export function canPromotePriority(g: PromotionGate): boolean {
  return g.activeCount < g.activePriorityMax;
}

/** Returns true iff a non-priority-queue entry can be promoted to active right now. */
export function canPromoteNonPriority(g: PromotionGate): boolean {
  return g.activeCount < g.activeNonPriorityMax && g.priorityCount === 0;
}

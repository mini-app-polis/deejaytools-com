import { CommonErrors, error, success, successList } from "common-typescript-utils";
import { SessionStatusSchema } from "@deejaytools/schemas";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkins, events, pairs, queueEntries, sessionDivisions, sessions } from "../db/schema.js";
import { getOptionalSyncedUserId } from "../lib/optional-user.js";
import { sessionOverlapsInEvent } from "../lib/sessions/overlap.js";
import { requireAdmin } from "../middleware/auth.js";

const divisionItemSchema = z.object({
  division_name: z.string(),
  is_priority: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  priority_run_limit: z.number().int().min(0).optional(),
});

const createSessionBody = z.object({
  event_id: z.string().optional(),
  name: z.string().min(1),
  date: z.string().optional(),
  checkin_opens_at: z.number(),
  floor_trial_starts_at: z.number(),
  floor_trial_ends_at: z.number(),
  active_priority_max: z.number().int().min(0).optional(),
  active_non_priority_max: z.number().int().min(0).optional(),
  divisions: z.array(divisionItemSchema),
});

const patchSessionBody = z.object({
  name: z.string().min(1).optional(),
  date: z.string().nullable().optional(),
  event_id: z.string().nullable().optional(),
  checkin_opens_at: z.number().optional(),
  floor_trial_starts_at: z.number().optional(),
  floor_trial_ends_at: z.number().optional(),
  active_priority_max: z.number().int().min(0).optional(),
  active_non_priority_max: z.number().int().min(0).optional(),
});

const putDivisionsBody = z.object({
  divisions: z.array(divisionItemSchema),
});

const listQuery = z.object({
  event_id: z.string().optional(),
});

const statusBody = z.object({
  status: SessionStatusSchema,
});

export const sessionRoutes = new Hono();

/** Convert epoch ms to "YYYY-MM-DD" (UTC). */
function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Validate that session timestamps fall within the event's date range. */
async function validateSessionWithinEvent(
  eventId: string,
  checkinOpensAt: number,
  floorTrialEndsAt: number
): Promise<string | null> {
  const [ev] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!ev) return "Event not found";
  const sessionStart = msToDate(checkinOpensAt);
  const sessionEnd = msToDate(floorTrialEndsAt);
  if (sessionStart < ev.startDate) {
    return `Session starts (${sessionStart}) before event start date (${ev.startDate})`;
  }
  if (sessionEnd > ev.endDate) {
    return `Session ends (${sessionEnd}) after event end date (${ev.endDate})`;
  }
  return null;
}

type SessionRow = typeof sessions.$inferSelect;
type DivisionRow = typeof sessionDivisions.$inferSelect;

/**
 * Status returned to clients is computed at response time so it's always
 * correct relative to the wall clock — independent of whether the
 * tickSessionStatuses cron has run recently. The persisted DB status is
 * still updated by the cron (used for any side effects); we only override
 * the display value here. "cancelled" is a manual admin override and is
 * always preserved.
 */
function deriveSessionStatus(row: SessionRow, now: number): SessionRow["status"] {
  if (row.status === "cancelled") return "cancelled";
  if (now < row.checkinOpensAt) return "scheduled";
  if (now < row.floorTrialStartsAt) return "checkin_open";
  if (now < row.floorTrialEndsAt) return "in_progress";
  return "completed";
}

function mapSessionBase(row: SessionRow, now: number = Date.now()) {
  return {
    id: row.id,
    event_id: row.eventId,
    name: row.name,
    date: row.date,
    checkin_opens_at: row.checkinOpensAt,
    floor_trial_starts_at: row.floorTrialStartsAt,
    floor_trial_ends_at: row.floorTrialEndsAt,
    active_priority_max: row.activePriorityMax,
    active_non_priority_max: row.activeNonPriorityMax,
    status: deriveSessionStatus(row, now),
    created_by: row.createdBy,
    created_at: row.createdAt,
  };
}

function mapDivision(d: DivisionRow) {
  return {
    id: d.id,
    division_name: d.divisionName,
    is_priority: d.isPriority,
    sort_order: d.sortOrder,
    priority_run_limit: d.priorityRunLimit,
  };
}

async function loadQueueDepthsForSession(sessionId: string) {
  const rows = await db
    .select({
      queueType: queueEntries.queueType,
      c: count(),
    })
    .from(queueEntries)
    .where(eq(queueEntries.sessionId, sessionId))
    .groupBy(queueEntries.queueType);
  const depth = { priority: 0, non_priority: 0, active: 0 };
  for (const r of rows) {
    const n = Number(r.c ?? 0);
    if (r.queueType === "priority") depth.priority = n;
    else if (r.queueType === "non_priority") depth.non_priority = n;
    else if (r.queueType === "active") depth.active = n;
  }
  return depth;
}

async function loadQueueDepthsForSessions(sessionIds: string[]) {
  const map = new Map<string, { priority: number; non_priority: number; active: number }>();
  if (sessionIds.length === 0) return map;
  for (const id of sessionIds) {
    map.set(id, { priority: 0, non_priority: 0, active: 0 });
  }
  const rows = await db
    .select({
      sessionId: queueEntries.sessionId,
      queueType: queueEntries.queueType,
      c: count(),
    })
    .from(queueEntries)
    .where(inArray(queueEntries.sessionId, sessionIds))
    .groupBy(queueEntries.sessionId, queueEntries.queueType);
  for (const r of rows) {
    if (!r.sessionId) continue;
    const e = map.get(r.sessionId);
    if (!e) continue;
    const n = Number(r.c ?? 0);
    if (r.queueType === "priority") e.priority = n;
    else if (r.queueType === "non_priority") e.non_priority = n;
    else if (r.queueType === "active") e.active = n;
  }
  return map;
}

async function loadDivisionsForSession(sessionId: string): Promise<DivisionRow[]> {
  return db
    .select()
    .from(sessionDivisions)
    .where(eq(sessionDivisions.sessionId, sessionId))
    .orderBy(asc(sessionDivisions.sortOrder));
}

async function loadDivisionsForSessions(sessionIds: string[]): Promise<Map<string, DivisionRow[]>> {
  const map = new Map<string, DivisionRow[]>();
  if (sessionIds.length === 0) return map;
  const all = await db
    .select()
    .from(sessionDivisions)
    .where(inArray(sessionDivisions.sessionId, sessionIds))
    .orderBy(asc(sessionDivisions.sessionId), asc(sessionDivisions.sortOrder));

  for (const id of sessionIds) {
    map.set(id, []);
  }
  for (const row of all) {
    map.get(row.sessionId)?.push(row);
  }
  return map;
}

sessionRoutes.get("/", zValidator("query", listQuery), async (c) => {
  const { event_id } = c.req.valid("query");
  const userId = await getOptionalSyncedUserId(c);

  // Sort by session date (newest first), then by floor-trial start time within
  // a single date so multiple sessions on the same day order by time-of-day.
  const rows = event_id
    ? await db
        .select()
        .from(sessions)
        .where(eq(sessions.eventId, event_id))
        .orderBy(desc(sessions.date), desc(sessions.floorTrialStartsAt))
    : await db
        .select()
        .from(sessions)
        .orderBy(desc(sessions.date), desc(sessions.floorTrialStartsAt));

  const sessionIds = rows.map((r) => r.id);
  const divisionsBySession = await loadDivisionsForSessions(sessionIds);
  const queueMap = await loadQueueDepthsForSessions(sessionIds);

  let activeSet = new Set<string>();
  if (userId && sessionIds.length > 0) {
    const userPairs = await db.select({ id: pairs.id }).from(pairs).where(eq(pairs.userAId, userId));
    const pairIds = userPairs.map((p) => p.id);
    const liveParts = [
      eq(checkins.entitySoloUserId, userId),
      eq(checkins.submittedByUserId, userId),
    ];
    if (pairIds.length > 0) {
      liveParts.push(inArray(checkins.entityPairId, pairIds));
    }
    const live = await db
      .select({ sessionId: queueEntries.sessionId })
      .from(queueEntries)
      .innerJoin(checkins, eq(checkins.id, queueEntries.checkinId))
      .where(and(inArray(queueEntries.sessionId, sessionIds), or(...liveParts)));
    activeSet = new Set(live.map((l) => l.sessionId!).filter(Boolean));
  }

  const results = rows.map((row) => {
    const divs = (divisionsBySession.get(row.id) ?? []).map(mapDivision);
    const depth = queueMap.get(row.id) ?? { priority: 0, non_priority: 0, active: 0 };
    const base = {
      ...mapSessionBase(row),
      divisions: divs,
      queue_depth: depth,
    };
    if (!userId) return base;
    return { ...base, has_active_checkin: activeSet.has(row.id) };
  });

  return c.json(successList(results));
});

sessionRoutes.post("/", requireAdmin, zValidator("json", createSessionBody), async (c) => {
  const body = c.req.valid("json");
  const uid = c.get("user").userId;
  const now = Date.now();
  const id = crypto.randomUUID();
  const activePriorityMax = body.active_priority_max ?? 6;
  const activeNonPriorityMax = body.active_non_priority_max ?? 4;

  if (
    !body.name.trim() ||
    body.checkin_opens_at <= 0 ||
    body.floor_trial_starts_at <= 0 ||
    body.floor_trial_ends_at <= 0
  ) {
    return c.json(
      CommonErrors.badRequest(
        "Missing or invalid required fields: name, checkin_opens_at, floor_trial_starts_at, floor_trial_ends_at"
      ),
      400
    );
  }

  if (activeNonPriorityMax > activePriorityMax) {
    return c.json(
      CommonErrors.badRequest("active_non_priority_max must be <= active_priority_max"),
      400
    );
  }

  const eventId = body.event_id ?? null;
  if (eventId) {
    const overlaps = await sessionOverlapsInEvent({
      eventId,
      startTime: body.floor_trial_starts_at,
      endTime: body.floor_trial_ends_at,
    });
    if (overlaps) {
      return c.json(
        CommonErrors.badRequest("Session floor-trial window overlaps another session in this event"),
        400
      );
    }
    const dateErr = await validateSessionWithinEvent(
      eventId,
      body.checkin_opens_at,
      body.floor_trial_ends_at
    );
    if (dateErr) {
      return c.json(CommonErrors.badRequest(dateErr), 400);
    }
  }

  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id,
      eventId,
      name: body.name.trim(),
      date: body.date ?? null,
      checkinOpensAt: body.checkin_opens_at,
      floorTrialStartsAt: body.floor_trial_starts_at,
      floorTrialEndsAt: body.floor_trial_ends_at,
      activePriorityMax,
      activeNonPriorityMax,
      status: "scheduled",
      createdBy: uid,
      createdAt: now,
    });

    for (let i = 0; i < body.divisions.length; i++) {
      const d = body.divisions[i]!;
      const name = d.division_name.trim();
      if (!name || name === "Other") continue;
      const isPriority = d.is_priority ?? false;
      const sortOrder = d.sort_order ?? i;
      const priorityRunLimit = d.priority_run_limit ?? 0;
      await tx.insert(sessionDivisions).values({
        id: crypto.randomUUID(),
        sessionId: id,
        divisionName: name,
        isPriority,
        priorityRunLimit,
        sortOrder,
      });
    }
  });

  const [created] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const divs = (await loadDivisionsForSession(id)).map(mapDivision);
  const depth = await loadQueueDepthsForSession(id);
  return c.json(
    success({
      ...mapSessionBase(created!),
      divisions: divs,
      queue_depth: depth,
    }),
    201
  );
});

sessionRoutes.put(
  "/:id/divisions",
  requireAdmin,
  zValidator("json", putDivisionsBody),
  async (c) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const [existing] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    if (!existing) {
      return c.json(CommonErrors.notFound("Session"), 404);
    }

    await db.transaction(async (tx) => {
      await tx.delete(sessionDivisions).where(eq(sessionDivisions.sessionId, id));
      for (let i = 0; i < body.divisions.length; i++) {
        const d = body.divisions[i]!;
        const name = d.division_name.trim();
        if (!name || name === "Other") continue;
        const isPriority = d.is_priority ?? false;
        const sortOrder = d.sort_order ?? i;
        const priorityRunLimit = d.priority_run_limit ?? 0;
        await tx.insert(sessionDivisions).values({
          id: crypto.randomUUID(),
          sessionId: id,
          divisionName: name,
          isPriority,
          priorityRunLimit,
          sortOrder,
        });
      }
    });

    const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    const divs = (await loadDivisionsForSession(id)).map(mapDivision);
    const depth = await loadQueueDepthsForSession(id);
    return c.json(
      success({
        ...mapSessionBase(row!),
        divisions: divs,
        queue_depth: depth,
      })
    );
  }
);

sessionRoutes.patch("/:id/status", requireAdmin, zValidator("json", statusBody), async (c) => {
  const id = c.req.param("id");
  const { status } = c.req.valid("json");
  const [existing] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!existing) {
    return c.json(CommonErrors.notFound("Session"), 404);
  }
  await db.update(sessions).set({ status }).where(eq(sessions.id, id));
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const divs = (await loadDivisionsForSession(id)).map(mapDivision);
  const depth = await loadQueueDepthsForSession(id);
  return c.json(
    success({
      ...mapSessionBase(row!),
      divisions: divs,
      queue_depth: depth,
    })
  );
});

sessionRoutes.patch("/:id", requireAdmin, zValidator("json", patchSessionBody), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!existing) {
    return c.json(CommonErrors.notFound("Session"), 404);
  }

  const updates: Partial<typeof sessions.$inferInsert> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.date !== undefined) updates.date = body.date;
  if (body.event_id !== undefined) updates.eventId = body.event_id;
  if (body.checkin_opens_at !== undefined) updates.checkinOpensAt = body.checkin_opens_at;
  if (body.floor_trial_starts_at !== undefined) {
    updates.floorTrialStartsAt = body.floor_trial_starts_at;
  }
  if (body.floor_trial_ends_at !== undefined) {
    updates.floorTrialEndsAt = body.floor_trial_ends_at;
  }
  if (body.active_priority_max !== undefined) updates.activePriorityMax = body.active_priority_max;
  if (body.active_non_priority_max !== undefined) {
    updates.activeNonPriorityMax = body.active_non_priority_max;
  }

  const nextEventId = body.event_id !== undefined ? body.event_id : existing.eventId;
  const nextStart =
    body.floor_trial_starts_at !== undefined
      ? body.floor_trial_starts_at
      : existing.floorTrialStartsAt;
  const nextEnd =
    body.floor_trial_ends_at !== undefined ? body.floor_trial_ends_at : existing.floorTrialEndsAt;

  if (updates.activePriorityMax !== undefined || updates.activeNonPriorityMax !== undefined) {
    const apm = updates.activePriorityMax ?? existing.activePriorityMax;
    const anpm = updates.activeNonPriorityMax ?? existing.activeNonPriorityMax;
    if (anpm > apm) {
      return c.json(
        CommonErrors.badRequest("active_non_priority_max must be <= active_priority_max"),
        400
      );
    }
  }

  if (nextEventId) {
    const overlaps = await sessionOverlapsInEvent({
      eventId: nextEventId,
      startTime: nextStart,
      endTime: nextEnd,
      excludeSessionId: id,
    });
    if (overlaps) {
      return c.json(
        CommonErrors.badRequest("Session floor-trial window overlaps another session in this event"),
        400
      );
    }
    const nextCheckinOpensAt =
      body.checkin_opens_at !== undefined ? body.checkin_opens_at : existing.checkinOpensAt;
    const dateErr = await validateSessionWithinEvent(nextEventId, nextCheckinOpensAt, nextEnd);
    if (dateErr) {
      return c.json(CommonErrors.badRequest(dateErr), 400);
    }
  }

  if (Object.keys(updates).length > 0) {
    await db.update(sessions).set(updates).where(eq(sessions.id, id));
  }

  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const divs = (await loadDivisionsForSession(id)).map(mapDivision);
  const depth = await loadQueueDepthsForSession(id);
  return c.json(
    success({
      ...mapSessionBase(row!),
      divisions: divs,
      queue_depth: depth,
    })
  );
});

sessionRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const [existing] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!existing) {
    return c.json(CommonErrors.notFound("Session"), 404);
  }

  const [cntRow] = await db
    .select({ c: count() })
    .from(checkins)
    .where(eq(checkins.sessionId, id));

  if (Number(cntRow?.c ?? 0) > 0) {
    return c.json(
      error(
        "CONFLICT",
        "This session has check-ins. Remove or complete all check-ins before deleting the session."
      ),
      409
    );
  }

  await db.transaction(async (tx) => {
    await tx.delete(sessionDivisions).where(eq(sessionDivisions.sessionId, id));
    await tx.delete(sessions).where(eq(sessions.id, id));
  });

  return c.json(success({ deleted: true }));
});

sessionRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  if (!row) {
    return c.json(CommonErrors.notFound("Session"), 404);
  }

  const divs = (await loadDivisionsForSession(id)).map(mapDivision);
  const depth = await loadQueueDepthsForSession(id);

  const userId = await getOptionalSyncedUserId(c);
  let has_active_checkin: boolean | undefined;
  let active_checkin_division: string | undefined;
  if (userId) {
    const userPairs = await db.select({ id: pairs.id }).from(pairs).where(eq(pairs.userAId, userId));
    const pairIds = userPairs.map((p) => p.id);
    const parts = [
      eq(checkins.entitySoloUserId, userId),
      eq(checkins.submittedByUserId, userId),
    ];
    if (pairIds.length > 0) parts.push(inArray(checkins.entityPairId, pairIds));

    const [hit] = await db
      .select({ divisionName: checkins.divisionName })
      .from(queueEntries)
      .innerJoin(checkins, eq(checkins.id, queueEntries.checkinId))
      .where(and(eq(queueEntries.sessionId, id), or(...parts)))
      .limit(1);

    if (hit) {
      has_active_checkin = true;
      active_checkin_division = hit.divisionName;
    } else {
      has_active_checkin = false;
    }
  }

  return c.json(
    success({
      ...mapSessionBase(row),
      divisions: divs,
      queue_depth: depth,
      ...(has_active_checkin !== undefined && { has_active_checkin }),
      ...(active_checkin_division !== undefined && { active_checkin_division }),
    })
  );
});

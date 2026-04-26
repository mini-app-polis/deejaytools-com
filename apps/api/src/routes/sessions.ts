import { CommonErrors, error, success, successList } from "common-typescript-utils";
import { SessionStatusSchema } from "@deejaytools/schemas";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  checkins,
  floorSlots,
  sessionDivisions,
  sessions,
} from "../db/schema.js";
import { getOptionalSyncedUserId } from "../lib/optional-user.js";
import { requireAdmin } from "../middleware/auth.js";

const divisionItemSchema = z.object({
  division_name: z.string(),
  is_priority: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

const createSessionBody = z.object({
  event_id: z.string().optional(),
  name: z.string().min(1),
  date: z.string().optional(),
  checkin_opens_at: z.number(),
  floor_trial_starts_at: z.number(),
  floor_trial_ends_at: z.number(),
  max_slots: z.number().int().min(1).optional(),
  max_priority_runs: z.number().int().min(0).optional(),
  divisions: z.array(divisionItemSchema),
});

const patchSessionBody = z.object({
  name: z.string().min(1).optional(),
  date: z.string().nullable().optional(),
  event_id: z.string().nullable().optional(),
  checkin_opens_at: z.number().optional(),
  floor_trial_starts_at: z.number().optional(),
  floor_trial_ends_at: z.number().optional(),
  max_slots: z.number().int().min(1).optional(),
  max_priority_runs: z.number().int().min(0).optional(),
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

type SessionRow = typeof sessions.$inferSelect;
type DivisionRow = typeof sessionDivisions.$inferSelect;

function mapSessionBase(row: SessionRow) {
  return {
    id: row.id,
    event_id: row.eventId,
    name: row.name,
    date: row.date,
    checkin_opens_at: row.checkinOpensAt,
    floor_trial_starts_at: row.floorTrialStartsAt,
    floor_trial_ends_at: row.floorTrialEndsAt,
    max_slots: row.maxSlots,
    max_priority_runs: row.maxPriorityRuns,
    status: row.status,
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
  };
}

function buildQueueDepthMap(
  rows: { sessionId: string | null; queueType: string; c: bigint | number }[]
): Map<string, { priority: number; standard: number }> {
  const map = new Map<string, { priority: number; standard: number }>();
  for (const r of rows) {
    if (!r.sessionId) continue;
    let e = map.get(r.sessionId);
    if (!e) {
      e = { priority: 0, standard: 0 };
      map.set(r.sessionId, e);
    }
    const n = Number(r.c ?? 0);
    if (r.queueType === "priority") e.priority = n;
    else if (r.queueType === "standard") e.standard = n;
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

/** Batch-load divisions for many sessions; grouped in session order. */
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

async function queueDepthForSession(sessionId: string) {
  const rows = await db
    .select({
      queueType: checkins.queueType,
      c: count(),
    })
    .from(checkins)
    .where(
      and(
        eq(checkins.sessionId, sessionId),
        inArray(checkins.status, ["waiting", "on_deck"])
      )
    )
    .groupBy(checkins.queueType);
  return buildQueueDepthMap(
    rows.map((r) => ({ sessionId: sessionId, queueType: r.queueType, c: r.c }))
  ).get(sessionId) ?? { priority: 0, standard: 0 };
}

sessionRoutes.get("/", zValidator("query", listQuery), async (c) => {
  const { event_id } = c.req.valid("query");
  const userId = await getOptionalSyncedUserId(c);

  const rows = event_id
    ? await db
        .select()
        .from(sessions)
        .where(eq(sessions.eventId, event_id))
        .orderBy(desc(sessions.date), desc(sessions.createdAt))
    : await db
        .select()
        .from(sessions)
        .orderBy(desc(sessions.date), desc(sessions.createdAt));

  const sessionIds = rows.map((r) => r.id);
  const divisionsBySession = await loadDivisionsForSessions(sessionIds);

  let queueMap = new Map<string, { priority: number; standard: number }>();
  if (sessionIds.length > 0) {
    const qRows = await db
      .select({
        sessionId: checkins.sessionId,
        queueType: checkins.queueType,
        c: count(),
      })
      .from(checkins)
      .where(
        and(
          inArray(checkins.sessionId, sessionIds),
          inArray(checkins.status, ["waiting", "on_deck"])
        )
      )
      .groupBy(checkins.sessionId, checkins.queueType);
    queueMap = buildQueueDepthMap(qRows);
  }

  let activeSet = new Set<string>();
  if (userId && sessionIds.length > 0) {
    const actives = await db
      .select({ sessionId: checkins.sessionId })
      .from(checkins)
      .where(
        and(
          inArray(checkins.sessionId, sessionIds),
          eq(checkins.submittedByUserId, userId),
          inArray(checkins.status, ["waiting", "on_deck", "running"])
        )
      );
    activeSet = new Set(actives.map((a) => a.sessionId));
  }

  const results = rows.map((row) => {
    const divs = (divisionsBySession.get(row.id) ?? []).map(mapDivision);
    const depth = queueMap.get(row.id) ?? { priority: 0, standard: 0 };
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
  const maxSlots = body.max_slots ?? 7;
  const maxPriorityRuns = body.max_priority_runs ?? 3;

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

  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id,
      eventId: body.event_id ?? null,
      name: body.name.trim(),
      date: body.date ?? null,
      checkinOpensAt: body.checkin_opens_at,
      floorTrialStartsAt: body.floor_trial_starts_at,
      floorTrialEndsAt: body.floor_trial_ends_at,
      maxSlots,
      maxPriorityRuns,
      status: "scheduled",
      createdBy: uid,
      createdAt: now,
    });

    for (let slotNumber = 1; slotNumber <= maxSlots; slotNumber++) {
      await tx.insert(floorSlots).values({
        id: crypto.randomUUID(),
        sessionId: id,
        slotNumber,
        checkinId: null,
        assignedAt: now,
      });
    }

    for (let i = 0; i < body.divisions.length; i++) {
      const d = body.divisions[i]!;
      const name = d.division_name.trim();
      if (!name || name === "Other") continue;
      const isPriority = d.is_priority ?? false;
      const sortOrder = d.sort_order ?? i;
      await tx.insert(sessionDivisions).values({
        id: crypto.randomUUID(),
        sessionId: id,
        divisionName: name,
        isPriority,
        sortOrder,
      });
    }
  });

  const [created] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const divs = (await loadDivisionsForSession(id)).map(mapDivision);
  const depth = await queueDepthForSession(id);
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
        await tx.insert(sessionDivisions).values({
          id: crypto.randomUUID(),
          sessionId: id,
          divisionName: name,
          isPriority,
          sortOrder,
        });
      }
    });

    const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    const divs = (await loadDivisionsForSession(id)).map(mapDivision);
    const depth = await queueDepthForSession(id);
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
  const depth = await queueDepthForSession(id);
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
  if (body.max_slots !== undefined) updates.maxSlots = body.max_slots;
  if (body.max_priority_runs !== undefined) updates.maxPriorityRuns = body.max_priority_runs;

  if (Object.keys(updates).length > 0) {
    await db.update(sessions).set(updates).where(eq(sessions.id, id));
  }

  const [row] = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const divs = (await loadDivisionsForSession(id)).map(mapDivision);
  const depth = await queueDepthForSession(id);
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
    await tx.update(floorSlots).set({ checkinId: null }).where(eq(floorSlots.sessionId, id));
    await tx.delete(floorSlots).where(eq(floorSlots.sessionId, id));
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
  const depth = await queueDepthForSession(id);

  const userId = await getOptionalSyncedUserId(c);
  let has_active_checkin: boolean | undefined;
  let active_checkin_division: string | undefined;
  if (userId) {
    const [active] = await db
      .select({ division: checkins.division })
      .from(checkins)
      .where(
        and(
          eq(checkins.sessionId, id),
          eq(checkins.submittedByUserId, userId),
          inArray(checkins.status, ["waiting", "on_deck", "running"])
        )
      )
      .limit(1);
    if (active) {
      has_active_checkin = true;
      active_checkin_division = active.division;
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

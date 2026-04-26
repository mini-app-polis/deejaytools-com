import { CommonErrors, success, successList } from "common-typescript-utils";
import { zValidator } from "../lib/validate.js";
import { Hono } from "hono";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  checkins,
  eventDivisionRunLimits,
  events,
  queueEntries,
  queueEvents,
  runs,
  sessionDivisions,
  sessions,
} from "../db/schema.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";

// YYYY-MM-DD
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const createEvent = z.object({
  name: z.string().min(1),
  start_date: dateString,
  end_date: dateString,
});

const patchEvent = z.object({
  name: z.string().min(1).optional(),
  start_date: dateString.optional(),
  end_date: dateString.optional(),
});

export const eventRoutes = new Hono();

/** Derive status from start/end dates without storing it. */
function computeStatus(startDate: string, endDate: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (today < startDate) return "upcoming";
  if (today > endDate) return "completed";
  return "active";
}

function mapEvent(row: typeof events.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    start_date: row.startDate,
    end_date: row.endDate,
    status: computeStatus(row.startDate, row.endDate),
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

eventRoutes.get("/", async (c) => {
  const rows = await db.select().from(events).orderBy(desc(events.createdAt));
  return c.json(successList(rows.map(mapEvent)));
});

eventRoutes.get("/:id", requireAuth, async (c) => {
  const id = c.req.param("id");
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!row) return c.json(CommonErrors.notFound("Event"), 404);
  return c.json(success(mapEvent(row)));
});

eventRoutes.post("/", requireAdmin, zValidator("json", createEvent), async (c) => {
  const body = c.req.valid("json");
  if (body.start_date > body.end_date) {
    return c.json(CommonErrors.badRequest("start_date must be on or before end_date"), 400);
  }
  const uid = c.get("user").userId;
  const now = Date.now();
  const id = crypto.randomUUID();
  await db.insert(events).values({
    id,
    name: body.name,
    startDate: body.start_date,
    endDate: body.end_date,
    createdBy: uid,
    createdAt: now,
    updatedAt: now,
  });
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return c.json(success(mapEvent(row!)), 201);
});

eventRoutes.patch("/:id", requireAdmin, zValidator("json", patchEvent), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) return c.json(CommonErrors.notFound("Event"), 404);

  const nextStart = body.start_date ?? existing.startDate;
  const nextEnd = body.end_date ?? existing.endDate;
  if (nextStart > nextEnd) {
    return c.json(CommonErrors.badRequest("start_date must be on or before end_date"), 400);
  }

  const now = Date.now();
  await db
    .update(events)
    .set({
      ...(body.name !== undefined && { name: body.name }),
      ...(body.start_date !== undefined && { startDate: body.start_date }),
      ...(body.end_date !== undefined && { endDate: body.end_date }),
      updatedAt: now,
    })
    .where(eq(events.id, id));
  const [row] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  return c.json(success(mapEvent(row!)));
});

eventRoutes.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!existing) return c.json(CommonErrors.notFound("Event"), 404);

  await db.transaction(async (tx) => {
    const eventSessions = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.eventId, id));
    const sessionIds = eventSessions.map((s) => s.id);

    if (sessionIds.length > 0) {
      await tx.delete(queueEntries).where(inArray(queueEntries.sessionId, sessionIds));
      await tx.delete(queueEvents).where(inArray(queueEvents.sessionId, sessionIds));
      await tx.delete(runs).where(inArray(runs.sessionId, sessionIds));
      await tx.delete(checkins).where(inArray(checkins.sessionId, sessionIds));
      await tx.delete(sessionDivisions).where(inArray(sessionDivisions.sessionId, sessionIds));
      await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
    }

    await tx.delete(eventDivisionRunLimits).where(eq(eventDivisionRunLimits.eventId, id));
    await tx.delete(events).where(eq(events.id, id));
  });

  return c.json(success({ deleted: true }));
});

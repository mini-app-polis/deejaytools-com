import { CommonErrors, createLogger, success, successList } from "common-typescript-utils";
import { zValidator } from "../lib/validate.js";
import * as Sentry from "@sentry/node";
import { Hono } from "hono";
import { z } from "zod";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  checkins,
  eventDivisionRunLimits,
  eventSongSubmissions,
  events,
  queueEntries,
  queueEvents,
  runs,
  sessionDivisions,
  sessions,
} from "../db/schema.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { enqueueDriveJob } from "../services/driveJobs.js";

const logger = createLogger("deejaytools-api");

// YYYY-MM-DD
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

/** Validate that a string is a recognised IANA timezone identifier. */
const ianaTimezone = z
  .string()
  .min(1)
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: "Must be a valid IANA timezone (e.g. 'America/Chicago')" }
  );

const createEvent = z.object({
  name: z.string().min(1),
  start_date: dateString,
  end_date: dateString,
  /** IANA timezone for this event. All session times are displayed in this zone. */
  timezone: ianaTimezone.default("America/Chicago"),
});

const patchEvent = z.object({
  name: z.string().min(1).optional(),
  start_date: dateString.optional(),
  end_date: dateString.optional(),
  timezone: ianaTimezone.optional(),
});

export const eventRoutes = new Hono();

/** Derive status from start/end dates without storing it. */
export function computeStatus(startDate: string, endDate: string): string {
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
    timezone: row.timezone,
    status: computeStatus(row.startDate, row.endDate),
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

eventRoutes.get("/", async (c) => {
  // Sort by start_date (newest first); fall back to createdAt for stable ordering
  // when multiple events share a start_date.
  const rows = await db
    .select()
    .from(events)
    .orderBy(desc(events.startDate), desc(events.createdAt));
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
    timezone: body.timezone,
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
      ...(body.timezone !== undefined && { timezone: body.timezone }),
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

  let orphanedCopyIds: string[] = [];
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

    // Song submissions cascade with the event. event_song_submissions.event_id
    // is NOT NULL with no ON DELETE rule, so without this the final delete
    // below fails on the foreign key for any event that has entries.
    // Capture the Drive copies first — after the delete the file ids are gone.
    const submissionCopies = await tx
      .select({ driveCopyFileId: eventSongSubmissions.driveCopyFileId })
      .from(eventSongSubmissions)
      .where(eq(eventSongSubmissions.eventId, id));
    orphanedCopyIds = submissionCopies
      .map((r) => r.driveCopyFileId)
      .filter((v): v is string => v !== null);

    await tx.delete(eventSongSubmissions).where(eq(eventSongSubmissions.eventId, id));
    await tx.delete(eventDivisionRunLimits).where(eq(eventDivisionRunLimits.eventId, id));
    await tx.delete(events).where(eq(events.id, id));
  });

  for (const fileId of orphanedCopyIds) {
    try {
      await enqueueDriveJob(db, { kind: "trash", fileId });
    } catch (err) {
      logger.error({
        event: "drive_trash_enqueue_failed",
        category: "api",
        context: { eventId: id, driveFileId: fileId, source: "event_delete" },
        error: err,
      });
      Sentry.withScope((scope) => {
        scope.setLevel("error");
        scope.setTag("subsystem", "drive_jobs");
        scope.setTag("drive_job_kind", "trash");
        scope.setContext("drive_job", { file_id: fileId, stage: "enqueue", source: "event_delete" });
        Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
      });
    }
  }

  return c.json(success({ deleted: true }));
});

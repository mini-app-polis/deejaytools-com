import { CommonErrors, createLogger, success, successList } from "common-typescript-utils";
import { Hono } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { driveJobs, events, eventSongSubmissions } from "../db/schema.js";
import { zValidator } from "../lib/validate.js";
import { requireAdmin } from "../middleware/auth.js";

const logger = createLogger("deejaytools-api");

const listQuery = z.object({
  status: z.enum(["pending", "running", "done", "failed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const adminDriveJobRoutes = new Hono();

/**
 * GET /v1/admin/drive-jobs/summary
 *
 * Counts by status plus the number of submissions still missing a copy. This
 * is the "is the queue healthy" question in one call — a non-zero failed count
 * or a growing uncopied count is the signal to look at the rows themselves.
 */
adminDriveJobRoutes.get("/summary", requireAdmin, async (c) => {
  try {
    const byStatus = await db
      .select({ status: driveJobs.status, count: sql<number>`count(*)::int` })
      .from(driveJobs)
      .groupBy(driveJobs.status);

    const [uncopied] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventSongSubmissions)
      .where(isNull(eventSongSubmissions.driveCopyFileId));

    return c.json(
      success({
        by_status: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
        submissions_without_copy: uncopied?.count ?? 0,
      })
    );
  } catch (err) {
    logger.error({ event: "drive_jobs_summary_failed", category: "api", error: err });
    return c.json(CommonErrors.internalError(), 500);
  }
});

/**
 * GET /v1/admin/drive-jobs?status=failed&limit=50
 *
 * Recent jobs, newest first, including last_error — the field that actually
 * explains a failure and that the retry log path used to discard.
 */
adminDriveJobRoutes.get("/", requireAdmin, zValidator("query", listQuery), async (c) => {
  const { status, limit } = c.req.valid("query");

  try {
    const baseQuery = db
      .select({
        id: driveJobs.id,
        kind: driveJobs.kind,
        status: driveJobs.status,
        attempts: driveJobs.attempts,
        last_error: driveJobs.lastError,
        next_attempt_at: driveJobs.nextAttemptAt,
        created_at: driveJobs.createdAt,
        updated_at: driveJobs.updatedAt,
        submission_id: driveJobs.submissionId,
        file_id: driveJobs.fileId,
        event_name: events.name,
      })
      .from(driveJobs)
      .leftJoin(eventSongSubmissions, eq(eventSongSubmissions.id, driveJobs.submissionId))
      .leftJoin(events, eq(events.id, eventSongSubmissions.eventId));

    const rows = await (status ? baseQuery.where(eq(driveJobs.status, status)) : baseQuery)
      .orderBy(desc(driveJobs.updatedAt))
      .limit(limit);

    return c.json(successList(rows));
  } catch (err) {
    logger.error({ event: "drive_jobs_list_failed", category: "api", error: err });
    return c.json(CommonErrors.internalError(), 500);
  }
});

/**
 * POST /v1/admin/drive-jobs/:id/retry
 *
 * Return a failed job to the queue. Exhaustion is otherwise terminal — there
 * is no path back without a SQL console, which is the wrong tool to hand
 * someone at an event.
 */
adminDriveJobRoutes.post("/:id/retry", requireAdmin, async (c) => {
  const id = c.req.param("id");

  const [existing] = await db.select().from(driveJobs).where(eq(driveJobs.id, id)).limit(1);
  if (!existing) return c.json(CommonErrors.notFound("Drive job"), 404);

  await db
    .update(driveJobs)
    .set({ status: "pending", attempts: 0, nextAttemptAt: Date.now(), updatedAt: Date.now() })
    .where(and(eq(driveJobs.id, id), eq(driveJobs.status, "failed")));

  logger.info({
    event: "drive_job_retry_requested",
    category: "api",
    context: { job_id: id, previous_status: existing.status },
  });

  return c.json(success({ id, status: "pending" }));
});

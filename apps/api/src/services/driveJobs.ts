import * as Sentry from "@sentry/node";
import { createLogger } from "common-typescript-utils";
import { and, eq, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import { resolveSubmissionFilename } from "../lib/submissionFilename.js";
import { copySongToEventFolder, softDeleteOnDrive } from "./drive.js";

type Db = PostgresJsDatabase<typeof schema>;

const logger = createLogger("deejaytools-api");

/**
 * Give up after this many tries, mark the job 'failed', and report to Sentry.
 * With the backoff below this spans roughly three hours, which is meant to
 * outlast a Google-side incident rather than a transient blip — entrants
 * submit in the days before an event, so we have hours of slack, not minutes.
 */
export const MAX_ATTEMPTS = 10;

/** Jobs claimed per tick. Keeps one slow Drive call from starving the tick. */
export const DEFAULT_BATCH_SIZE = 10;

/**
 * A job claimed but never resolved is presumed orphaned after this long and is
 * returned to 'pending'. The usual cause is the process dying mid-job — a
 * Railway deploy, OOM, or SIGKILL — which is most likely during the pre-event
 * rush when we are also deploying. Without reclaim those rows sit in 'running'
 * forever and are never retried by anything.
 *
 * Must comfortably exceed the slowest realistic Drive call.
 */
export const LEASE_TIMEOUT_MS = 10 * 60_000;

/** 1m, 2m, 4m, 8m, 16m, then 30m thereafter. ~3h across MAX_ATTEMPTS. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** attempts, 30 * 60_000);
}

/**
 * Report a Drive job we have given up on. Background work never passes through
 * app.onError, so without this a permanently failed copy is invisible outside
 * the logs. Tags are chosen so Sentry groups by kind and by job rather than
 * lumping every Drive failure into one issue.
 */
function reportDriveJobFailure(
  err: unknown,
  context: {
    jobId: string;
    kind: string;
    submissionId: string | null;
    fileId: string | null;
    attempts: number;
  }
): void {
  Sentry.withScope((scope) => {
    scope.setLevel("error");
    scope.setTag("subsystem", "drive_jobs");
    scope.setTag("drive_job_kind", context.kind);
    scope.setContext("drive_job", {
      job_id: context.jobId,
      kind: context.kind,
      submission_id: context.submissionId,
      file_id: context.fileId,
      attempts: context.attempts,
    });
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
  });
}

export async function enqueueDriveJob(
  database: Db,
  job: { kind: "copy" | "trash"; submissionId?: string; fileId?: string }
): Promise<void> {
  const now = Date.now();
  await database.insert(schema.driveJobs).values({
    id: crypto.randomUUID(),
    kind: job.kind,
    submissionId: job.submissionId ?? null,
    fileId: job.fileId ?? null,
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

type DriveJob = typeof schema.driveJobs.$inferSelect;

/**
 * Shape of a drive_jobs row as returned by a RAW query.
 *
 * database.execute() bypasses drizzle's column-name mapping and returns the
 * database's own snake_case names, with bigint columns as strings. This type
 * describes that reality; mapDriveJobRow converts it to the camelCase,
 * number-typed DriveJob the rest of this module expects. Reading a raw row as
 * a DriveJob directly silently yields undefined for every underscored field.
 */
type RawDriveJobRow = {
  id: string;
  kind: string;
  submission_id: string | null;
  file_id: string | null;
  status: string;
  attempts: number | string;
  next_attempt_at: number | string;
  last_error: string | null;
  created_at: number | string;
  updated_at: number | string;
};

function mapDriveJobRow(row: RawDriveJobRow): DriveJob {
  return {
    id: row.id,
    kind: row.kind,
    submissionId: row.submission_id,
    fileId: row.file_id,
    status: row.status,
    attempts: Number(row.attempts),
    nextAttemptAt: Number(row.next_attempt_at),
    lastError: row.last_error,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

/**
 * Return jobs stuck in 'running' past the lease timeout to 'pending' so the
 * next claim picks them up. Attempts is deliberately NOT incremented — the job
 * never got a real try, the process just died holding it.
 */
async function reclaimStuckJobs(database: Db, now: number): Promise<number> {
  const reclaimed = await database
    .update(schema.driveJobs)
    .set({ status: "pending", updatedAt: now })
    .where(
      and(
        eq(schema.driveJobs.status, "running"),
        lt(schema.driveJobs.updatedAt, now - LEASE_TIMEOUT_MS)
      )
    )
    .returning({ id: schema.driveJobs.id });

  if (reclaimed.length > 0) {
    logger.warn({
      event: "drive_jobs_reclaimed",
      category: "infra",
      context: { count: reclaimed.length, job_ids: reclaimed.map((r) => r.id) },
    });
  }
  return reclaimed.length;
}

/**
 * Atomically claim up to `limit` due jobs. SKIP LOCKED means concurrent
 * replicas take disjoint sets instead of blocking on each other.
 */
async function claimJobs(database: Db, limit: number, now: number): Promise<DriveJob[]> {
  const rows = await database.execute<RawDriveJobRow>(sql`
    UPDATE drive_jobs
    SET status = 'running', updated_at = ${now}
    WHERE id IN (
      SELECT id FROM drive_jobs
      WHERE status = 'pending' AND next_attempt_at <= ${now}
      ORDER BY next_attempt_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `);
  // Raw execute() returns snake_case columns and string bigints — map before
  // handing these to anything that expects a DriveJob.
  return Array.from(rows as unknown as RawDriveJobRow[]);
}

async function runCopyJob(database: Db, job: DriveJob): Promise<void> {
  if (!job.submissionId) {
    throw new Error(
      `copy job ${job.id} has no submission_id (row keys: ${Object.keys(job).join(",")})`
    );
  }

  const [row] = await database
    .select({
      submissionId: schema.eventSongSubmissions.id,
      alreadyCopied: schema.eventSongSubmissions.driveCopyFileId,
      songId: schema.songs.id,
      driveFileId: schema.songs.driveFileId,
      originalFilename: schema.songs.originalFilename,
      processedFilename: schema.songs.processedFilename,
      seasonYear: schema.songs.seasonYear,
      division: schema.songs.division,
      eventName: schema.events.name,
    })
    .from(schema.eventSongSubmissions)
    .innerJoin(schema.songs, eq(schema.songs.id, schema.eventSongSubmissions.songId))
    .innerJoin(schema.events, eq(schema.events.id, schema.eventSongSubmissions.eventId))
    .where(eq(schema.eventSongSubmissions.id, job.submissionId))
    .limit(1);

  // The submission was removed before we got to it — nothing to copy.
  if (!row) return;

  // Idempotent: a retry after a partial failure must not create a second copy.
  if (row.alreadyCopied) return;

  // No source file (legacy row, or an upload that never completed). Not a
  // transient error — retrying will never help, so treat it as done.
  if (!row.driveFileId) {
    logger.warn({
      event: "drive_copy_skipped_no_source",
      category: "infra",
      context: { submission_id: job.submissionId, song_id: row.songId },
    });
    return;
  }

  const filename = resolveSubmissionFilename({
    song: {
      id: row.songId,
      originalFilename: row.originalFilename,
      processedFilename: row.processedFilename,
    },
    event: { name: row.eventName },
  });

  const { fileId } = await copySongToEventFolder(row.driveFileId, {
    filename,
    seasonYear: row.seasonYear?.trim() || "unknown",
    eventName: row.eventName,
    division: row.division?.trim() || "unknown",
  });

  await database
    .update(schema.eventSongSubmissions)
    .set({ driveCopyFileId: fileId })
    .where(eq(schema.eventSongSubmissions.id, job.submissionId));

  logger.info({
    event: "drive_copy_succeeded",
    category: "infra",
    context: { submission_id: job.submissionId, drive_file_id: fileId },
  });
}

async function runTrashJob(job: DriveJob): Promise<void> {
  if (!job.fileId) {
    throw new Error(
      `trash job ${job.id} has no file_id (row keys: ${Object.keys(job).join(",")})`
    );
  }
  await softDeleteOnDrive(job.fileId);
  logger.info({
    event: "drive_trash_succeeded",
    category: "infra",
    context: { drive_file_id: job.fileId },
  });
}

/**
 * Drain due Drive jobs. Called once per scheduler tick. Never throws — a job
 * that fails is rescheduled with backoff, and one bad job cannot stop the tick.
 */
export async function processDriveJobs(
  database: Db,
  limit: number = DEFAULT_BATCH_SIZE
): Promise<number> {
  const now = Date.now();

  // Before claiming, rescue anything a dead process left holding a lease.
  try {
    await reclaimStuckJobs(database, now);
  } catch (err) {
    // Non-fatal: reclaim is a backstop, and failing it must not stop this tick
    // from draining the jobs that are already pending.
    logger.error({ event: "drive_jobs_reclaim_failed", category: "infra", error: err });
  }

  let jobs: DriveJob[];
  try {
    jobs = await claimJobs(database, limit, now);
  } catch (err) {
    // A claim failure means the queue is not draining at all — every submission
    // made from here on goes uncopied. Loud, not just logged.
    logger.error({ event: "drive_jobs_claim_failed", category: "infra", error: err });
    Sentry.withScope((scope) => {
      scope.setLevel("error");
      scope.setTag("subsystem", "drive_jobs");
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    });
    return 0;
  }

  let done = 0;
  for (const job of jobs) {
    try {
      if (job.kind === "copy") {
        await runCopyJob(database, job);
      } else if (job.kind === "trash") {
        await runTrashJob(job);
      } else {
        throw new Error(`unknown drive job kind: ${job.kind}`);
      }

      await database
        .update(schema.driveJobs)
        .set({ status: "done", updatedAt: Date.now(), lastError: null })
        .where(eq(schema.driveJobs.id, job.id));
      done++;
    } catch (err) {
      const attempts = job.attempts + 1;
      const exhausted = attempts >= MAX_ATTEMPTS;
      await database
        .update(schema.driveJobs)
        .set({
          status: exhausted ? "failed" : "pending",
          attempts,
          nextAttemptAt: Date.now() + backoffMs(attempts),
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: Date.now(),
        })
        .where(eq(schema.driveJobs.id, job.id));

      logger[exhausted ? "error" : "warn"]({
        event: exhausted ? "drive_job_exhausted" : "drive_job_retrying",
        category: "infra",
        context: {
          job_id: job.id,
          kind: job.kind,
          submission_id: job.submissionId,
          file_id: job.fileId,
          attempts,
        },
        error: err,
      });

      // Only report once we have actually given up. Reporting every retry would
      // bury the real failures under transient noise.
      if (exhausted) {
        reportDriveJobFailure(err, {
          jobId: job.id,
          kind: job.kind,
          submissionId: job.submissionId,
          fileId: job.fileId,
          attempts,
        });
      }
    }
  }

  return done;
}

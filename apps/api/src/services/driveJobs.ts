import { createLogger } from "common-typescript-utils";
import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import { resolveSubmissionFilename } from "../lib/submissionFilename.js";
import { copySongToEventFolder, softDeleteOnDrive } from "./drive.js";

type Db = PostgresJsDatabase<typeof schema>;

const logger = createLogger("deejaytools-api");

/** Give up after this many tries and leave the job as 'failed' for an operator. */
export const MAX_ATTEMPTS = 6;

/** Jobs claimed per tick. Keeps one slow Drive call from starving the tick. */
export const DEFAULT_BATCH_SIZE = 10;

/** 1m, 2m, 4m, 8m, 16m, capped at 30m. */
export function backoffMs(attempts: number): number {
  return Math.min(60_000 * 2 ** attempts, 30 * 60_000);
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
 * Atomically claim up to `limit` due jobs. SKIP LOCKED means concurrent
 * replicas take disjoint sets instead of blocking on each other.
 */
async function claimJobs(database: Db, limit: number, now: number): Promise<DriveJob[]> {
  const rows = await database.execute<DriveJob>(sql`
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
  return Array.from(rows as unknown as DriveJob[]);
}

async function runCopyJob(database: Db, job: DriveJob): Promise<void> {
  if (!job.submissionId) throw new Error("copy job has no submission_id");

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
  if (!job.fileId) throw new Error("trash job has no file_id");
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
  let jobs: DriveJob[];
  try {
    jobs = await claimJobs(database, limit, now);
  } catch (err) {
    logger.error({ event: "drive_jobs_claim_failed", category: "infra", error: err });
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
        context: { job_id: job.id, kind: job.kind, attempts },
        error: err,
      });
    }
  }

  return done;
}

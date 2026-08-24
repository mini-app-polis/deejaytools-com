import { createLogger } from "common-typescript-utils";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as Sentry from "@sentry/node";
import * as schema from "../db/schema.js";
import { fillRunningSessions, tickSessionStatuses } from "./cron.js";
import { processDriveJobs } from "./driveJobs.js";

type Db = PostgresJsDatabase<typeof schema>;

const logger = createLogger("deejaytools-api");

export const DEFAULT_TICK_INTERVAL_MS = 30_000;

/**
 * One scheduler pass: advance session statuses, auto-fill the active queue of
 * every running floor trial, then drain queued Drive work. Shared by the
 * in-process loop and the manual /internal/tick endpoint so both do exactly
 * the same work. Swallows its own errors so a single bad pass never stops the
 * loop.
 */
export async function runTick(database: Db): Promise<void> {
  // Session work and Drive work fail independently, so they get independent
  // try blocks. Sharing one meant a persistent failure in the session steps
  // silently stopped the Drive queue draining — every submission uncopied,
  // with only a generic tick_failed log to show for it.
  try {
    await tickSessionStatuses(database);
    await fillRunningSessions(database);
  } catch (err) {
    logger.error({ event: "tick_failed", category: "infra", error: err });
  }

  try {
    await processDriveJobs(database);
  } catch (err) {
    logger.error({ event: "drive_jobs_tick_failed", category: "infra", error: err });
    Sentry.withScope((scope) => {
      scope.setLevel("error");
      scope.setTag("subsystem", "drive_jobs");
      Sentry.captureException(err instanceof Error ? err : new Error(String(err)));
    });
  }
}

export interface SchedulerHandle {
  stop: () => void;
}

/**
 * Start the in-process scheduler. Runs runTick() immediately, then every
 * intervalMs. Living in the app (not an external cron) means it is versioned
 * with the code, runs identically in every environment, and cannot silently
 * fail to be configured.
 *
 * - Overlap guard: skips a tick if the previous one is still running.
 * - The interval is unref()'d so it never keeps the process alive at shutdown.
 *
 * Safe under multiple replicas: tickSessionStatuses is idempotent and
 * fillActiveQueue locks each session row FOR UPDATE, so concurrent ticks
 * serialize per session and at worst do redundant no-op work.
 */
export function startScheduler(
  database: Db,
  intervalMs: number = DEFAULT_TICK_INTERVAL_MS
): SchedulerHandle {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runTick(database);
    } finally {
      running = false;
    }
  };

  // One pass right away so a fresh deploy fills running sessions without
  // waiting a full interval.
  void tick();

  const handle = setInterval(() => void tick(), intervalMs);
  handle.unref();

  logger.info({
    event: "scheduler_started",
    category: "infra",
    context: { interval_ms: intervalMs },
  });

  return {
    stop: () => {
      clearInterval(handle);
      logger.info({ event: "scheduler_stopped", category: "infra" });
    },
  };
}

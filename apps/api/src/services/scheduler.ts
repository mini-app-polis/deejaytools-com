import { createLogger } from "common-typescript-utils";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import { fillRunningSessions, tickSessionStatuses } from "./cron.js";

type Db = PostgresJsDatabase<typeof schema>;

const logger = createLogger("deejaytools-api");

export const DEFAULT_TICK_INTERVAL_MS = 30_000;

/**
 * One scheduler pass: advance session statuses, then auto-fill the active
 * queue of every running floor trial. Shared by the in-process loop and the
 * manual /internal/tick endpoint so both do exactly the same work.
 * Swallows its own errors so a single bad pass never stops the loop.
 */
export async function runTick(database: Db): Promise<void> {
  try {
    await tickSessionStatuses(database);
    await fillRunningSessions(database);
  } catch (err) {
    logger.error({ event: "tick_failed", category: "infra", error: err });
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

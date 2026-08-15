import { createLogger } from "common-typescript-utils";
import { and, eq, gt, inArray, lte, ne } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";
import { invalidateQueueCache } from "../lib/cache.js";
import type { DbTransaction } from "../lib/queue/compaction.js";
import { fillActiveQueue } from "../lib/queue/fill.js";

type Db = PostgresJsDatabase<typeof schema>;

const logger = createLogger("deejaytools-api");

const ACTIVE: (typeof schema.sessions.$inferSelect.status)[] = [
  "scheduled",
  "checkin_open",
  "in_progress",
];

export async function tickSessionStatuses(database: Db): Promise<number> {
  const now = Date.now();
  const rows = await database
    .select({
      id: schema.sessions.id,
      status: schema.sessions.status,
      checkinOpensAt: schema.sessions.checkinOpensAt,
      floorTrialStartsAt: schema.sessions.floorTrialStartsAt,
      floorTrialEndsAt: schema.sessions.floorTrialEndsAt,
    })
    .from(schema.sessions)
    .where(inArray(schema.sessions.status, ACTIVE));

  let updated = 0;
  for (const session of rows) {
    let newStatus: typeof session.status | null = null;
    if (session.status === "scheduled" && now >= session.checkinOpensAt) {
      newStatus = "checkin_open";
    } else if (session.status === "checkin_open" && now >= session.floorTrialStartsAt) {
      newStatus = "in_progress";
    } else if (session.status === "in_progress" && now >= session.floorTrialEndsAt) {
      newStatus = "completed";
    }
    if (newStatus) {
      await database
        .update(schema.sessions)
        .set({ status: newStatus })
        .where(eq(schema.sessions.id, session.id));
      updated++;
      logger.info({
        event: "session_status_updated",
        category: "infra",
        context: { session_id: session.id, status: newStatus },
      });
    }
  }
  // Always log tick completion so operators can confirm the cron is running
  // even during quiet periods when no sessions need updating.
  logger.info({
    event: "tick_completed",
    category: "infra",
    context: { sessions_checked: rows.length, sessions_updated: updated },
  });
  return updated;
}

/**
 * Auto-advance the active queue for every session currently inside its
 * floor-trial window. This is the backstop that fills a session at start
 * (when the trial opens no user event fires — the cron is the trigger) and
 * tops up any running session each tick. Event-driven fills in the queue /
 * check-in handlers cover the in-between moments.
 */
export async function fillRunningSessions(database: Db): Promise<number> {
  const now = Date.now();
  const rows = await database
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(
      and(
        ne(schema.sessions.status, "cancelled"),
        lte(schema.sessions.floorTrialStartsAt, now),
        gt(schema.sessions.floorTrialEndsAt, now)
      )
    );

  let totalPromoted = 0;
  for (const s of rows) {
    try {
      const promoted = await database.transaction((tx) =>
        fillActiveQueue(tx as DbTransaction, s.id, null, now)
      );
      if (promoted > 0) {
        totalPromoted += promoted;
        invalidateQueueCache(s.id);
      }
    } catch (err) {
      logger.error({
        event: "auto_fill_failed",
        category: "infra",
        context: { session_id: s.id },
        error: err,
      });
    }
  }

  logger.info({
    event: "auto_fill_completed",
    category: "infra",
    context: { sessions_checked: rows.length, entries_promoted: totalPromoted },
  });
  return totalPromoted;
}

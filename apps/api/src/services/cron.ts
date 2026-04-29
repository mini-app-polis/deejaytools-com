import { createLogger } from "common-typescript-utils";
import { eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "../db/schema.js";

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

/**
 * Bucketing and summary text for an event's floor trials.
 *
 * The buckets match the admin session list (`AdminPage`): check-in-open and
 * in-progress sessions are both "active" — from a competitor's point of view
 * the difference is whether they can still join, not whether it is happening.
 * Cancelled sessions are counted separately and never surfaced: a called-off
 * trial is not one anybody can turn up to, so folding it into any of the three
 * visible buckets would overstate the event.
 */

export type FloorTrialCounts = {
  active: number;
  upcoming: number;
  completed: number;
  cancelled: number;
};

type SessionLike = { event_id?: string | null; status: string };

/** Which bucket a session status belongs to. Null for anything unrecognised. */
export function floorTrialBucket(status: string): keyof FloorTrialCounts | null {
  switch (status) {
    case "checkin_open":
    case "in_progress":
      return "active";
    case "scheduled":
      return "upcoming";
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}

/** Tally one event's sessions into buckets. */
export function countFloorTrials(sessions: readonly SessionLike[]): FloorTrialCounts {
  const counts: FloorTrialCounts = { active: 0, upcoming: 0, completed: 0, cancelled: 0 };
  for (const session of sessions) {
    const bucket = floorTrialBucket(session.status);
    if (bucket) counts[bucket] += 1;
  }
  return counts;
}

/** Group sessions by event id, tallying each event's buckets. */
export function countFloorTrialsByEvent(
  sessions: readonly SessionLike[]
): Map<string, FloorTrialCounts> {
  const byEvent = new Map<string, SessionLike[]>();
  for (const session of sessions) {
    if (!session.event_id) continue;
    const list = byEvent.get(session.event_id) ?? [];
    list.push(session);
    byEvent.set(session.event_id, list);
  }
  return new Map(
    [...byEvent.entries()].map(([eventId, list]) => [eventId, countFloorTrials(list)])
  );
}

/**
 * "1 active · 2 upcoming · 3 completed" — empty buckets are omitted so a card
 * never carries a row of zeroes, and an event with nothing scheduled says so
 * in words rather than showing "0".
 */
export function formatFloorTrials(counts: FloorTrialCounts): string {
  const parts: string[] = [];
  if (counts.active > 0) parts.push(`${counts.active} active`);
  if (counts.upcoming > 0) parts.push(`${counts.upcoming} upcoming`);
  if (counts.completed > 0) parts.push(`${counts.completed} completed`);
  return parts.length > 0 ? parts.join(" · ") : "none scheduled yet";
}

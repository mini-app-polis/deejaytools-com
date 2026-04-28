/**
 * Shared session display helpers.
 *
 * Convention:
 *   - Session "title" = "Start Time - Day of Week - Date"
 *     where Start Time is the floor-trial start (the moment dancing begins).
 *   - Card metadata = open / start / end times only (no date — that's in the title).
 */

type SessionTimes = {
  /** ms timestamp of when the floor trial / dancing begins. Used as the title's anchor time. */
  floor_trial_starts_at: number;
  /** ms timestamp of check-in opening. */
  checkin_opens_at?: number;
  /** ms timestamp of when the floor trial ends. */
  floor_trial_ends_at?: number;
};

/** "7:30 PM" — locale-aware, hour + minute, no seconds, no date. */
export function formatTimeOnly(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * "Saturday - 7:30 PM - April 27, 2026"
 *
 * Day, then time, then date. Anchored to the floor-trial start time so the
 * displayed time matches when the session actually starts (not when check-in
 * opens).
 */
export function formatSessionTitle(session: SessionTimes): string {
  const d = new Date(session.floor_trial_starts_at);
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const dayOfWeek = d.toLocaleDateString(undefined, { weekday: "long" });
  const date = d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${dayOfWeek} - ${time} - ${date}`;
}

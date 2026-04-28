/**
 * Shared session display helpers.
 *
 * Convention:
 *   - Session "title" = "Start Time - Day of Week - Date"
 *     where Start Time is the floor-trial start (the moment dancing begins).
 *   - Card metadata = open / start / end times only (no date — that's in the title).
 *
 * Timezone:
 *   All functions accept an optional `timeZone` parameter (IANA identifier, e.g.
 *   "America/Chicago"). When provided — typically from the parent event's
 *   `timezone` field — times are always shown in that zone regardless of the
 *   viewer's browser locale. When omitted the browser's local timezone is used
 *   as a fallback (matches the previous behaviour for sessions with no event).
 */

type SessionTimes = {
  /** ms timestamp of when the floor trial / dancing begins. Used as the title's anchor time. */
  floor_trial_starts_at: number;
  /** ms timestamp of check-in opening. */
  checkin_opens_at?: number;
  /** ms timestamp of when the floor trial ends. */
  floor_trial_ends_at?: number;
};

/** "7:30 PM" — locale-aware, hour + minute, no seconds, no date.
 *
 * @param ts        - Unix epoch ms
 * @param timeZone  - IANA timezone (e.g. "America/Chicago"). Defaults to browser timezone.
 */
export function formatTimeOnly(ts: number, timeZone?: string | null): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * "Saturday - 7:30 PM - April 27, 2026"
 *
 * Day, then time, then date. Anchored to the floor-trial start time so the
 * displayed time matches when the session actually starts (not when check-in
 * opens).
 *
 * @param session   - Object containing at least `floor_trial_starts_at`
 * @param timeZone  - IANA timezone (e.g. "America/Chicago"). Defaults to browser timezone.
 */
export function formatSessionTitle(session: SessionTimes, timeZone?: string | null): string {
  const d = new Date(session.floor_trial_starts_at);
  const tzOpts = timeZone ? { timeZone } : {};
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...tzOpts,
  });
  const dayOfWeek = d.toLocaleDateString(undefined, { weekday: "long", ...tzOpts });
  const date = d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
    ...tzOpts,
  });
  return `${dayOfWeek} - ${time} - ${date}`;
}

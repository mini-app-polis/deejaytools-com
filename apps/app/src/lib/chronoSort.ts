/**
 * Bucketed chronological sort: active items at the top, upcoming ones in
 * ascending order (soonest first), and past items pushed to the bottom in
 * reverse-chronological order (most recent past first). Mirrors the rule
 * "now or soon at top, future further down, old stuff out of the way".
 */

type SessionLike = {
  checkin_opens_at: number;
  floor_trial_starts_at: number;
  floor_trial_ends_at: number;
};

type EventLike = {
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
};

/** 0 = active, 1 = future, 2 = past. */
function sessionBucket(s: SessionLike, now: number): 0 | 1 | 2 {
  if (now >= s.checkin_opens_at && now <= s.floor_trial_ends_at) return 0;
  if (s.floor_trial_starts_at > now) return 1;
  return 2;
}

export function compareSessionChrono(
  a: SessionLike,
  b: SessionLike,
  now: number = Date.now()
): number {
  const ba = sessionBucket(a, now);
  const bb = sessionBucket(b, now);
  if (ba !== bb) return ba - bb;
  if (ba === 2) {
    // Past: most recent first (descending by start time).
    return b.floor_trial_starts_at - a.floor_trial_starts_at;
  }
  // Active or future: soonest first (ascending by start time).
  return a.floor_trial_starts_at - b.floor_trial_starts_at;
}

/** Returns the local "today" key in YYYY-MM-DD form for comparing event date strings. */
export function localTodayKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function eventBucket(e: EventLike, today: string): 0 | 1 | 2 {
  if (e.start_date <= today && today <= e.end_date) return 0;
  if (e.start_date > today) return 1;
  return 2;
}

export function compareEventChrono(
  a: EventLike,
  b: EventLike,
  today: string = localTodayKey()
): number {
  const ba = eventBucket(a, today);
  const bb = eventBucket(b, today);
  if (ba !== bb) return ba - bb;
  if (ba === 2) {
    // Past: most recent first.
    return a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0;
  }
  // Active or future: soonest first.
  return a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0;
}

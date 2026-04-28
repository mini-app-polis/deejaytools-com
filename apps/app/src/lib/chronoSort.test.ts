import { describe, expect, it } from "vitest";
import { compareEventChrono, compareSessionChrono, localTodayKey } from "./chronoSort";

// Helpers --------------------------------------------------------------------

function makeSession(opts: {
  /** ISO string interpreted in local time. */
  floorTrialStartsAt: string;
  /** Optional explicit check-in opens / floor end timestamps. */
  checkinOpensAt?: string;
  floorTrialEndsAt?: string;
}) {
  const start = new Date(opts.floorTrialStartsAt).getTime();
  const opens =
    opts.checkinOpensAt != null
      ? new Date(opts.checkinOpensAt).getTime()
      : start - 60 * 60 * 1000; // default: 1 hour before start
  const ends =
    opts.floorTrialEndsAt != null
      ? new Date(opts.floorTrialEndsAt).getTime()
      : start + 2 * 60 * 60 * 1000; // default: 2 hours after start
  return {
    checkin_opens_at: opens,
    floor_trial_starts_at: start,
    floor_trial_ends_at: ends,
  };
}

describe("compareSessionChrono", () => {
  it("puts active sessions first, then upcoming asc, then past desc", () => {
    const now = new Date("2026-04-27T12:00:00").getTime();
    // Active = now is between checkin_opens_at and floor_trial_ends_at.
    const active = makeSession({
      floorTrialStartsAt: "2026-04-27T11:00:00",
      checkinOpensAt: "2026-04-27T10:00:00",
      floorTrialEndsAt: "2026-04-27T14:00:00",
    });
    // Upcoming, soonest = today later
    const upcomingSoon = makeSession({ floorTrialStartsAt: "2026-04-28T07:00:00" });
    // Upcoming, far = next month
    const upcomingFar = makeSession({ floorTrialStartsAt: "2026-05-22T07:00:00" });
    // Past = ended yesterday
    const past = makeSession({
      floorTrialStartsAt: "2026-04-26T15:00:00",
      floorTrialEndsAt: "2026-04-26T17:00:00",
    });
    // Older past
    const olderPast = makeSession({
      floorTrialStartsAt: "2026-04-20T15:00:00",
      floorTrialEndsAt: "2026-04-20T17:00:00",
    });

    const sorted = [olderPast, upcomingFar, past, active, upcomingSoon]
      .slice()
      .sort((a, b) => compareSessionChrono(a, b, now));

    expect(sorted).toEqual([active, upcomingSoon, upcomingFar, past, olderPast]);
  });

  it("orders two upcoming sessions soonest-first", () => {
    const now = new Date("2026-04-27T12:00:00").getTime();
    const tomorrow = makeSession({ floorTrialStartsAt: "2026-04-28T07:00:00" });
    const nextWeek = makeSession({ floorTrialStartsAt: "2026-05-04T07:00:00" });
    const sorted = [nextWeek, tomorrow].slice().sort((a, b) =>
      compareSessionChrono(a, b, now)
    );
    expect(sorted).toEqual([tomorrow, nextWeek]);
  });

  it("orders two past sessions most-recent-first", () => {
    const now = new Date("2026-04-27T12:00:00").getTime();
    const yesterday = makeSession({
      floorTrialStartsAt: "2026-04-26T15:00:00",
      floorTrialEndsAt: "2026-04-26T17:00:00",
    });
    const lastMonth = makeSession({
      floorTrialStartsAt: "2026-03-15T15:00:00",
      floorTrialEndsAt: "2026-03-15T17:00:00",
    });
    const sorted = [lastMonth, yesterday].slice().sort((a, b) =>
      compareSessionChrono(a, b, now)
    );
    expect(sorted).toEqual([yesterday, lastMonth]);
  });

  it("treats a session whose floor trial just ended as past, not active", () => {
    const now = new Date("2026-04-27T15:00:00").getTime();
    const justEnded = makeSession({
      floorTrialStartsAt: "2026-04-27T13:00:00",
      floorTrialEndsAt: "2026-04-27T14:30:00",
    });
    const upcoming = makeSession({ floorTrialStartsAt: "2026-04-28T07:00:00" });
    // Upcoming should sort BEFORE past, even though both are on the same day.
    const sorted = [justEnded, upcoming].slice().sort((a, b) =>
      compareSessionChrono(a, b, now)
    );
    expect(sorted).toEqual([upcoming, justEnded]);
  });
});

describe("compareEventChrono", () => {
  const today = "2026-04-27";

  it("orders active events first, then upcoming asc, then past desc", () => {
    const active = { start_date: "2026-04-25", end_date: "2026-04-30" };
    const upcoming = { start_date: "2026-05-10", end_date: "2026-05-12" };
    const past = { start_date: "2026-04-01", end_date: "2026-04-03" };
    const olderPast = { start_date: "2025-12-01", end_date: "2025-12-03" };

    const sorted = [olderPast, upcoming, past, active]
      .slice()
      .sort((a, b) => compareEventChrono(a, b, today));

    expect(sorted).toEqual([active, upcoming, past, olderPast]);
  });

  it("orders two upcoming events soonest-first", () => {
    const a = { start_date: "2026-05-01", end_date: "2026-05-02" };
    const b = { start_date: "2026-06-01", end_date: "2026-06-02" };
    const sorted = [b, a].slice().sort((x, y) => compareEventChrono(x, y, today));
    expect(sorted).toEqual([a, b]);
  });

  it("orders two past events most-recent-first", () => {
    const recent = { start_date: "2026-03-01", end_date: "2026-03-02" };
    const old = { start_date: "2025-01-01", end_date: "2025-01-02" };
    const sorted = [old, recent].slice().sort((x, y) =>
      compareEventChrono(x, y, today)
    );
    expect(sorted).toEqual([recent, old]);
  });

  it("treats today as active when it equals start_date or end_date", () => {
    const startsToday = { start_date: "2026-04-27", end_date: "2026-04-30" };
    const endsToday = { start_date: "2026-04-25", end_date: "2026-04-27" };
    const future = { start_date: "2026-05-01", end_date: "2026-05-02" };
    const sorted = [future, endsToday, startsToday]
      .slice()
      .sort((a, b) => compareEventChrono(a, b, today));
    // Both active items come first; their relative order is by start_date asc.
    expect(sorted[2]).toEqual(future);
    expect(sorted.slice(0, 2)).toEqual(
      [endsToday, startsToday].sort((a, b) =>
        a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0
      )
    );
  });
});

describe("localTodayKey", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    const out = localTodayKey();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns the same date string when called twice in quick succession", () => {
    const a = localTodayKey();
    const b = localTodayKey();
    expect(a).toBe(b);
  });
});

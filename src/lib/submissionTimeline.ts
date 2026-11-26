import type { ApiSubmissionTimeline, ApiTimelineEvent } from "@/schemas";

/** First day the chart shows, in days from day 0 (the event's start). */
export const TIMELINE_FROM_DAY = -42;

/** What a curve's height measures. */
export type TimelineUnit = "percent" | "count";

export type TimelinePoint = { day: number; value: number };

/** Which of an edition's two lines: entered in the event, or its songs added to deejaytools. */
export type TimelineSeries = "submitted" | "added";

export type TimelineCurve = {
  id: string;
  name: string;
  /** The event the page is for; the rest are earlier editions. */
  current: boolean;
  /**
   * What 100% is, when the chart shows shares: its registration list plus its
   * entries not on it, and never less than its line reaches; null when the
   * chart counts instead.
   */
  base: number | null;
  /** Submissions, cumulative, one point per day from the chart's first day to its last. */
  points: TimelinePoint[];
  /**
   * The current event only (empty for earlier editions, whose music is all
   * in): its submissions by the day their songs were added to deejaytools,
   * plus, when `likelyOnFile`, the entries likely on file by the day their
   * song was added. On the same days as `points`.
   */
  added: TimelinePoint[];
};

export type TimelineOptions = {
  /** First day the chart shows. */
  fromDay?: number;
  /** Count the event's entries likely on file into its added line (admins only). */
  likelyOnFile?: boolean;
  /**
   * The current event's entries with music in that are not on its
   * registration list (staff reconcile the two; earlier editions are not).
   * Each is assumed to register, so it adds to what 100% is.
   */
  unregisteredEntries?: number;
};

export type TimelineChart = {
  unit: TimelineUnit;
  fromDay: number;
  toDay: number;
  /** Today, in days from the current event's start. */
  today: number;
  curves: TimelineCurve[];
};

/** Days from start_date to end_date: the event's last day, counted from day 0. */
export function lastEventDay(event: Pick<ApiTimelineEvent, "start_date" | "end_date">): number {
  const ms = Date.parse(`${event.end_date}T00:00:00Z`) - Date.parse(`${event.start_date}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * The chart's curves: each event's entries with music in added up day by
 * day, as a share of its entries when every event has a registration list
 * (so editions of different sizes compare), else as counts. An event's
 * entries are its registration list plus, for the current event, its entries
 * with music in that are not on the list (`unregisteredEntries`, assumed to
 * register); an earlier edition's are never fewer than it had music for. So
 * no line goes over 100%. The current event also gets the
 * music already in deejaytools for it: its submissions by the day their songs
 * were added, plus (`likelyOnFile`, admins) the entries likely on file, a
 * projection of how much is in. An earlier edition has one line: its music
 * is all in. Days before the first day shown are in each line's starting
 * value (a song uploaded a season ago starts the added line above zero). The
 * current event stops at today; an earlier edition runs to its last day, or
 * its last submission if later.
 */
export function buildTimelineChart(
  timeline: ApiSubmissionTimeline,
  { fromDay = TIMELINE_FROM_DAY, likelyOnFile = false, unregisteredEntries = 0 }: TimelineOptions = {}
): TimelineChart | null {
  const [current, ...earlier] = timeline.events;
  if (!current) return null;
  const unit: TimelineUnit = timeline.events.every((e) => e.registrations > 0) ? "percent" : "count";
  const lastDay = (e: ApiTimelineEvent, isCurrent: boolean) => {
    if (isCurrent) return Math.min(timeline.today, lastEventDay(e));
    const lastSubmission = e.days.length > 0 ? e.days[e.days.length - 1].day : fromDay;
    return Math.max(lastEventDay(e), lastSubmission);
  };
  const curves = [current, ...earlier].map((e, i) => {
    const isCurrent = i === 0;
    const end = lastDay(e, isCurrent);
    const addedDays = isCurrent ? [...e.song_added_days, ...(likelyOnFile ? e.likely_on_file_days : [])] : [];
    const base =
      unit === "percent"
        ? Math.max(e.registrations + (isCurrent ? unregisteredEntries : 0), countOf(e.days), countOf(addedDays))
        : null;
    const cumulative = (days: ApiTimelineEvent["days"]): TimelinePoint[] => {
      let total = days.filter((d) => d.day < fromDay).reduce((t, d) => t + d.count, 0);
      // Sum, not overwrite: the added line merges two lists that can share a day.
      const byDay = new Map<number, number>();
      for (const d of days) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.count);
      const points: TimelinePoint[] = [];
      for (let day = fromDay; day <= end; day++) {
        total += byDay.get(day) ?? 0;
        points.push({ day, value: base ? (100 * total) / base : total });
      }
      return points;
    };
    return {
      id: e.id,
      name: e.name,
      current: isCurrent,
      base,
      points: cumulative(e.days),
      added: isCurrent ? cumulative(addedDays) : [],
    };
  });
  const toDay = Math.max(lastEventDay(current), ...curves.map((c) => c.points.at(-1)?.day ?? fromDay));
  return { unit, fromDay, toDay, today: timeline.today, curves };
}

/** How many a list of days counts in all. */
function countOf(days: readonly { count: number }[]): number {
  return days.reduce((total, d) => total + d.count, 0);
}

/** A curve's value on ``day`` (its submitted line, or its added line), or null when it has no point there. */
export function valueOn(curve: TimelineCurve, day: number, series: TimelineSeries = "submitted"): number | null {
  const points = series === "added" ? curve.added : curve.points;
  return points.find((p) => p.day === day)?.value ?? null;
}

/** "Day −8", "Day 0", "Day 2": a day as the chart names it. */
export function dayLabel(day: number): string {
  return `Day ${day < 0 ? `−${-day}` : day}`;
}

/** "48%" or "87": a value as the chart shows it. */
export function formatValue(value: number, unit: TimelineUnit): string {
  return unit === "percent" ? `${Math.round(value)}%` : `${Math.round(value)}`;
}

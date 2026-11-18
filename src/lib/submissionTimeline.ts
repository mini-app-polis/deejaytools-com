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
  /** What 100% is: its registration list; null when the chart counts instead. */
  base: number | null;
  /** Submissions, cumulative, one point per day from the chart's first day to its last. */
  points: TimelinePoint[];
  /** The same submissions by the day their songs were added to deejaytools, on the same days. */
  added: TimelinePoint[];
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
 * The chart's curves: each event's submissions added up day by day, as a
 * share of its registration list when every event has one (so editions of
 * different sizes compare), else as counts; and beside them the same
 * submissions by the day their songs were added to deejaytools. Days before
 * the first day shown are in each line's starting value (a song uploaded a
 * season ago starts the added line above zero). The current event stops at
 * today; an earlier edition runs to its last day, or its last submission if
 * later.
 */
export function buildTimelineChart(
  timeline: ApiSubmissionTimeline,
  fromDay: number = TIMELINE_FROM_DAY
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
    const base = unit === "percent" ? e.registrations : null;
    const cumulative = (days: ApiTimelineEvent["days"]): TimelinePoint[] => {
      let total = days.filter((d) => d.day < fromDay).reduce((t, d) => t + d.count, 0);
      const byDay = new Map(days.map((d) => [d.day, d.count]));
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
      added: cumulative(e.song_added_days),
    };
  });
  const toDay = Math.max(lastEventDay(current), ...curves.map((c) => c.points.at(-1)?.day ?? fromDay));
  return { unit, fromDay, toDay, today: timeline.today, curves };
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

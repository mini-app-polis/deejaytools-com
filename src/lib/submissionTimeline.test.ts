import { describe, expect, it } from "vitest";
import type { ApiSubmissionTimeline, ApiTimelineEvent } from "@/schemas";
import { buildTimelineChart, dayLabel, formatValue, lastEventDay, valueOn } from "./submissionTimeline";

function event(overrides: Partial<ApiTimelineEvent>): ApiTimelineEvent {
  return {
    id: "ev",
    name: "Event",
    start_date: "2026-11-25",
    end_date: "2026-11-29",
    registrations: 0,
    submissions: 0,
    days: [],
    ...overrides,
  };
}

describe("lastEventDay", () => {
  it("counts the days from the start to the last day", () => {
    expect(lastEventDay({ start_date: "2026-11-25", end_date: "2026-11-29" })).toBe(4);
    expect(lastEventDay({ start_date: "2026-03-07", end_date: "2026-03-08" })).toBe(1);
  });
});

describe("buildTimelineChart", () => {
  it("is nothing without an event", () => {
    expect(buildTimelineChart({ series: null, today: 0, events: [] })).toBeNull();
  });

  it("adds up each event's days as a share of its registrations", () => {
    const timeline: ApiSubmissionTimeline = {
      series: "The Open",
      today: -8,
      events: [
        event({ id: "now", registrations: 10, days: [{ day: -50, count: 1 }, { day: -9, count: 2 }] }),
        event({
          id: "then",
          start_date: "2025-11-26",
          end_date: "2025-11-30",
          registrations: 4,
          days: [{ day: -8, count: 2 }, { day: 6, count: 2 }],
        }),
      ],
    };
    const chart = buildTimelineChart(timeline, -10)!;
    expect(chart.unit).toBe("percent");
    const [now, then] = chart.curves;
    expect(now.current).toBe(true);
    // Before the first day shown counts in its starting value; it stops at today.
    expect(now.points[0]).toEqual({ day: -10, value: 10 });
    expect(valueOn(now, -9)).toBe(30);
    expect(now.points.at(-1)).toEqual({ day: -8, value: 30 });
    // An earlier edition runs to its last submission when that is after its last day.
    expect(then.current).toBe(false);
    expect(valueOn(then, -8)).toBe(50);
    expect(then.points.at(-1)).toEqual({ day: 6, value: 100 });
    expect(chart.toDay).toBe(6);
  });

  it("counts when an event has no registration list", () => {
    const chart = buildTimelineChart({
      series: null,
      today: 10,
      events: [event({ registrations: 0, days: [{ day: -1, count: 3 }] })],
    })!;
    expect(chart.unit).toBe("count");
    // A finished event runs to its last day, not to today.
    expect(chart.curves[0].points.at(-1)).toEqual({ day: 4, value: 3 });
    expect(chart.curves[0].base).toBeNull();
  });
});

describe("labels", () => {
  it("names days and values", () => {
    expect(dayLabel(-8)).toBe("Day −8");
    expect(dayLabel(0)).toBe("Day 0");
    expect(formatValue(47.54, "percent")).toBe("48%");
    expect(formatValue(87, "count")).toBe("87");
  });
});

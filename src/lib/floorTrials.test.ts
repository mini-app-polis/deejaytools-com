import { describe, expect, it } from "vitest";
import {
  countFloorTrials,
  countFloorTrialsByEvent,
  floorTrialBucket,
  formatFloorTrials,
} from "./floorTrials";

const s = (status: string, eventId: string | null = "ev1") => ({ event_id: eventId, status });

describe("floorTrialBucket", () => {
  it("treats check-in-open and in-progress alike as active", () => {
    expect(floorTrialBucket("checkin_open")).toBe("active");
    expect(floorTrialBucket("in_progress")).toBe("active");
  });

  it("maps the remaining known statuses", () => {
    expect(floorTrialBucket("scheduled")).toBe("upcoming");
    expect(floorTrialBucket("completed")).toBe("completed");
    expect(floorTrialBucket("cancelled")).toBe("cancelled");
  });

  it("returns null for an unrecognised status", () => {
    // A status added server-side should be ignored, not silently miscounted
    // into one of the visible buckets.
    expect(floorTrialBucket("paused")).toBeNull();
    expect(floorTrialBucket("")).toBeNull();
  });
});

describe("countFloorTrials", () => {
  it("tallies each bucket", () => {
    expect(
      countFloorTrials([
        s("checkin_open"),
        s("in_progress"),
        s("scheduled"),
        s("scheduled"),
        s("completed"),
        s("cancelled"),
      ])
    ).toEqual({ active: 2, upcoming: 2, completed: 1, cancelled: 1 });
  });

  it("is all zeroes for no sessions", () => {
    expect(countFloorTrials([])).toEqual({
      active: 0,
      upcoming: 0,
      completed: 0,
      cancelled: 0,
    });
  });
});

describe("countFloorTrialsByEvent", () => {
  it("keeps each event's tally separate", () => {
    const counts = countFloorTrialsByEvent([
      s("scheduled", "ev1"),
      s("in_progress", "ev1"),
      s("completed", "ev2"),
    ]);
    expect(counts.get("ev1")).toMatchObject({ active: 1, upcoming: 1, completed: 0 });
    expect(counts.get("ev2")).toMatchObject({ active: 0, upcoming: 0, completed: 1 });
  });

  it("drops sessions with no event", () => {
    const counts = countFloorTrialsByEvent([s("scheduled", null), s("scheduled", "ev1")]);
    expect([...counts.keys()]).toEqual(["ev1"]);
  });
});

describe("formatFloorTrials", () => {
  it("lists active, upcoming and completed in that order", () => {
    expect(
      formatFloorTrials({ active: 1, upcoming: 2, completed: 3, cancelled: 0 })
    ).toBe("1 active · 2 upcoming · 3 completed");
  });

  it("omits empty buckets rather than showing zeroes", () => {
    expect(formatFloorTrials({ active: 0, upcoming: 2, completed: 0, cancelled: 0 })).toBe(
      "2 upcoming"
    );
    expect(formatFloorTrials({ active: 1, upcoming: 0, completed: 3, cancelled: 0 })).toBe(
      "1 active · 3 completed"
    );
  });

  it("never surfaces cancelled sessions", () => {
    expect(formatFloorTrials({ active: 0, upcoming: 0, completed: 0, cancelled: 4 })).toBe(
      "none scheduled yet"
    );
  });

  it("says so in words when there is nothing to show", () => {
    expect(formatFloorTrials({ active: 0, upcoming: 0, completed: 0, cancelled: 0 })).toBe(
      "none scheduled yet"
    );
  });
});

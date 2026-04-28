import { describe, expect, it } from "vitest";
import { formatSessionTitle, formatTimeOnly } from "./sessionFormat";

// All tests pass an explicit IANA timezone so results are stable regardless of
// the host machine's locale or timezone setting.
const TZ = "America/New_York";

describe("formatTimeOnly", () => {
  it("renders just the hour and minute (no seconds, no date)", () => {
    // 7:30 AM Eastern = 12:30 UTC
    const ts = new Date("2026-04-27T12:30:00Z").getTime();
    expect(formatTimeOnly(ts, TZ)).toBe("8:30 AM");
  });

  it("renders PM times in 12-hour form", () => {
    // 7:30 PM Eastern = 23:30 UTC
    const ts = new Date("2026-04-27T23:30:00Z").getTime();
    expect(formatTimeOnly(ts, TZ)).toBe("7:30 PM");
  });

  it("zero-pads the minutes", () => {
    // 7:05 PM Eastern = 23:05 UTC
    const ts = new Date("2026-04-27T23:05:00Z").getTime();
    expect(formatTimeOnly(ts, TZ)).toBe("7:05 PM");
  });

  it("handles noon and midnight in the given timezone", () => {
    // Noon Eastern = 16:00 UTC; midnight Eastern = 04:00 UTC
    const noon = new Date("2026-04-27T16:00:00Z").getTime();
    const midnight = new Date("2026-04-27T04:00:00Z").getTime();
    expect(formatTimeOnly(noon, TZ)).toBe("12:00 PM");
    expect(formatTimeOnly(midnight, TZ)).toBe("12:00 AM");
  });

  it("falls back gracefully when no timezone is passed (does not throw)", () => {
    const ts = new Date("2026-04-27T12:00:00Z").getTime();
    expect(() => formatTimeOnly(ts)).not.toThrow();
    expect(() => formatTimeOnly(ts, null)).not.toThrow();
  });
});

describe("formatSessionTitle", () => {
  it("formats as 'Day - Time - Date' anchored to floor_trial_starts_at", () => {
    // Monday April 27 2026, 8:00 AM Eastern = 12:00 UTC
    const ts = new Date("2026-04-27T12:00:00Z").getTime();
    expect(formatSessionTitle({ floor_trial_starts_at: ts }, TZ))
      .toBe("Monday - 8:00 AM - April 27, 2026");
  });

  it("uses the floor-trial start time, not check-in opens", () => {
    // Saturday May 23 2026, 7:30 PM Eastern = 23:30 UTC
    const ts = new Date("2026-05-23T23:30:00Z").getTime();
    expect(formatSessionTitle({ floor_trial_starts_at: ts }, TZ))
      .toBe("Saturday - 7:30 PM - May 23, 2026");
  });

  it("renders Sunday correctly (timezone boundary must not slip the day)", () => {
    // Sunday May 24 2026, 7:00 AM Eastern = 11:00 UTC
    const ts = new Date("2026-05-24T11:00:00Z").getTime();
    expect(formatSessionTitle({ floor_trial_starts_at: ts }, TZ))
      .toBe("Sunday - 7:00 AM - May 24, 2026");
  });

  it("renders the full month name, not abbreviated", () => {
    // Feb 15 2026, 1:00 PM Eastern = 18:00 UTC
    const ts = new Date("2026-02-15T18:00:00Z").getTime();
    const out = formatSessionTitle({ floor_trial_starts_at: ts }, TZ);
    expect(out).toContain("February");
    expect(out).not.toContain("Feb,");
    expect(out).not.toContain("Feb ");
  });

  it("falls back gracefully when no timezone is passed (does not throw)", () => {
    const ts = new Date("2026-04-27T12:00:00Z").getTime();
    expect(() => formatSessionTitle({ floor_trial_starts_at: ts })).not.toThrow();
    expect(() => formatSessionTitle({ floor_trial_starts_at: ts }, null)).not.toThrow();
  });
});

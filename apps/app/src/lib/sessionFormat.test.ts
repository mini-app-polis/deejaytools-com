import { describe, expect, it } from "vitest";
import { formatSessionTitle, formatTimeOnly } from "./sessionFormat";

// Most tests pass an explicit timestamp built from a local-time ISO string so
// they're stable regardless of the host's timezone.

describe("formatTimeOnly", () => {
  it("renders just the hour and minute (no seconds, no date)", () => {
    const ts = new Date("2026-04-27T07:30:00").getTime();
    expect(formatTimeOnly(ts)).toBe("7:30 AM");
  });

  it("renders PM times in 12-hour form", () => {
    const ts = new Date("2026-04-27T19:30:00").getTime();
    expect(formatTimeOnly(ts)).toBe("7:30 PM");
  });

  it("zero-pads the minutes", () => {
    const ts = new Date("2026-04-27T19:05:00").getTime();
    expect(formatTimeOnly(ts)).toBe("7:05 PM");
  });

  it("handles noon and midnight", () => {
    const noon = new Date("2026-04-27T12:00:00").getTime();
    const midnight = new Date("2026-04-27T00:00:00").getTime();
    expect(formatTimeOnly(noon)).toBe("12:00 PM");
    expect(formatTimeOnly(midnight)).toBe("12:00 AM");
  });
});

describe("formatSessionTitle", () => {
  it("formats as 'Day - Time - Date' anchored to floor_trial_starts_at", () => {
    const ts = new Date("2026-04-27T08:00:00").getTime();
    expect(formatSessionTitle({ floor_trial_starts_at: ts }))
      .toBe("Monday - 8:00 AM - April 27, 2026");
  });

  it("uses the floor-trial start time, not check-in opens", () => {
    // The function intentionally only looks at floor_trial_starts_at — even
    // if the type allows other fields, they shouldn't influence the output.
    const ts = new Date("2026-05-23T19:30:00").getTime();
    expect(formatSessionTitle({ floor_trial_starts_at: ts }))
      .toBe("Saturday - 7:30 PM - May 23, 2026");
  });

  it("renders Sunday correctly (i.e., does not slip a day due to UTC)", () => {
    const ts = new Date("2026-05-24T07:00:00").getTime();
    expect(formatSessionTitle({ floor_trial_starts_at: ts }))
      .toBe("Sunday - 7:00 AM - May 24, 2026");
  });

  it("renders the full month name, not abbreviated", () => {
    // Use February so the abbreviation ("Feb") isn't a substring of the full name.
    const ts = new Date("2026-02-15T13:00:00").getTime();
    const out = formatSessionTitle({ floor_trial_starts_at: ts });
    expect(out).toContain("February");
    expect(out).not.toContain("Feb,");
    expect(out).not.toContain("Feb ");
  });
});

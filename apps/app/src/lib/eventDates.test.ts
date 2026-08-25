import { describe, expect, it } from "vitest";
import { eventDurationDays, formatEventDateRange, parseCalendarDate } from "./eventDates";

describe("parseCalendarDate", () => {
  it("anchors to local noon on the stated calendar day", () => {
    const d = parseCalendarDate("2026-08-24")!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // August
    expect(d.getDate()).toBe(24);
    // Noon, not midnight — this is what keeps a negative UTC offset from
    // rendering the previous day.
    expect(d.getHours()).toBe(12);
  });

  it("returns null for anything that is not YYYY-MM-DD", () => {
    expect(parseCalendarDate("08/24/2026")).toBeNull();
    expect(parseCalendarDate("2026-8-24")).toBeNull();
    expect(parseCalendarDate("")).toBeNull();
  });
});

describe("formatEventDateRange", () => {
  it("renders a single day with its year", () => {
    expect(formatEventDateRange("2026-06-15", "2026-06-15")).toBe("June 15, 2026");
  });

  it("states the month once for a range inside one month", () => {
    expect(formatEventDateRange("2026-07-01", "2026-07-05")).toBe("July 1 – 5, 2026");
  });

  it("states both months once for a range inside one year", () => {
    expect(formatEventDateRange("2026-08-24", "2026-10-02")).toBe("August 24 – October 2, 2026");
  });

  it("states both years for a range that crosses new year", () => {
    expect(formatEventDateRange("2026-12-30", "2027-01-02")).toBe(
      "December 30, 2026 – January 2, 2027"
    );
  });

  it("does not shift the day for viewers behind UTC", () => {
    // The bug this guards: new Date("2026-01-01") is UTC midnight, which is
    // Dec 31 in every US timezone.
    expect(formatEventDateRange("2026-01-01", "2026-01-01")).toBe("January 1, 2026");
  });

  it("falls back to the raw strings when a date is malformed", () => {
    expect(formatEventDateRange("nope", "nope")).toBe("nope");
    expect(formatEventDateRange("nope", "later")).toBe("nope – later");
  });
});

describe("eventDurationDays", () => {
  it("counts inclusively", () => {
    expect(eventDurationDays("2026-08-24", "2026-08-24")).toBe(1);
    expect(eventDurationDays("2026-08-24", "2026-08-26")).toBe(3);
  });

  it("counts across a month boundary", () => {
    expect(eventDurationDays("2026-08-24", "2026-10-02")).toBe(40);
  });

  it("counts across a DST transition", () => {
    // US DST ends Nov 1 2026; the wall clock shifts an hour inside this range.
    expect(eventDurationDays("2026-10-30", "2026-11-03")).toBe(5);
  });

  it("returns null for malformed or inverted ranges", () => {
    expect(eventDurationDays("nope", "2026-08-24")).toBeNull();
    expect(eventDurationDays("2026-08-26", "2026-08-24")).toBeNull();
  });
});

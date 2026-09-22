import { describe, expect, it } from "vitest";
import { epochToDateInTz, epochToTimeInTz, toEpochInTz } from "./zonedTime";

function wallClock(epoch: number, tz: string): string {
  return new Date(epoch).toLocaleString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

describe("toEpochInTz", () => {
  it("stores 2026-11-26 06:00 in America/Los_Angeles on Thu Nov 26 (regression)", () => {
    const epoch = toEpochInTz("2026-11-26", "06:00", "America/Los_Angeles");
    expect(wallClock(epoch, "America/Los_Angeles")).toBe("Thu, Nov 26, 6:00 AM");
  });

  it("stores 2026-11-26 16:00 in America/Los_Angeles on Thu Nov 26", () => {
    const epoch = toEpochInTz("2026-11-26", "16:00", "America/Los_Angeles");
    expect(wallClock(epoch, "America/Los_Angeles")).toBe("Thu, Nov 26, 4:00 PM");
  });

  it.each([
    ["America/Chicago", "Thu, Nov 26, 5:00 AM"],
    ["America/New_York", "Thu, Nov 26, 5:00 AM"],
    ["America/Denver", "Thu, Nov 26, 5:00 AM"],
    ["America/Los_Angeles", "Thu, Nov 26, 5:00 AM"],
  ] as const)("stores 2026-11-26 05:00 in %s as %s", (tz, expected) => {
    const epoch = toEpochInTz("2026-11-26", "05:00", tz);
    expect(wallClock(epoch, tz)).toBe(expected);
  });

  it("stores midnight in America/Los_Angeles on the intended calendar day", () => {
    const epoch = toEpochInTz("2026-11-26", "00:00", "America/Los_Angeles");
    expect(wallClock(epoch, "America/Los_Angeles")).toBe("Thu, Nov 26, 12:00 AM");
  });

  it("handles Asia/Tokyo morning and evening without day slip", () => {
    const morning = toEpochInTz("2026-11-26", "06:00", "Asia/Tokyo");
    const evening = toEpochInTz("2026-11-26", "22:00", "Asia/Tokyo");
    expect(wallClock(morning, "Asia/Tokyo")).toBe("Thu, Nov 26, 6:00 AM");
    expect(wallClock(evening, "Asia/Tokyo")).toBe("Thu, Nov 26, 10:00 PM");
  });

  it("keeps 2026-11-01 01:30 in America/Chicago on Nov 1 during DST end", () => {
    const epoch = toEpochInTz("2026-11-01", "01:30", "America/Chicago");
    expect(wallClock(epoch, "America/Chicago")).toBe("Sun, Nov 1, 1:30 AM");
  });

  it("keeps 2026-03-08 06:00 in America/Chicago on Mar 8 during DST begin", () => {
    const epoch = toEpochInTz("2026-03-08", "06:00", "America/Chicago");
    expect(wallClock(epoch, "America/Chicago")).toBe("Sun, Mar 8, 6:00 AM");
  });

  it("falls back to browser local time for an invalid zone", () => {
    const expected = new Date("2026-11-26T06:00:00").getTime();
    expect(toEpochInTz("2026-11-26", "06:00", "Not/A_Zone")).toBe(expected);
  });
});

describe("round-trip", () => {
  const cases = [
    { date: "2026-11-26", time: "06:00", tz: "America/Los_Angeles" },
    { date: "2026-11-26", time: "16:00", tz: "America/Los_Angeles" },
    { date: "2026-11-26", time: "05:00", tz: "America/Chicago" },
    { date: "2026-11-26", time: "00:00", tz: "America/Los_Angeles" },
    { date: "2026-11-26", time: "06:00", tz: "Asia/Tokyo" },
    { date: "2026-11-26", time: "22:00", tz: "Asia/Tokyo" },
    { date: "2026-03-08", time: "06:00", tz: "America/Chicago" },
    { date: "2026-11-01", time: "01:30", tz: "America/Chicago" },
  ] as const;

  it.each(cases)("toEpochInTz -> epochToTimeInTz / epochToDateInTz for $date $time $tz", ({
    date,
    time,
    tz,
  }) => {
    const epoch = toEpochInTz(date, time, tz);
    expect(epochToDateInTz(epoch, tz)).toBe(date);
    expect(epochToTimeInTz(epoch, tz)).toBe(time);
  });
});

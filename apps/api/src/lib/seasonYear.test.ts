import { describe, expect, it } from "vitest";
import {
  seasonYearFromDate,
  seasonYearFromDateString,
  seasonYearFromTimestamp,
} from "./seasonYear.js";

describe("seasonYearFromDateString", () => {
  it("maps September 30 to the same calendar year", () => {
    expect(seasonYearFromDateString("2026-09-30")).toBe("2026");
  });

  it("maps October 1 to the following calendar year", () => {
    expect(seasonYearFromDateString("2026-10-01")).toBe("2027");
  });

  it("maps January 1 to the same calendar year", () => {
    expect(seasonYearFromDateString("2026-01-01")).toBe("2026");
  });

  it("maps December 31 to the following calendar year", () => {
    expect(seasonYearFromDateString("2026-12-31")).toBe("2027");
  });

  it("uses the October boundary rather than the old November rule", () => {
    expect(seasonYearFromDateString("2026-10-15")).toBe("2027");
  });

  it("throws on garbage input", () => {
    expect(() => seasonYearFromDateString("garbage")).toThrow(/Invalid date string/);
  });
});

describe("seasonYearFromTimestamp", () => {
  it("agrees with seasonYearFromDate for the same instant", () => {
    const d = new Date("2026-10-15T12:00:00");
    expect(seasonYearFromTimestamp(d.getTime())).toBe(seasonYearFromDate(d));
  });
});

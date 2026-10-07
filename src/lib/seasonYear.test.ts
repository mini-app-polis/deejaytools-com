import { describe, expect, it } from "vitest";
import { SEASON_ROLLOVER_MONTH, seasonYearFromDateString } from "./seasonYear";

describe("seasonYearFromDateString", () => {
  it("rolls over in October", () => {
    expect(SEASON_ROLLOVER_MONTH).toBe(10);
  });

  it("keeps the calendar year for dates before the rollover month", () => {
    expect(seasonYearFromDateString("2026-01-15")).toBe("2026");
    expect(seasonYearFromDateString("2026-09-30")).toBe("2026");
  });

  it("advances to the next year from the rollover month onward", () => {
    expect(seasonYearFromDateString("2026-10-01")).toBe("2027");
    expect(seasonYearFromDateString("2026-12-31")).toBe("2027");
  });

  it("returns an empty string for unparseable input", () => {
    expect(seasonYearFromDateString("")).toBe("");
    expect(seasonYearFromDateString("not-a-date")).toBe("");
    expect(seasonYearFromDateString("2026")).toBe("");
  });
});

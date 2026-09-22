import { describe, expect, it } from "vitest";
import { isFollowerAmDivision } from "./index.js";

describe("isFollowerAmDivision", () => {
  it("matches ProAm FollowerAm exactly", () => {
    expect(isFollowerAmDivision("ProAm FollowerAm")).toBe(true);
    expect(isFollowerAmDivision("  ProAm FollowerAm  ")).toBe(true);
  });

  it("does not match ProAm LeaderAm", () => {
    expect(isFollowerAmDivision("ProAm LeaderAm")).toBe(false);
  });

  it("does not match unrelated divisions", () => {
    expect(isFollowerAmDivision("Classic")).toBe(false);
    expect(isFollowerAmDivision("Teams")).toBe(false);
    expect(isFollowerAmDivision("")).toBe(false);
    expect(isFollowerAmDivision(null)).toBe(false);
    expect(isFollowerAmDivision(undefined)).toBe(false);
  });

  it("does not fuzzy-match near-misses", () => {
    expect(isFollowerAmDivision("proam followeram")).toBe(false);
  });
});

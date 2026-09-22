import { describe, expect, it } from "vitest";
import {
  roundsConflict,
  roundsOccupied,
  SUBMISSION_ROUNDS,
  type SubmissionRound,
} from "./index.js";

describe("roundsOccupied", () => {
  it.each([
    ["prelims_and_finals", ["prelims", "finals"]],
    ["prelims_only", ["prelims"]],
    ["finals_only", ["finals"]],
  ] as const satisfies readonly [SubmissionRound, readonly ("prelims" | "finals")[]][])(
    "%s occupies %j",
    (round, occupied) => {
      expect(roundsOccupied(round)).toEqual(occupied);
    }
  );
});

describe("roundsConflict", () => {
  it("prelims_only and finals_only do not conflict", () => {
    expect(roundsConflict("prelims_only", "finals_only")).toBe(false);
    expect(roundsConflict("finals_only", "prelims_only")).toBe(false);
  });

  it("prelims_only conflicts with itself and with prelims_and_finals", () => {
    expect(roundsConflict("prelims_only", "prelims_only")).toBe(true);
    expect(roundsConflict("prelims_only", "prelims_and_finals")).toBe(true);
    expect(roundsConflict("prelims_and_finals", "prelims_only")).toBe(true);
  });

  it("prelims_and_finals conflicts with every round", () => {
    for (const other of SUBMISSION_ROUNDS) {
      expect(roundsConflict("prelims_and_finals", other)).toBe(true);
    }
  });

  it("finals_only conflicts with itself and with prelims_and_finals", () => {
    expect(roundsConflict("finals_only", "finals_only")).toBe(true);
    expect(roundsConflict("finals_only", "prelims_and_finals")).toBe(true);
  });
});

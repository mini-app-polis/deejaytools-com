import { describe, expect, it } from "vitest";
import type { ApiEventSongSubmission, ApiSong, SubmissionRound } from "@/schemas";
import { classicRoundLabel, missingClassicRounds, roundDisplayLabel } from "./submissionRounds";

function song(id: string, partnerId: string | null = "p1"): ApiSong {
  return { id, user_id: "u1", partner_id: partnerId, managed_partnership_id: null } as ApiSong;
}

function sub(songId: string, round: SubmissionRound, division = "Classic"): ApiEventSongSubmission {
  return { id: `s-${songId}`, song_id: songId, division, round } as ApiEventSongSubmission;
}

describe("roundDisplayLabel", () => {
  it.each([
    ["prelims_only", "Prelims only"],
    ["finals_only", "Finals only"],
    ["prelims_and_finals", "Prelims & finals"],
  ] as const)("labels %s", (round, label) => {
    expect(roundDisplayLabel(round)).toBe(label);
  });
});

describe("missingClassicRounds", () => {
  it("flags prelims when only finals is entered", () => {
    const result = missingClassicRounds([sub("a", "finals_only")], [song("a")]);
    expect(result).toEqual([{ missing: "prelims", entered: [sub("a", "finals_only")] }]);
  });

  it("flags finals when only prelims is entered", () => {
    const result = missingClassicRounds([sub("a", "prelims_only")], [song("a")]);
    expect(result.map((r) => r.missing)).toEqual(["finals"]);
  });

  it("is clear when one song covers both rounds", () => {
    expect(missingClassicRounds([sub("a", "prelims_and_finals")], [song("a")])).toEqual([]);
  });

  it("is clear when the same entity has a prelims and a finals song", () => {
    const subs = [sub("a", "prelims_only"), sub("b", "finals_only")];
    expect(missingClassicRounds(subs, [song("a"), song("b")])).toEqual([]);
  });

  it("checks each entity on its own", () => {
    const subs = [sub("a", "prelims_only"), sub("b", "finals_only")];
    const result = missingClassicRounds(subs, [song("a", "p1"), song("b", "p2")]);
    expect(result.map((r) => r.missing)).toEqual(["finals", "prelims"]);
  });

  it("ignores other divisions", () => {
    expect(missingClassicRounds([sub("a", "prelims_and_finals", "Showcase")], [song("a")])).toEqual([]);
  });
});

describe("classicRoundLabel", () => {
  it("labels a Classic entry where rounds split", () => {
    expect(classicRoundLabel({ division: "Classic", round: "prelims_only" }, true)).toBe("Prelims only");
  });

  it("is null for other divisions or where rounds do not split", () => {
    expect(classicRoundLabel({ division: "Showcase", round: "prelims_and_finals" }, true)).toBeNull();
    expect(classicRoundLabel({ division: "Classic", round: "finals_only" }, false)).toBeNull();
  });
});

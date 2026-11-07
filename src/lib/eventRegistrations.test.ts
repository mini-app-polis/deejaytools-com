import { describe, expect, it } from "vitest";
import type { ApiAdminEventSongSubmission, ApiEventRegistration } from "@/schemas";
import { TEST_DIVISIONS } from "@/test/divisions";
import {
  divisionForRegistration,
  parseRegistrationPaste,
  reconcileRegistrations,
  registrationLines,
  sameName,
} from "./eventRegistrations";

const row = (...cells: string[]) => cells.join("\t");

// The Open's export, abridged: section headings, a header row, "Countries"
// rows, a missing location, a row with no number, a team.
const OPEN_EXPORT = [
  row("", "Division", "Dancer 1", "", "", "Dancer 2", "", "Location", "Picture in SD", "Picture in Google Drive"),
  row("CLASSIC", "", "", "", "", "", "", "", "", ""),
  row("1", "Classic (NASDE)", "Aidan Keith-Hynes", "P", "Spring Valley, California", "Jade Bryan", "P", "San Diego, California", "TRUE", "FALSE"),
  row("19", "Classic (NASDE)", "Thomas Carter", "SD", "Huntington Beach, CA", "Lisa Picard", "", "", "FALSE", "FALSE"),
  row("", "Countries", "", "", "", "", "", "", "", ""),
  row("TEAMS", "", "", "", "", "", "", "", "", ""),
  row("2", "Teams", "Future. WOW.", "", "", "Gregory & Lemery Rollinscott", "", "", "TRUE", "FALSE"),
  row("", "SWING - Pro Am Routine - Open Follow AM (ages 6+)", "Jubilee Rasmussen", "", "", "Douglas Rousar", "", "", "FALSE", "FALSE"),
  row("3", "Masters  (age 50+)", "Starr Hodel", "", "", "Kerry Hodel", "SD", "Wilmington, NC", "FALSE", "FALSE"),
  "",
].join("\n");

describe("parseRegistrationPaste", () => {
  it("reads the entries and skips headings, header and totals rows", () => {
    const { entries, skipped } = parseRegistrationPaste(OPEN_EXPORT);
    expect(entries).toEqual([
      { division: "Classic (NASDE)", dancer_1: "Aidan Keith-Hynes", dancer_2: "Jade Bryan" },
      { division: "Classic (NASDE)", dancer_1: "Thomas Carter", dancer_2: "Lisa Picard" },
      { division: "Teams", dancer_1: "Future. WOW.", dancer_2: "Gregory & Lemery Rollinscott" },
      {
        division: "SWING - Pro Am Routine - Open Follow AM (ages 6+)",
        dancer_1: "Jubilee Rasmussen",
        dancer_2: "Douglas Rousar",
      },
      { division: "Masters (age 50+)", dancer_1: "Starr Hodel", dancer_2: "Kerry Hodel" },
    ]);
    expect(skipped).toBe(4);
  });

  it("follows a header row's columns and leaves dancer_2 out when blank", () => {
    const text = [row("Dancer 1", "Dancer 2", "Division"), row("Solo Person", "", "Showcase")].join("\n");
    expect(parseRegistrationPaste(text).entries).toEqual([{ division: "Showcase", dancer_1: "Solo Person" }]);
  });
});

describe("divisionForRegistration", () => {
  it.each([
    ["Classic (NASDE)", "Classic"],
    ["Showcase (NASDE)", "Showcase"],
    ["Rising Star (RST) - Classic", "Rising Star Classic"],
    ["Rising Star (RST) - Showcase", "Rising Star Showcase"],
    ["Sophisticated Swing (age 35+)", "Sophisticated"],
    ["Masters  (age 50+)", "Masters"],
    ["Young Adult (ages 14-17)", "Young Adult"],
    ["Teams", "Teams"],
    ["SWING - Pro Am Routine - Open Leader AM (ages 6+)", "ProAm LeaderAm"],
    ["SWING - Pro Am Routine - Sophisticated Follow AM (ages 35+)", "ProAm FollowerAm"],
    ["Rising Star Classic", "Rising Star Classic"],
    ["Lindy Hop Jam", null],
  ])("%s → %s", (name, division) => {
    expect(divisionForRegistration(name, TEST_DIVISIONS)).toBe(division);
  });
});

describe("sameName", () => {
  it.each([
    ["Hugo Miquez", "Hugo Miguez", true],
    ["Jaden Pfieffer", "Jaden Pfeiffer", true],
    ["Gordon Mac Donald", "Gordon MacDonald", true],
    ["MURIEL HOUIS", "Muriel Houis", true],
    ["Maïna Vila Cobarsi", "Maina Vila Cobarsi", true],
    ["Chris Low", "Christopher Low", true],
    ["Jennifer Sogluizzo", "Joey Sogluizzo", false],
    ["Ben McHenry", "Cameo McHenry", false],
    ["Kevin Kane", "Nataliya Kane", false],
  ])("%s / %s → %s", (a, b, same) => {
    expect(sameName(a, b)).toBe(same);
  });
});

function entry(over: Partial<ApiEventRegistration> & Pick<ApiEventRegistration, "division" | "dancer_1">): ApiEventRegistration {
  return {
    id: over.id ?? `${over.division}:${over.dancer_1}`,
    event_id: "e1",
    position: 0,
    dancer_2: null,
    linked_label: null,
    handled: false,
    note: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

let nextSub = 0;
function sub(partnership_label: string, division: string | null, round: ApiAdminEventSongSubmission["round"] = "prelims_and_finals"): ApiAdminEventSongSubmission {
  nextSub++;
  return {
    id: `s${nextSub}`,
    event_id: "e1",
    event_name: "The Open 2026",
    division,
    round,
    song_id: `song${nextSub}`,
    owner_user_id: "u1",
    song_label: `${partnership_label} ${division ?? ""}`,
    partnership_label,
    submitter_email: "a@example.com",
    created_at: nextSub,
  };
}

describe("reconcileRegistrations", () => {
  it("covers an entry by name in its division, in either order", () => {
    const entries = [entry({ division: "Classic (NASDE)", dancer_1: "Ben McHenry", dancer_2: "Cameo McHenry" })];
    const subs = [sub("Cameo Mchenry & Ben Mchenry", "Classic")];
    const { rows, unregistered } = reconcileRegistrations(entries, subs, TEST_DIVISIONS, false);
    expect(rows[0].status).toBe("submitted");
    expect(rows[0].matches.map((s) => s.id)).toEqual([subs[0].id]);
    expect(unregistered).toEqual([]);
  });

  it("tells pro-am entries sharing a pro apart, and lists the leftover submission", () => {
    const entries = [
      entry({ division: "SWING - Pro Am Routine - Open Leader AM (ages 6+)", dancer_1: "Idris Bah", dancer_2: "Jennifer Sogluizzo" }),
      entry({ division: "SWING - Pro Am Routine - Open Leader AM (ages 6+)", dancer_1: "Samuel Williams", dancer_2: "Jennifer Sogluizzo" }),
    ];
    const subs = [sub("Idris Bah & Jennifer Sogluizzo", "ProAm LeaderAm"), sub("Someone Else", "Showcase")];
    const { rows, unregistered } = reconcileRegistrations(entries, subs, TEST_DIVISIONS, false);
    expect(rows.map((r) => r.status)).toEqual(["submitted", "possible"]);
    expect(rows[1].candidates.map((s) => s.id)).toEqual([subs[0].id]);
    expect(unregistered.map((s) => s.id)).toEqual([subs[1].id]);
  });

  it("calls a match in another division only possible", () => {
    const entries = [entry({ division: "Sophisticated Swing (age 35+)", dancer_1: "Derek Leyva", dancer_2: "Jennifer Norris" })];
    const subs = [sub("Derek Leyva & Jennifer Norris", "Masters")];
    const { rows, unregistered } = reconcileRegistrations(entries, subs, TEST_DIVISIONS, false);
    expect(rows[0].status).toBe("possible");
    expect(unregistered).toHaveLength(1);
  });

  it("ignores one shared name in another division (a pro with another amateur)", () => {
    const entries = [entry({ division: "Showcase (NASDE)", dancer_1: "Kevin Kane", dancer_2: "Nataliya Kane" })];
    const subs = [sub("Melissa Liao & Kevin Kane", "ProAm FollowerAm")];
    const { rows, unregistered } = reconcileRegistrations(entries, subs, TEST_DIVISIONS, false);
    expect(rows[0].status).toBe("missing");
    expect(rows[0].candidates).toEqual([]);
    expect(unregistered).toHaveLength(1);
  });

  it("flags a Classic entry at The Open with only one round covered", () => {
    const entries = [entry({ division: "Classic (NASDE)", dancer_1: "Zac Skinner", dancer_2: "Maddy Skinner" })];
    const subs = [sub("Zac Skinner & Maddy Skinner", "Classic", "prelims_only")];
    const open = reconcileRegistrations(entries, subs, TEST_DIVISIONS, true).rows[0];
    expect(open.status).toBe("missing-round");
    expect(open.missingRound).toBe("finals");
    expect(reconcileRegistrations(entries, subs, TEST_DIVISIONS, false).rows[0].status).toBe("submitted");
  });

  it("uses a hand link in any division, and a handled mark over everything", () => {
    const entries = [
      entry({ division: "Teams", dancer_1: "Boogie in Motion", dancer_2: "Garrett Humphries", linked_label: "BIM Crew" }),
      entry({ division: "Young Adult (ages 14-17)", dancer_1: "William Benoit", dancer_2: "Abrielle Benoit", handled: true }),
    ];
    const subs = [sub("BIM Crew", "Cabaret")];
    const { rows, unregistered } = reconcileRegistrations(entries, subs, TEST_DIVISIONS, false);
    expect(rows.map((r) => r.status)).toEqual(["submitted", "handled"]);
    expect(unregistered).toEqual([]);
  });

  it("matches a team on its name or its contact, and says missing when nothing fits", () => {
    const entries = [
      entry({ division: "Teams", dancer_1: "Future. WOW.", dancer_2: "Gregory & Lemery Rollinscott" }),
      entry({ division: "Classic (NASDE)", dancer_1: "KP Rutland", dancer_2: "Bryn Anderson" }),
    ];
    const subs = [sub("Future Wow", "Teams")];
    const { rows } = reconcileRegistrations(entries, subs, TEST_DIVISIONS, false);
    expect(rows.map((r) => r.status)).toEqual(["submitted", "missing"]);
  });
});

describe("registrationLines", () => {
  it("writes one line per entry", () => {
    const rows = reconcileRegistrations(
      [entry({ division: "Teams", dancer_1: "Future. WOW." }), entry({ division: "Classic", dancer_1: "A B", dancer_2: "C D" })],
      [],
      TEST_DIVISIONS,
      false
    ).rows;
    expect(registrationLines(rows)).toBe("Teams: Future. WOW.\nClassic: A B & C D");
  });
});

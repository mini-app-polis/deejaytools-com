import { describe, expect, it } from "vitest";
import { partnershipDisplay, songPartnershipLabel } from "./entityLabel";

const emptySong = {
  partner_id: null,
  partner_first_name: null,
  partner_last_name: null,
  partner_kind: null,
  managed_partnership_id: null,
  managed_leader_first_name: null,
  managed_leader_last_name: null,
  managed_follower_first_name: null,
  managed_follower_last_name: null,
};

describe("partnershipDisplay", () => {
  it("joins owner and partner with an ampersand for a real partner", () => {
    expect(
      partnershipDisplay({ ownerName: "Ann Lee", partnerName: "Bo Kim", partnerKind: "partner" })
    ).toBe("Ann Lee & Bo Kim");
  });

  it("treats a missing kind as a real partner", () => {
    expect(partnershipDisplay({ ownerName: "Ann", partnerName: "Bo" })).toBe("Ann & Bo");
  });

  it("renders only the owner when there is no partner name", () => {
    expect(partnershipDisplay({ ownerName: " Ann ", partnerName: "  " })).toBe("Ann");
    expect(partnershipDisplay({ ownerName: "Ann", partnerName: null })).toBe("Ann");
  });

  it("renders a placeholder partner (team/solo/other) by its own name only", () => {
    expect(
      partnershipDisplay({ ownerName: "Ann", partnerName: "Team Rocket", partnerKind: "team" })
    ).toBe("Team Rocket");
  });

  it("falls back to the owner when a placeholder has no name", () => {
    expect(partnershipDisplay({ ownerName: "Ann", partnerName: "", partnerKind: "solo" })).toBe(
      "Ann"
    );
    expect(
      partnershipDisplay({ ownerName: undefined, partnerName: undefined, partnerKind: "other" })
    ).toBe("");
  });
});

describe("songPartnershipLabel", () => {
  it("returns null when the song has no partner and no managed partnership", () => {
    expect(songPartnershipLabel(emptySong, "Ann")).toBeNull();
  });

  it("composes leader & follower for a managed partnership", () => {
    expect(
      songPartnershipLabel({
        ...emptySong,
        managed_partnership_id: "mp1",
        managed_leader_first_name: "Lee",
        managed_leader_last_name: "Der",
        managed_follower_first_name: "Fol",
        managed_follower_last_name: "Lower",
      })
    ).toBe("Lee Der & Fol Lower");
  });

  it("uses whichever managed side is named when the other is blank", () => {
    expect(
      songPartnershipLabel({
        ...emptySong,
        managed_partnership_id: "mp1",
        managed_follower_first_name: "Fol",
      })
    ).toBe("Fol");
    expect(
      songPartnershipLabel({ ...emptySong, managed_partnership_id: "mp1" })
    ).toBeNull();
  });

  it("returns null when a partner id has no name", () => {
    expect(songPartnershipLabel({ ...emptySong, partner_id: "p1" }, "Ann")).toBeNull();
  });

  it("returns a placeholder partner's own name, ignoring the owner", () => {
    expect(
      songPartnershipLabel(
        { ...emptySong, partner_id: "p1", partner_first_name: "Team Rocket", partner_kind: "team" },
        "Ann"
      )
    ).toBe("Team Rocket");
  });

  it("composes owner & partner when the owner name is known", () => {
    expect(
      songPartnershipLabel(
        {
          ...emptySong,
          partner_id: "p1",
          partner_first_name: "Bo",
          partner_last_name: "Kim",
          partner_kind: "partner",
        },
        "Ann Lee"
      )
    ).toBe("Ann Lee & Bo Kim");
  });

  it("returns just the partner name when the owner name is blank or absent", () => {
    const song = { ...emptySong, partner_id: "p1", partner_first_name: "Bo" };
    expect(songPartnershipLabel(song, "  ")).toBe("Bo");
    expect(songPartnershipLabel(song)).toBe("Bo");
  });
});

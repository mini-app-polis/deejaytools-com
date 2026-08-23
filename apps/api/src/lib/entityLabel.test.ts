import { describe, expect, it } from "vitest";
import { partnershipDisplay } from "./entityLabel.js";

describe("partnershipDisplay", () => {
  it("joins owner and partner for normal partners", () => {
    expect(
      partnershipDisplay({
        ownerName: "Alice Smith",
        partnerName: "Bob Jones",
        partnerKind: "partner",
      })
    ).toBe("Alice Smith & Bob Jones");
  });

  it("returns partner name alone for placeholder team partners", () => {
    expect(
      partnershipDisplay({
        ownerName: "Alice Smith",
        partnerName: "Team Alpha",
        partnerKind: "team",
      })
    ).toBe("Team Alpha");
  });

  it("returns partner name alone for solo/other placeholder kinds", () => {
    expect(
      partnershipDisplay({
        ownerName: "Alice Smith",
        partnerName: "Cabaret Act",
        partnerKind: "other",
      })
    ).toBe("Cabaret Act");
  });

  it("falls back to owner when placeholder partner name is empty", () => {
    expect(
      partnershipDisplay({
        ownerName: "Alice Smith",
        partnerName: "",
        partnerKind: "solo",
      })
    ).toBe("Alice Smith");
  });
});

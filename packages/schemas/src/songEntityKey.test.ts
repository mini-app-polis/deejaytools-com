import { describe, expect, it } from "vitest";
import { entitySlotKey, songEntityKey } from "./index.js";

describe("songEntityKey", () => {
  it("prefers managed partnership over partner and user ids", () => {
    expect(
      songEntityKey({
        userId: "u1",
        partnerId: "p1",
        managedPartnershipId: "mp1",
      })
    ).toBe("mp:mp1");
  });

  it("prefers partner id over user id", () => {
    expect(songEntityKey({ userId: "u1", partnerId: "p1" })).toBe("pt:p1");
  });

  it("falls back to user id for solos", () => {
    expect(songEntityKey({ userId: "u1" })).toBe("us:u1");
  });

  it("treats empty-string ids as absent", () => {
    expect(
      songEntityKey({
        userId: "u1",
        partnerId: "",
        managedPartnershipId: "",
      })
    ).toBe("us:u1");
    expect(
      songEntityKey({
        userId: "u1",
        partnerId: "p1",
        managedPartnershipId: "",
      })
    ).toBe("pt:p1");
  });

  it("uses prefixes so user and partner ids cannot collide", () => {
    expect(songEntityKey({ userId: "x" })).not.toBe(
      songEntityKey({ userId: "a", partnerId: "x" })
    );
  });
});

describe("entitySlotKey", () => {
  it("distinguishes divisions for the same entity", () => {
    expect(entitySlotKey("pt:p1", "Classic")).not.toBe(entitySlotKey("pt:p1", "Showcase"));
  });

  it("treats null and undefined division as the same slot", () => {
    expect(entitySlotKey("us:u1", null)).toBe(entitySlotKey("us:u1", undefined));
  });

  it("keeps division-less slots distinct from named divisions", () => {
    expect(entitySlotKey("us:u1", null)).not.toBe(entitySlotKey("us:u1", "Classic"));
  });
});

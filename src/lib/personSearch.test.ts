import { describe, expect, it } from "vitest";
import { formatPersonLabel, personSearchQuery } from "./personSearch";

describe("personSearchQuery", () => {
  it("returns null until there are two characters after trimming", () => {
    expect(personSearchQuery("")).toBeNull();
    expect(personSearchQuery("a")).toBeNull();
    expect(personSearchQuery("  a  ")).toBeNull();
  });

  it("returns the trimmed query once it is long enough", () => {
    expect(personSearchQuery("ad")).toBe("ad");
    expect(personSearchQuery("  Ada L ")).toBe("Ada L");
  });
});

describe("formatPersonLabel", () => {
  it("shows the name and the masked email", () => {
    expect(formatPersonLabel({ display_name: "Ada Lovelace", email_masked: "a•••@example.com" })).toBe(
      "Ada Lovelace · a•••@example.com"
    );
  });

  it("shows just the name when there is no email", () => {
    expect(formatPersonLabel({ display_name: "Ada Lovelace", email_masked: null })).toBe("Ada Lovelace");
  });
});

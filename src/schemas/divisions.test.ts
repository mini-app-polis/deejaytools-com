import { describe, expect, it } from "vitest";
import { ApiDivisionsSchema } from "./index.js";

describe("ApiDivisionsSchema", () => {
  it("accepts the groups and the flat list", () => {
    const result = ApiDivisionsSchema.safeParse({
      groups: [["Classic", "Showcase"], ["Masters"]],
      divisions: ["Classic", "Showcase", "Masters"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a response without the flat list", () => {
    expect(ApiDivisionsSchema.safeParse({ groups: [["Classic"]] }).success).toBe(false);
  });
});

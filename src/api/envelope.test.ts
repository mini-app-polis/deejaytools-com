import { describe, expect, it } from "vitest";
import { SuccessMetaSchema } from "./envelope";

describe("SuccessMetaSchema", () => {
  it("accepts meta without count and total", () => {
    expect(SuccessMetaSchema.parse({ version: "v1" })).toEqual({ version: "v1" });
  });

  it("accepts a list's meta with count only", () => {
    expect(SuccessMetaSchema.parse({ version: "v1", count: 3 })).toEqual({ version: "v1", count: 3 });
  });

  it("accepts the shared envelope's meta with count and total", () => {
    expect(SuccessMetaSchema.parse({ version: "v1", count: 1, total: 1 })).toEqual({
      version: "v1",
      count: 1,
      total: 1,
    });
  });

  it("keeps keys it does not know", () => {
    expect(SuccessMetaSchema.parse({ version: "v1", page: 2 })).toEqual({ version: "v1", page: 2 });
  });

  it("rejects another version or a negative count", () => {
    expect(SuccessMetaSchema.safeParse({ version: "v2" }).success).toBe(false);
    expect(SuccessMetaSchema.safeParse({ version: "v1", count: -1 }).success).toBe(false);
    expect(SuccessMetaSchema.safeParse({ version: "v1", total: 1.5 }).success).toBe(false);
    expect(SuccessMetaSchema.safeParse(undefined).success).toBe(false);
  });
});

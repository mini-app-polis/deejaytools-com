import { describe, expect, it } from "vitest";
import { createEventSongSubmissionBodySchema } from "./index.js";

describe("createEventSongSubmissionBodySchema", () => {
  it("accepts a known division override", () => {
    const result = createEventSongSubmissionBodySchema.safeParse({
      event_id: "evt_1",
      song_id: "song_1",
      division: "Classic",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a division not in DIVISIONS", () => {
    const result = createEventSongSubmissionBodySchema.safeParse({
      event_id: "evt_1",
      song_id: "song_1",
      division: "classic",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an arbitrary division string", () => {
    const result = createEventSongSubmissionBodySchema.safeParse({
      event_id: "evt_1",
      song_id: "song_1",
      division: "Not A Real Division",
    });
    expect(result.success).toBe(false);
  });
});

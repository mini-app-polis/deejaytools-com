import { describe, expect, it } from "vitest";
import { resolveSubmissionFilename } from "./submissionFilename.js";

const song = (over: Partial<{ originalFilename: string | null; processedFilename: string | null }>) => ({
  id: "song_1",
  originalFilename: null,
  processedFilename: null,
  ...over,
});

describe("resolveSubmissionFilename", () => {
  it("prefers the original filename", () => {
    expect(
      resolveSubmissionFilename({
        song: song({ originalFilename: "my track.mp3", processedFilename: "2026_Classic.mp3" }),
        event: { name: "Spring Classic" },
      })
    ).toBe("my track.mp3");
  });

  it("falls back to the processed filename when there is no original", () => {
    expect(
      resolveSubmissionFilename({
        song: song({ processedFilename: "2026_Classic.mp3" }),
        event: { name: "Spring Classic" },
      })
    ).toBe("2026_Classic.mp3");
  });

  it("falls back to the song id when both are missing", () => {
    expect(
      resolveSubmissionFilename({ song: song({}), event: { name: "Spring Classic" } })
    ).toBe("song_1");
  });

  it("ignores whitespace-only filenames", () => {
    expect(
      resolveSubmissionFilename({
        song: song({ originalFilename: "   ", processedFilename: "real.mp3" }),
        event: { name: "Spring Classic" },
      })
    ).toBe("real.mp3");
  });

  // Pin current behavior so the Open branch changing is a deliberate, visible diff.
  it("currently returns the same name for The Open as for any other event", () => {
    const s = song({ originalFilename: "my track.mp3" });
    expect(resolveSubmissionFilename({ song: s, event: { name: "The Open 2026" } })).toBe(
      "my track.mp3"
    );
    expect(resolveSubmissionFilename({ song: s, event: { name: "theopen" } })).toBe(
      "my track.mp3"
    );
  });
});

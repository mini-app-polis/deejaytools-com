import { describe, expect, it } from "vitest";
import { resolveSubmissionFilename } from "./submissionFilename.js";

const song = (over: Partial<{ originalFilename: string | null; processedFilename: string | null }>) => ({
  id: "song_1",
  originalFilename: null,
  processedFilename: null,
  ...over,
});

describe("resolveSubmissionFilename", () => {
  it("prefers the processed filename", () => {
    expect(
      resolveSubmissionFilename({
        song: song({ originalFilename: "my track.mp3", processedFilename: "2026_Classic.mp3" }),
        event: { name: "Spring Classic" },
      })
    ).toBe("2026_Classic.mp3");
  });

  it("falls back to the original filename when there is no processed name", () => {
    expect(
      resolveSubmissionFilename({
        song: song({ originalFilename: "my track.mp3" }),
        event: { name: "Spring Classic" },
      })
    ).toBe("my track.mp3");
  });

  it("falls back to the song id when both are missing", () => {
    expect(
      resolveSubmissionFilename({ song: song({}), event: { name: "Spring Classic" } })
    ).toBe("song_1");
  });

  it("ignores a whitespace-only processed filename", () => {
    expect(
      resolveSubmissionFilename({
        song: song({ originalFilename: "real.mp3", processedFilename: "   " }),
        event: { name: "Spring Classic" },
      })
    ).toBe("real.mp3");
  });

  // Pin current behavior so the Open branch changing is a deliberate, visible diff.
  // Uses a processed name so this asserts on the real path, not the fallback.
  it("currently returns the same name for The Open as for any other event", () => {
    const s = song({
      originalFilename: "my track.mp3",
      processedFilename: "2026_Classic_v01.mp3",
    });
    expect(resolveSubmissionFilename({ song: s, event: { name: "The Open 2026" } })).toBe(
      "2026_Classic_v01.mp3"
    );
    expect(resolveSubmissionFilename({ song: s, event: { name: "theopen" } })).toBe(
      "2026_Classic_v01.mp3"
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildStructuredSongLabel } from "./songLabel.js";

describe("buildStructuredSongLabel", () => {
  it("builds full label with partnership, division, year, routine, and version", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Alice Smith & Bob Jones",
        division: "Classic",
        seasonYear: "2026",
        routineName: "Sky High",
        processedFilename: "alice_bob_classic_2026_v03.mp3",
        displayName: "Sky High",
        songId: "song-1",
      })
    ).toBe("Alice Smith & Bob Jones Classic 2026 Sky High v03");
  });

  it("drops missing year but keeps everything else", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Alice Smith & Bob Jones",
        division: "Classic",
        seasonYear: null,
        routineName: "Sky High",
        processedFilename: "alice_bob_classic_v03.mp3",
        displayName: null,
        songId: "song-1",
      })
    ).toBe("Alice Smith & Bob Jones Classic Sky High v03");
  });

  it("drops missing routine but keeps everything else", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Alice Smith & Bob Jones",
        division: "Classic",
        seasonYear: "2026",
        routineName: null,
        processedFilename: "alice_bob_classic_2026_v03.mp3",
        displayName: null,
        songId: "song-1",
      })
    ).toBe("Alice Smith & Bob Jones Classic 2026 v03");
  });

  it("drops version when processedFilename has no _vNN suffix", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Alice Smith & Bob Jones",
        division: "Classic",
        seasonYear: "2026",
        routineName: null,
        processedFilename: "alice_bob_classic_2026.mp3",
        displayName: null,
        songId: "song-1",
      })
    ).toBe("Alice Smith & Bob Jones Classic 2026");
  });

  it("drops version when processedFilename is null (claimed legacy song)", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Alice Smith & Bob Jones",
        division: "Rising Star Classic",
        seasonYear: null,
        routineName: "The Open 2025",
        processedFilename: null,
        displayName: null,
        songId: "song-1",
      })
    ).toBe("Alice Smith & Bob Jones Rising Star Classic The Open 2025");
  });

  it("supports solo entries (no follower)", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Alice Smith",
        division: "Teams",
        seasonYear: "2026",
        routineName: "Solo Routine",
        processedFilename: "alice_teams_2026_v01.mp3",
        displayName: null,
        songId: "song-1",
      })
    ).toBe("Alice Smith Teams 2026 Solo Routine v01");
  });

  it("falls back to displayName when no structured fields are present (placeholder)", () => {
    // The admin test placeholder song: owned by an admin, has no division /
    // year / routine name, only a literal display_name. Falling back to
    // display_name keeps it identifiable on run-history cards.
    expect(
      buildStructuredSongLabel({
        partnership: "Admin Person",
        division: null,
        seasonYear: null,
        routineName: null,
        processedFilename: null,
        displayName: "[Admin Test Placeholder]",
        songId: "song-1",
      })
    ).toBe("[Admin Test Placeholder]");
  });

  it("falls back to processedFilename when no structured fields and no displayName", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Some Person",
        division: null,
        seasonYear: null,
        routineName: null,
        processedFilename: "some_file.mp3",
        displayName: null,
        songId: "song-1",
      })
    ).toBe("some_file.mp3");
  });

  it("falls back to partnership when no structured fields, no displayName, no filename", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "Some Person",
        division: null,
        seasonYear: null,
        routineName: null,
        processedFilename: null,
        displayName: null,
        songId: "song-1",
      })
    ).toBe("Some Person");
  });

  it("falls back to song id only when literally everything else is missing", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "",
        division: null,
        seasonYear: null,
        routineName: null,
        processedFilename: null,
        displayName: null,
        songId: "song-id-fallback",
      })
    ).toBe("song-id-fallback");
  });

  it("treats whitespace-only fields as empty for the structure check", () => {
    // displayName "   " should not block the fallback path.
    expect(
      buildStructuredSongLabel({
        partnership: "Some Person",
        division: "   ",
        seasonYear: "  ",
        routineName: "   ",
        processedFilename: "   ",
        displayName: "Real Name",
        songId: "song-1",
      })
    ).toBe("Real Name");
  });

  it("trims whitespace around structured pieces", () => {
    expect(
      buildStructuredSongLabel({
        partnership: "  Alice Smith & Bob Jones  ",
        division: " Classic ",
        seasonYear: " 2026 ",
        routineName: " Sky High ",
        processedFilename: "alice_bob_classic_2026_v03.mp3",
        displayName: null,
        songId: "song-1",
      })
    ).toBe("Alice Smith & Bob Jones Classic 2026 Sky High v03");
  });
});

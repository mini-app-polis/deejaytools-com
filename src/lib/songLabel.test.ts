import { describe, expect, it } from "vitest";
import { songLabel, songPieces, songVersion } from "./songLabel";

const SONG = {
  partnership_label: "Ann Lee & Bo Kim",
  division: "Classic",
  routine_name: "Fever",
  processed_filename: "AnnLee_BoKim_Classic_2027_Fever_v03.mp3",
};

describe("songLabel", () => {
  it("names a song by its pieces, without the season year", () => {
    expect(songLabel(SONG)).toBe("Ann Lee & Bo Kim - Classic - Fever - v03");
  });

  it("drops missing pieces", () => {
    expect(
      songLabel({ ...SONG, partnership_label: null, routine_name: "  ", processed_filename: null })
    ).toBe("Classic");
  });

  it("falls back to Untitled song when there are no pieces", () => {
    const bare = { partnership_label: null, division: null, routine_name: null, processed_filename: "x.mp3" };
    expect(songPieces(bare)).toBe("");
    expect(songLabel(bare)).toBe("Untitled song");
  });
});

describe("songVersion", () => {
  it("reads the version at the end of a processed filename", () => {
    expect(songVersion("A_Classic_2027_v12.wav")).toBe("v12");
    expect(songVersion("A_Classic_2027_v12")).toBe("v12");
  });

  it("is null without one", () => {
    expect(songVersion("A_v1_Classic.mp3")).toBeNull();
    expect(songVersion(null)).toBeNull();
  });
});

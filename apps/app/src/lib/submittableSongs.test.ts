import { describe, expect, it } from "vitest";
import type { ApiSong } from "@deejaytools/schemas";
import { partitionSubmittableSongs } from "./submittableSongs";

function song(id: string, isLegacy: boolean): ApiSong {
  return { id, is_legacy: isLegacy } as ApiSong;
}

const none = () => false;

describe("partitionSubmittableSongs", () => {
  it("keeps non-legacy songs and counts nothing hidden", () => {
    const songs = [song("a", false), song("b", false)];
    const { submittable, hiddenLegacyCount } = partitionSubmittableSongs(songs, none);

    expect(submittable.map((s) => s.id)).toEqual(["a", "b"]);
    expect(hiddenLegacyCount).toBe(0);
  });

  it("drops legacy songs and counts them", () => {
    const songs = [song("a", false), song("b", true), song("c", true)];
    const { submittable, hiddenLegacyCount } = partitionSubmittableSongs(songs, none);

    expect(submittable.map((s) => s.id)).toEqual(["a"]);
    expect(hiddenLegacyCount).toBe(2);
  });

  it("keeps a legacy song that is already submitted, and does not count it as hidden", () => {
    const songs = [song("a", true), song("b", true)];
    const { submittable, hiddenLegacyCount } = partitionSubmittableSongs(
      songs,
      (id) => id === "a"
    );

    expect(submittable.map((s) => s.id)).toEqual(["a"]);
    expect(hiddenLegacyCount).toBe(1);
  });

  it("handles an empty library", () => {
    expect(partitionSubmittableSongs([], none)).toEqual({
      submittable: [],
      hiddenLegacyCount: 0,
    });
  });
});

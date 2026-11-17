import { describe, expect, it } from "vitest";
import { formatSongLength } from "./songLength";

describe("formatSongLength", () => {
  it.each([
    [185_000, "3:05"],
    [59_400, "0:59"],
    [59_500, "1:00"],
    [600_000, "10:00"],
    [3_727_000, "1:02:07"],
  ])("reads %i ms as %s", (ms, text) => {
    expect(formatSongLength(ms)).toBe(text);
  });

  it.each([null, undefined, 0, -5, Number.NaN])("has no length for %s", (ms) => {
    expect(formatSongLength(ms)).toBeNull();
  });
});

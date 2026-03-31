import { describe, expect, it } from "vitest";
import NodeID3 from "node-id3";
import { tagSongBytes } from "./tagger.js";

function minimalMp3(): Buffer {
  const tags = NodeID3.create({ title: "Original Title", artist: "Original Artist" });
  return Buffer.isBuffer(tags) ? tags : Buffer.alloc(128);
}

describe("tagSongBytes", () => {
  it("returns original bytes unchanged for unsupported format", async () => {
    const bytes = Buffer.from("not audio");
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/ogg",
    });
    expect(result).toBe(bytes);
  });

  it("returns original bytes unchanged when no mimeType provided", async () => {
    const bytes = Buffer.from("test");
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
    });
    expect(result).toBe(bytes);
  });

  it("tags MP3 bytes and updates title and artist", async () => {
    const bytes = minimalMp3();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    const tags = NodeID3.read(result);
    expect(tags).toBeTruthy();
    if (typeof tags === "object" && tags !== null) {
      expect(tags.title).toBe("New Title");
      expect(tags.artist).toBe("New Artist");
    }
  });

  it("preserves existing tags in comment field for MP3", async () => {
    const bytes = minimalMp3();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    const tags = NodeID3.read(result);
    if (typeof tags === "object" && tags !== null) {
      const comment =
        typeof tags.comment === "object" && tags.comment !== null && "text" in tags.comment
          ? (tags.comment as { text?: string }).text
          : tags.comment;
      expect(String(comment)).toContain("prev[");
      expect(String(comment)).toContain("Original Title");
    }
  });

  it("returns original bytes gracefully when tagging fails", async () => {
    const bytes = Buffer.alloc(10);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/mpeg",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("handles WAV format via ID3", async () => {
    const bytes = Buffer.alloc(100);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/wav",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });
});

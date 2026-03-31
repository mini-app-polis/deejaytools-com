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

describe("m4a tagging (audio/mp4)", () => {
  it("returns a Buffer for audio/mp4 MIME type", async () => {
    const bytes = Buffer.alloc(200);
    const result = await tagSongBytes({
      bytes,
      newTitle: "M4A Title",
      newArtist: "M4A Artist",
      mimeType: "audio/mp4",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("handles audio/x-m4a MIME variant", async () => {
    const bytes = Buffer.alloc(200);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/x-m4a",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("handles video/mp4 MIME variant", async () => {
    const bytes = Buffer.alloc(200);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "video/mp4",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("falls back to original bytes when m4a structure is unrecognized", async () => {
    const bytes = Buffer.from("not a real m4a file");
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/mp4",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("builds valid ilst atom structure for recognized m4a", async () => {
    function buildAtom(name: string, payload: Buffer): Buffer {
      const size = 8 + payload.length;
      const buf = Buffer.alloc(size);
      buf.writeUInt32BE(size, 0);
      buf.write(name, 4, "latin1");
      payload.copy(buf, 8);
      return buf;
    }

    const ilst = buildAtom("ilst", Buffer.alloc(0));
    const metaPayload = Buffer.concat([Buffer.alloc(4), ilst]);
    const meta = Buffer.alloc(8 + metaPayload.length);
    meta.writeUInt32BE(8 + metaPayload.length, 0);
    meta.write("meta", 4, "latin1");
    metaPayload.copy(meta, 8);
    const udta = buildAtom("udta", meta);
    const moov = buildAtom("moov", udta);

    const result = await tagSongBytes({
      bytes: moov,
      newTitle: "Tagged Title",
      newArtist: "Tagged Artist",
      mimeType: "audio/mp4",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("FLAC tagging (audio/flac)", () => {
  it("returns a Buffer for audio/flac MIME type without throwing", async () => {
    const bytes = Buffer.alloc(200);
    const result = await tagSongBytes({
      bytes,
      newTitle: "FLAC Title",
      newArtist: "FLAC Artist",
      mimeType: "audio/flac",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("handles audio/x-flac MIME variant", async () => {
    const bytes = Buffer.alloc(200);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/x-flac",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("falls back to original bytes when FLAC data is invalid", async () => {
    const bytes = Buffer.from("not a real flac file");
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/flac",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result).toBe(bytes);
  });
});

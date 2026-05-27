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

});

function buildMinimalWav(extraChunks: { id: string; payload: Buffer }[] = []): Buffer {
  const fmt = Buffer.from([
    0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00,
    0x01, 0x00, 0x01, 0x00,
    0x40, 0x1f, 0x00, 0x00,
    0x40, 0x1f, 0x00, 0x00,
    0x01, 0x00, 0x08, 0x00,
  ]);
  const data = Buffer.from([0x64, 0x61, 0x74, 0x61, 0x04, 0x00, 0x00, 0x00, 0x80, 0x80, 0x80, 0x80]);
  const extras = extraChunks.map(({ id, payload }) => {
    const header = Buffer.alloc(8);
    header.write(id, 0, "latin1");
    header.writeUInt32LE(payload.length, 4);
    const pad = payload.length & 1 ? Buffer.from([0]) : Buffer.alloc(0);
    return Buffer.concat([header, payload, pad]);
  });
  const body = Buffer.concat([Buffer.from("WAVE", "latin1"), fmt, data, ...extras]);
  const riff = Buffer.alloc(8);
  riff.write("RIFF", 0, "latin1");
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

function walkChunks(buf: Buffer): { id: string; payload: Buffer }[] {
  const out: { id: string; payload: Buffer }[] = [];
  let pos = 12;
  while (pos + 8 <= buf.length) {
    const id = buf.subarray(pos, pos + 4).toString("latin1");
    const size = buf.readUInt32LE(pos + 4);
    if (pos + 8 + size > buf.length) break;
    out.push({ id, payload: buf.subarray(pos + 8, pos + 8 + size) });
    pos += 8 + size + (size & 1);
  }
  return out;
}

describe("WAV tagging (audio/wav)", () => {
  it("preserves the RIFF/WAVE container on a fresh WAV", async () => {
    const bytes = buildMinimalWav();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/wav",
    });
    expect(result.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(result.subarray(8, 12).toString("latin1")).toBe("WAVE");
    expect(result.readUInt32LE(4)).toBe(result.length - 8);
  });

  it("writes a new id3 chunk containing the new title and artist", async () => {
    const bytes = buildMinimalWav();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/wav",
    });
    const chunks = walkChunks(result);
    const ids = chunks.map((c) => c.id);
    expect(ids).toContain("fmt ");
    expect(ids).toContain("data");
    const id3 = chunks.find((c) => c.id === "id3 ");
    expect(id3).toBeDefined();
    const tags = NodeID3.read(id3!.payload);
    expect(typeof tags).toBe("object");
    if (typeof tags === "object" && tags !== null) {
      expect(tags.title).toBe("New Title");
      expect(tags.artist).toBe("New Artist");
    }
  });

  it("replaces an existing id3 chunk and captures prev tags in the comment", async () => {
    const oldId3 = NodeID3.create({ title: "Old Title", artist: "Old Artist" });
    if (!Buffer.isBuffer(oldId3)) throw new Error("expected ID3 buffer");
    const bytes = buildMinimalWav([{ id: "id3 ", payload: oldId3 }]);
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/wav",
    });
    const id3Chunks = walkChunks(result).filter((c) => c.id === "id3 ");
    expect(id3Chunks).toHaveLength(1);
    const tags = NodeID3.read(id3Chunks[0]!.payload);
    if (typeof tags === "object" && tags !== null) {
      expect(tags.title).toBe("New Title");
      expect(tags.artist).toBe("New Artist");
      const comment =
        typeof tags.comment === "object" && tags.comment !== null && "text" in tags.comment
          ? (tags.comment as { text?: string }).text
          : tags.comment;
      expect(String(comment)).toContain("Old Title");
      expect(String(comment)).toContain("Old Artist");
    }
  });

  it("leaves audio data bytes intact", async () => {
    const dataPayload = Buffer.from([0xde, 0xad, 0xbe, 0xef]);
    const data = Buffer.alloc(8 + dataPayload.length);
    data.write("data", 0, "latin1");
    data.writeUInt32LE(dataPayload.length, 4);
    dataPayload.copy(data, 8);
    const fmt = Buffer.from([
      0x66, 0x6d, 0x74, 0x20,
      0x10, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00,
      0x40, 0x1f, 0x00, 0x00,
      0x40, 0x1f, 0x00, 0x00,
      0x01, 0x00, 0x08, 0x00,
    ]);
    const body = Buffer.concat([Buffer.from("WAVE", "latin1"), fmt, data]);
    const riff = Buffer.alloc(8);
    riff.write("RIFF", 0, "latin1");
    riff.writeUInt32LE(body.length, 4);
    const bytes = Buffer.concat([riff, body]);

    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/wav",
    });
    const dataChunk = walkChunks(result).find((c) => c.id === "data");
    expect(dataChunk?.payload).toEqual(dataPayload);
  });

  it("returns original bytes unchanged for non-RIFF input", async () => {
    const bytes = Buffer.alloc(100);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/wav",
    });
    expect(result).toBe(bytes);
  });

  it("handles odd-length id3 payload with correct RIFF padding", async () => {
    const bytes = buildMinimalWav();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/wav",
    });
    let pos = 12;
    while (pos + 8 <= result.length) {
      const size = result.readUInt32LE(pos + 4);
      const next = pos + 8 + size + (size & 1);
      expect(next).toBeLessThanOrEqual(result.length);
      if (next === pos) break;
      pos = next;
    }
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
    expect(result).toBe(bytes);
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

  it("returns the input m4a bytes unchanged", async () => {
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
    expect(result).toBe(moov);
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

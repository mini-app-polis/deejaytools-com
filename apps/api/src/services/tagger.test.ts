import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FlacStream,
  MetadataBlockHeader,
  MetadataBlockType,
  OtherMetadataBlock,
  readFlacTags,
  VorbisCommentBlock,
} from "flac-tagger";
import { parseBuffer } from "music-metadata";
import NodeID3 from "node-id3";
import { parseAtoms, serializeAtoms, tagSongBytes } from "./tagger.js";

const taggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock("common-typescript-utils", async (importOriginal) => {
  const mod = await importOriginal<typeof import("common-typescript-utils")>();
  return {
    ...mod,
    createLogger: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: taggerWarnMock,
      error: vi.fn(),
      start: vi.fn(),
      success: vi.fn(),
      failure: vi.fn(),
    })),
  };
});

function minimalMp3(existing: Record<string, unknown> = {}): Buffer {
  const tags = NodeID3.create({ title: "Original Title", artist: "Original Artist", ...existing });
  return Buffer.isBuffer(tags) ? tags : Buffer.alloc(128);
}

function buildMinimalFlac(commentList: string[] = ["TITLE=Original Title", "ARTIST=Original Artist", "GENRE=Rock"]): Buffer {
  const streamInfoData = Buffer.alloc(34);
  streamInfoData.writeUInt16BE(4096, 0);
  streamInfoData.writeUInt16BE(4096, 2);
  const streamInfo = new OtherMetadataBlock({
    header: new MetadataBlockHeader({ type: MetadataBlockType.StreamInfo, dataLength: 34 }),
    data: streamInfoData,
  });
  const vorbis = new VorbisCommentBlock({ commentList });
  const stream = new FlacStream({
    metadataBlocks: [streamInfo, vorbis],
    frameData: Buffer.from([0xff, 0xf8, 0x82, 0x88, 0x00, 0x00, 0x00, 0x02]),
  });
  return stream.toBuffer();
}

function readMp3Genre(buf: Buffer): string | undefined {
  const tags = NodeID3.read(buf);
  if (typeof tags !== "object" || tags === null) return undefined;
  return tags.genre != null ? String(tags.genre) : undefined;
}

function readMp3Comment(buf: Buffer): string | undefined {
  const tags = NodeID3.read(buf);
  if (typeof tags !== "object" || tags === null) return undefined;
  const comment =
    typeof tags.comment === "object" && tags.comment !== null && "text" in tags.comment
      ? (tags.comment as { text?: string }).text
      : tags.comment;
  if (comment == null) return undefined;
  const text = String(comment);
  return text.length > 0 ? text : undefined;
}

const SOURCE_ONLY_COMMENT = "final mix, ignore the intro before 0:08";

function readMp3Year(buf: Buffer): string | undefined {
  const tags = NodeID3.read(buf);
  if (typeof tags !== "object" || tags === null) return undefined;
  return tags.year != null ? String(tags.year) : undefined;
}

function frameSyncMp3(): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(100, 0xaa)]);
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
      expect(readMp3Genre(result)).toBe("_Routine_");
    }
  });

  it("sets MP3 genre to _Routine_ and overwrites an existing genre", async () => {
    const bytes = minimalMp3({ genre: "Rock" });
    expect(readMp3Genre(bytes)).toBe("Rock");

    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    const tags = NodeID3.read(result);
    if (typeof tags === "object" && tags !== null) {
      expect(tags.title).toBe("New Title");
      expect(tags.artist).toBe("New Artist");
      expect(readMp3Genre(result)).toBe("_Routine_");
    }
  });

  it("writes provenance comment with populated fields only", async () => {
    const bytes = minimalMp3();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    expect(readMp3Comment(result)).toBe("title=Original Title,artist=Original Artist");
    expect(readMp3Comment(result)).not.toContain("prev[");
    expect(readMp3Comment(result)).not.toContain("album=");
  });

  it("writes title-only provenance when only a previous title exists", async () => {
    const tags = NodeID3.create({ title: "Old Title Only" });
    const bytes = Buffer.isBuffer(tags) ? tags : Buffer.alloc(128);
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    expect(readMp3Comment(result)).toBe("title=Old Title Only");
  });

  it("writes no comment frame for an untagged MP3", async () => {
    const bytes = frameSyncMp3();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    const tags = NodeID3.read(result);
    if (typeof tags === "object" && tags !== null) {
      expect(tags.title).toBe("New Title");
      expect(tags.artist).toBe("New Artist");
      expect(readMp3Comment(result)).toBeUndefined();
    }
  });

  it("clears a source-only MP3 comment when provenance is empty", async () => {
    const tags = NodeID3.create({
      comment: { language: "eng", text: SOURCE_ONLY_COMMENT },
    });
    const bytes = Buffer.isBuffer(tags) ? tags : Buffer.alloc(128);
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    expect(readMp3Comment(result)).toBeUndefined();
    expect(String(readMp3Comment(result) ?? "")).not.toContain(SOURCE_ONLY_COMMENT);
  });

  it("replaces a source MP3 comment with provenance rather than appending", async () => {
    const tags = NodeID3.create({
      title: "Old Title",
      comment: { language: "eng", text: "personal note from entrant" },
    });
    const bytes = Buffer.isBuffer(tags) ? tags : Buffer.alloc(128);
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    expect(readMp3Comment(result)).toBe("title=Old Title");
    expect(readMp3Comment(result)).not.toContain("personal note");
  });

  it("writes year when newYear is provided and omits it otherwise", async () => {
    const bytes = minimalMp3();
    const withYear = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      newYear: "2026",
      mimeType: "audio/mpeg",
    });
    expect(readMp3Year(withYear)).toBe("2026");
    expect(readMp3Genre(withYear)).toBe("_Routine_");

    const withoutYear = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    expect(readMp3Year(withoutYear)).toBeUndefined();
    expect(NodeID3.read(withoutYear)).toMatchObject({
      title: "New Title",
      artist: "New Artist",
    });
  });

  it("preserves existing tags in comment field for MP3", async () => {
    const bytes = minimalMp3();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mpeg",
    });
    expect(readMp3Comment(result)).toContain("Original Title");
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
      expect(readMp3Genre(id3!.payload)).toBe("_Routine_");
    }
  });

  it("sets WAV genre to _Routine_ and overwrites an existing genre", async () => {
    const oldId3 = NodeID3.create({
      title: "Old Title",
      artist: "Old Artist",
      genre: "Jazz",
    });
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
      expect(readMp3Genre(id3Chunks[0]!.payload)).toBe("_Routine_");
    }
  });

  it("writes WAV year and lean provenance comment", async () => {
    const oldId3 = NodeID3.create({ title: "Old Title", artist: "Old Artist" });
    if (!Buffer.isBuffer(oldId3)) throw new Error("expected ID3 buffer");
    const bytes = buildMinimalWav([{ id: "id3 ", payload: oldId3 }]);
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      newYear: "2026",
      mimeType: "audio/wav",
    });
    const id3 = walkChunks(result).find((c) => c.id === "id3 ")!;
    expect(readMp3Year(id3.payload)).toBe("2026");
    expect(readMp3Comment(id3.payload)).toBe("title=Old Title,artist=Old Artist");
  });

  it("writes no WAV comment for an untagged file", async () => {
    const bytes = buildMinimalWav();
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/wav",
    });
    const id3 = walkChunks(result).find((c) => c.id === "id3 ")!;
    expect(readMp3Comment(id3.payload)).toBeUndefined();
    expect(readMp3Genre(id3.payload)).toBe("_Routine_");
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
      expect(readMp3Comment(id3Chunks[0]!.payload)).toBe("title=Old Title,artist=Old Artist");
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

const M4A_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "meta", "ilst"]);

function m4aAtomHeaderLen(name: string): number {
  return name === "meta" ? 12 : 8;
}

function buildM4aRawAtom(name: string, payload: Buffer): Buffer {
  const headerLen = m4aAtomHeaderLen(name);
  const total = headerLen + payload.length;
  const buf = Buffer.alloc(total);
  buf.writeUInt32BE(total, 0);
  buf.write(name, 4, "latin1");
  if (name === "meta") buf.writeUInt32BE(0, 8);
  payload.copy(buf, headerLen);
  return buf;
}

function buildM4a64BitAtom(name: string, payload: Buffer): Buffer {
  const total = 16 + payload.length;
  const buf = Buffer.alloc(total);
  buf.writeUInt32BE(1, 0);
  buf.write(name, 4, "latin1");
  buf.writeBigUInt64BE(BigInt(total), 8);
  payload.copy(buf, 16);
  return buf;
}

type M4aAtomBounds = {
  name: string;
  start: number;
  size: number;
  headerLen: number;
  payloadStart: number;
  payloadEnd: number;
};

function readM4aAtomBounds(buf: Buffer, pos: number, containerEnd: number): M4aAtomBounds | null {
  if (pos + 8 > containerEnd) return null;
  const size32 = buf.readUInt32BE(pos);
  const name = buf.toString("latin1", pos + 4, pos + 8);
  let realSize: number;
  let headerLen: number;
  if (size32 === 1) {
    if (pos + 16 > containerEnd) return null;
    realSize = Number(buf.readBigUInt64BE(pos + 8));
    headerLen = 16;
  } else if (size32 < 8) {
    return null;
  } else {
    realSize = size32;
    headerLen = m4aAtomHeaderLen(name);
  }
  if (pos + realSize > containerEnd) return null;
  return {
    name,
    start: pos,
    size: realSize,
    headerLen,
    payloadStart: pos + headerLen,
    payloadEnd: pos + realSize,
  };
}

function buildM4aIlstDataAtom(valueBytes: Buffer, type: number): Buffer {
  const inner = Buffer.alloc(8 + valueBytes.length);
  inner.writeUInt32BE(type, 0);
  inner.writeUInt32BE(0, 4);
  valueBytes.copy(inner, 8);
  const dataAtom = Buffer.alloc(8 + inner.length);
  dataAtom.writeUInt32BE(8 + inner.length, 0);
  dataAtom.write("data", 4, "latin1");
  inner.copy(dataAtom, 8);
  return dataAtom;
}

function buildM4aIlstTextEntry(name: string, text: string): { name: string; data: Buffer } {
  return { name, data: buildM4aIlstDataAtom(Buffer.from(text, "utf-8"), 1) };
}

function patchSampleOffsetTable(
  buf: Buffer,
  containerStart: number,
  containerEnd: number,
  offset: number,
  tableName: "stco" | "co64"
): boolean {
  let pos = containerStart;
  while (pos + 8 <= containerEnd) {
    const atom = readM4aAtomBounds(buf, pos, containerEnd);
    if (!atom) return false;
    if (atom.name === tableName) {
      if (tableName === "stco" && atom.payloadEnd - atom.payloadStart >= 12) {
        buf.writeUInt32BE(offset, atom.payloadStart + 8);
        return true;
      }
      if (tableName === "co64" && atom.payloadEnd - atom.payloadStart >= 16) {
        buf.writeBigUInt64BE(BigInt(offset), atom.payloadStart + 8);
        return true;
      }
    }
    if (M4A_CONTAINERS.has(atom.name)) {
      if (
        patchSampleOffsetTable(buf, atom.payloadStart, atom.payloadEnd, offset, tableName)
      ) {
        return true;
      }
    }
    pos += atom.size;
  }
  return false;
}

function findMoovRange(buf: Buffer): { start: number; end: number; headerLen: number } | null {
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const atom = readM4aAtomBounds(buf, pos, buf.length);
    if (!atom) break;
    if (atom.name === "moov") {
      return { start: atom.start, end: atom.payloadEnd, headerLen: atom.headerLen };
    }
    pos += atom.size;
  }
  return null;
}

function findIlstEntries(buf: Buffer): { name: string; payload: Buffer }[] {
  const moov = findMoovRange(buf);
  if (!moov) return [];
  const entries: { name: string; payload: Buffer }[] = [];

  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos + 8 <= end) {
      const atom = readM4aAtomBounds(buf, pos, end);
      if (!atom) return;
      if (atom.name === "ilst") {
        let ipos = atom.payloadStart;
        while (ipos + 8 <= atom.payloadEnd) {
          const entry = readM4aAtomBounds(buf, ipos, atom.payloadEnd);
          if (!entry) break;
          entries.push({
            name: entry.name,
            payload: buf.subarray(entry.payloadStart, entry.payloadEnd),
          });
          ipos += entry.size;
        }
        return;
      }
      if (M4A_CONTAINERS.has(atom.name)) walk(atom.payloadStart, atom.payloadEnd);
      pos += atom.size;
    }
  };

  walk(moov.start + moov.headerLen, moov.end);
  return entries;
}

function readIlstEntryText(entryPayload: Buffer): string {
  if (entryPayload.length < 16) return "";
  if (entryPayload.subarray(4, 8).toString("latin1") !== "data") return "";
  if (entryPayload.readUInt32BE(8) !== 1) return "";
  return entryPayload.subarray(16).toString("utf-8");
}

function findTopLevelAtom(
  buf: Buffer,
  atomName: string
): { start: number; size: number; headerLen: number } | null {
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const atom = readM4aAtomBounds(buf, pos, buf.length);
    if (!atom) break;
    if (atom.name === atomName) {
      return { start: atom.start, size: atom.size, headerLen: atom.headerLen };
    }
    pos += atom.size;
  }
  return null;
}

function readStcoFirstEntry(buf: Buffer): number | null {
  const moov = findMoovRange(buf);
  if (!moov) return null;
  let found: number | null = null;
  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos + 8 <= end) {
      const atom = readM4aAtomBounds(buf, pos, end);
      if (!atom) return;
      if (atom.name === "stco" && atom.payloadEnd - atom.payloadStart >= 12) {
        found = buf.readUInt32BE(atom.payloadStart + 8);
        return;
      }
      if (M4A_CONTAINERS.has(atom.name)) walk(atom.payloadStart, atom.payloadEnd);
      pos += atom.size;
    }
  };
  walk(moov.start + moov.headerLen, moov.end);
  return found;
}

function readCo64FirstEntry(buf: Buffer): bigint | null {
  const moov = findMoovRange(buf);
  if (!moov) return null;
  let found: bigint | null = null;
  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos + 8 <= end) {
      const atom = readM4aAtomBounds(buf, pos, end);
      if (!atom) return;
      if (atom.name === "co64" && atom.payloadEnd - atom.payloadStart >= 16) {
        found = buf.readBigUInt64BE(atom.payloadStart + 8);
        return;
      }
      if (M4A_CONTAINERS.has(atom.name)) walk(atom.payloadStart, atom.payloadEnd);
      pos += atom.size;
    }
  };
  walk(moov.start + moov.headerLen, moov.end);
  return found;
}

function buildMinimalM4a(
  opts: {
    existingIlstEntries?: { name: string; data: Buffer }[];
    moovAfterMdat?: boolean;
    useCo64?: boolean;
    mdat64Bit?: boolean;
    moov64Bit?: boolean;
  } = {}
): { buf: Buffer; mdatPayloadOffset: number; mdatPayloadLength: number } {
  const mdatPayloadLength = 64;
  const mdatPayload = Buffer.alloc(mdatPayloadLength, 0xab);

  const ftypPayload = Buffer.concat([
    Buffer.from("M4A ", "latin1"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
    Buffer.from("isom", "latin1"),
    Buffer.from([0x00, 0x00, 0x02, 0x00]),
    Buffer.from("mp42", "latin1"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);
  const ftyp = buildM4aRawAtom("ftyp", ftypPayload);

  const mvhd = buildM4aRawAtom("mvhd", Buffer.alloc(100));
  const tkhd = buildM4aRawAtom("tkhd", Buffer.alloc(84));
  const mdhd = buildM4aRawAtom("mdhd", Buffer.alloc(24));
  const hdlr = buildM4aRawAtom(
    "hdlr",
    Buffer.concat([Buffer.alloc(8), Buffer.from("soun", "latin1"), Buffer.alloc(13), Buffer.from([0])])
  );

  const stcoPayload = Buffer.alloc(12);
  stcoPayload.writeUInt32BE(0, 0);
  stcoPayload.writeUInt32BE(1, 4);
  stcoPayload.writeUInt32BE(0, 8);
  const co64Payload = Buffer.alloc(16);
  co64Payload.writeUInt32BE(0, 0);
  co64Payload.writeUInt32BE(1, 4);
  co64Payload.writeBigUInt64BE(0n, 8);
  const sampleTable = opts.useCo64
    ? buildM4aRawAtom("co64", co64Payload)
    : buildM4aRawAtom("stco", stcoPayload);
  const stbl = buildM4aRawAtom("stbl", sampleTable);
  const minf = buildM4aRawAtom("minf", stbl);
  const mdia = buildM4aRawAtom("mdia", Buffer.concat([mdhd, hdlr, minf]));
  const trak = buildM4aRawAtom("trak", Buffer.concat([tkhd, mdia]));

  let moovBody = Buffer.concat([mvhd, trak]);
  if (opts.existingIlstEntries?.length) {
    const ilstChildren = opts.existingIlstEntries.map((e) => buildM4aRawAtom(e.name, e.data));
    const ilst = buildM4aRawAtom("ilst", Buffer.concat(ilstChildren));
    const metaHdlr = buildM4aRawAtom(
      "hdlr",
      Buffer.concat([
        Buffer.alloc(8),
        Buffer.from("mdir", "latin1"),
        Buffer.alloc(12),
        Buffer.from([0]),
      ])
    );
    const meta = buildM4aRawAtom("meta", Buffer.concat([metaHdlr, ilst]));
    moovBody = Buffer.concat([moovBody, buildM4aRawAtom("udta", meta)]);
  }
  const moov = opts.moov64Bit
    ? buildM4a64BitAtom("moov", moovBody)
    : buildM4aRawAtom("moov", moovBody);
  const mdat = opts.mdat64Bit
    ? buildM4a64BitAtom("mdat", mdatPayload)
    : buildM4aRawAtom("mdat", mdatPayload);

  const parts = opts.moovAfterMdat ? [ftyp, mdat, moov] : [ftyp, moov, mdat];
  const buf = Buffer.concat(parts);

  const mdatAtom = findTopLevelAtom(buf, "mdat");
  if (!mdatAtom) throw new Error("fixture missing mdat");
  const mdatPayloadOffset = mdatAtom.start + mdatAtom.headerLen;

  const moovRange = findMoovRange(buf);
  if (!moovRange) throw new Error("fixture missing moov");
  const table = opts.useCo64 ? "co64" : "stco";
  if (!patchSampleOffsetTable(buf, moovRange.start, moovRange.end, mdatPayloadOffset, table)) {
    throw new Error(`fixture missing ${table}`);
  }

  return { buf, mdatPayloadOffset, mdatPayloadLength };
}

describe("m4a tagging (audio/mp4)", () => {
  it("writes ©nam and ©ART into a file with no pre-existing ilst", async () => {
    const { buf } = buildMinimalM4a();
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });

    const entries = findIlstEntries(result);
    const names = entries.map((e) => e.name);
    expect(names).toContain("©nam");
    expect(names).toContain("©ART");
    expect(names).toContain("©gen");
    expect(names).not.toContain("©cmt");
    expect(readIlstEntryText(entries.find((e) => e.name === "©nam")!.payload)).toBe("New Title");
    expect(readIlstEntryText(entries.find((e) => e.name === "©ART")!.payload)).toBe("New Artist");
    expect(readIlstEntryText(entries.find((e) => e.name === "©gen")!.payload)).toBe("_Routine_");
  });

  it("preserves existing non-target ilst entries", async () => {
    const tmpoData = buildM4aIlstDataAtom(Buffer.from([0x00, 0x80]), 21);
    const freeformData = buildM4aIlstDataAtom(Buffer.alloc(50, 0x42), 0);
    const dayData = buildM4aIlstDataAtom(Buffer.from("2024", "utf-8"), 1);
    const existing = [
      { name: "tmpo", data: tmpoData },
      { name: "----", data: freeformData },
      { name: "©day", data: dayData },
    ];
    const { buf } = buildMinimalM4a({ existingIlstEntries: existing });
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });

    const after = findIlstEntries(result);
    const before = findIlstEntries(buf);
    for (const name of ["tmpo", "----", "©day"]) {
      const prev = before.find((e) => e.name === name)!;
      const next = after.find((e) => e.name === name)!;
      expect(next.payload.equals(prev.payload)).toBe(true);
    }
    expect(readIlstEntryText(after.find((e) => e.name === "©nam")!.payload)).toBe("New Title");
    expect(readIlstEntryText(after.find((e) => e.name === "©ART")!.payload)).toBe("New Artist");
    expect(readIlstEntryText(after.find((e) => e.name === "©gen")!.payload)).toBe("_Routine_");
    expect(after.some((e) => e.name === "©cmt")).toBe(false);
  });

  it("captures prev title and artist in the new comment", async () => {
    const { buf } = buildMinimalM4a({
      existingIlstEntries: [
        buildM4aIlstTextEntry("©nam", "Old Song"),
        buildM4aIlstTextEntry("©ART", "Old Band"),
      ],
    });
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "Fresh",
      newArtist: "Fresh Band",
      mimeType: "audio/mp4",
    });
    const cmt = findIlstEntries(result).find((e) => e.name === "©cmt")!;
    expect(readIlstEntryText(cmt.payload)).toBe("title=Old Song,artist=Old Band");
  });

  it("removes a source-only m4a comment when provenance is empty", async () => {
    const { buf } = buildMinimalM4a({
      existingIlstEntries: [buildM4aIlstTextEntry("©cmt", SOURCE_ONLY_COMMENT)],
    });
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });
    expect(findIlstEntries(result).some((e) => e.name === "©cmt")).toBe(false);
  });

  it("replaces a source m4a comment with provenance rather than appending", async () => {
    const { buf } = buildMinimalM4a({
      existingIlstEntries: [
        buildM4aIlstTextEntry("©nam", "Old Song"),
        buildM4aIlstTextEntry("©cmt", "personal note from entrant"),
      ],
    });
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "Fresh",
      newArtist: "Fresh Band",
      mimeType: "audio/mp4",
    });
    const cmt = findIlstEntries(result).find((e) => e.name === "©cmt")!;
    expect(readIlstEntryText(cmt.payload)).toBe("title=Old Song");
    expect(readIlstEntryText(cmt.payload)).not.toContain("personal note");
  });

  it("adjusts stco when moov precedes mdat after removing ©cmt", async () => {
    const { buf, mdatPayloadOffset, mdatPayloadLength } = buildMinimalM4a({
      existingIlstEntries: [buildM4aIlstTextEntry("©cmt", SOURCE_ONLY_COMMENT)],
    });

    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });

    expect(findIlstEntries(result).some((e) => e.name === "©cmt")).toBe(false);
    const resultMdat = findTopLevelAtom(result, "mdat")!;
    const resultPayloadOffset = resultMdat.start + resultMdat.headerLen;
    expect(readStcoFirstEntry(result)).toBe(resultPayloadOffset);
    expect(result.subarray(resultPayloadOffset, resultPayloadOffset + mdatPayloadLength)).toEqual(
      buf.subarray(mdatPayloadOffset, mdatPayloadOffset + mdatPayloadLength)
    );
  });

  it("adjusts stco when moov precedes mdat with minimal ilst (three atoms)", async () => {
    const { buf, mdatPayloadOffset, mdatPayloadLength } = buildMinimalM4a();
    const inputStco = readStcoFirstEntry(buf)!;
    expect(inputStco).toBe(mdatPayloadOffset);

    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });

    const entries = findIlstEntries(result);
    expect(entries.map((e) => e.name).sort()).toEqual(["©ART", "©gen", "©nam"]);
    expect(readIlstEntryText(entries.find((e) => e.name === "©gen")!.payload)).toBe("_Routine_");

    const resultMdat = findTopLevelAtom(result, "mdat")!;
    const resultPayloadOffset = resultMdat.start + resultMdat.headerLen;
    expect(readStcoFirstEntry(result)).toBe(resultPayloadOffset);
    expect(result.subarray(resultPayloadOffset, resultPayloadOffset + mdatPayloadLength)).toEqual(
      buf.subarray(mdatPayloadOffset, mdatPayloadOffset + mdatPayloadLength)
    );
  });

  it("adjusts stco when moov precedes mdat with year and comment (five atoms)", async () => {
    const { buf, mdatPayloadOffset, mdatPayloadLength } = buildMinimalM4a({
      existingIlstEntries: [
        buildM4aIlstTextEntry("©nam", "Old Song"),
        buildM4aIlstTextEntry("©ART", "Old Band"),
      ],
    });

    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      newYear: "2026",
      mimeType: "audio/mp4",
    });

    const entries = findIlstEntries(result);
    expect(entries.map((e) => e.name).sort()).toEqual(["©ART", "©cmt", "©day", "©gen", "©nam"]);
    expect(readIlstEntryText(entries.find((e) => e.name === "©day")!.payload)).toBe("2026");
    expect(readIlstEntryText(entries.find((e) => e.name === "©cmt")!.payload)).toBe(
      "title=Old Song,artist=Old Band"
    );

    const resultMdat = findTopLevelAtom(result, "mdat")!;
    const resultPayloadOffset = resultMdat.start + resultMdat.headerLen;
    expect(readStcoFirstEntry(result)).toBe(resultPayloadOffset);
    expect(result.subarray(resultPayloadOffset, resultPayloadOffset + mdatPayloadLength)).toEqual(
      buf.subarray(mdatPayloadOffset, mdatPayloadOffset + mdatPayloadLength)
    );
  });

  it("overwrites an existing m4a genre with _Routine_", async () => {
    const { buf } = buildMinimalM4a({
      existingIlstEntries: [
        buildM4aIlstTextEntry("©nam", "Old Song"),
        buildM4aIlstTextEntry("©ART", "Old Band"),
        buildM4aIlstTextEntry("©gen", "Pop"),
      ],
    });
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "Fresh",
      newArtist: "Fresh Band",
      mimeType: "audio/mp4",
    });
    const entries = findIlstEntries(result);
    expect(entries.filter((e) => e.name === "©gen")).toHaveLength(1);
    expect(readIlstEntryText(entries.find((e) => e.name === "©gen")!.payload)).toBe("_Routine_");
    expect(readIlstEntryText(entries.find((e) => e.name === "©nam")!.payload)).toBe("Fresh");
    expect(readIlstEntryText(entries.find((e) => e.name === "©ART")!.payload)).toBe("Fresh Band");
  });

  it("does NOT adjust stco when moov follows mdat", async () => {
    const { buf } = buildMinimalM4a({ moovAfterMdat: true });
    const inputStco = readStcoFirstEntry(buf)!;
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });
    expect(readStcoFirstEntry(result)).toBe(inputStco);
    const inputMdat = findTopLevelAtom(buf, "mdat")!;
    const resultMdat = findTopLevelAtom(result, "mdat")!;
    expect(
      result.subarray(
        resultMdat.start + resultMdat.headerLen,
        resultMdat.start + resultMdat.size
      )
    ).toEqual(buf.subarray(inputMdat.start + inputMdat.headerLen, inputMdat.start + inputMdat.size));
  });

  it("returns input unchanged when atoms cannot be parsed", async () => {
    const bytes = Buffer.from("not a real m4a");
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/mp4",
    });
    expect(result).toBe(bytes);
  });

  it("handles co64 by adjusting 64-bit offsets", async () => {
    const { buf, mdatPayloadOffset } = buildMinimalM4a({ useCo64: true });
    expect(readCo64FirstEntry(buf)).toBe(BigInt(mdatPayloadOffset));

    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });

    const resultMdat = findTopLevelAtom(result, "mdat")!;
    expect(readCo64FirstEntry(result)).toBe(BigInt(resultMdat.start + resultMdat.headerLen));
  });

  describe("64-bit atom sizing", () => {
    beforeEach(() => {
      taggerWarnMock.mockClear();
    });

    it("parses and re-serializes an m4a with a 64-bit mdat header", async () => {
      const { buf, mdatPayloadOffset, mdatPayloadLength } = buildMinimalM4a({ mdat64Bit: true });

      const roundTripped = serializeAtoms(parseAtoms(buf, 0, buf.length));
      expect(roundTripped.equals(buf)).toBe(true);

      const result = await tagSongBytes({
        bytes: buf,
        newTitle: "New Title",
        newArtist: "New Artist",
        mimeType: "audio/mp4",
      });

      const entries = findIlstEntries(result);
      expect(readIlstEntryText(entries.find((e) => e.name === "©nam")!.payload)).toBe("New Title");
      expect(readIlstEntryText(entries.find((e) => e.name === "©ART")!.payload)).toBe(
        "New Artist"
      );

      const resultMdat = findTopLevelAtom(result, "mdat")!;
      expect(readStcoFirstEntry(result)).toBe(resultMdat.start + resultMdat.headerLen);
      expect(result.subarray(resultMdat.start + resultMdat.headerLen)).toEqual(
        buf.subarray(mdatPayloadOffset, mdatPayloadOffset + mdatPayloadLength)
      );
    });

    it("parses and re-serializes an m4a with a 64-bit moov header", async () => {
      const { buf, mdatPayloadOffset } = buildMinimalM4a({ moov64Bit: true });

      const roundTripped = serializeAtoms(parseAtoms(buf, 0, buf.length));
      expect(roundTripped.equals(buf)).toBe(true);

      const result = await tagSongBytes({
        bytes: buf,
        newTitle: "New Title",
        newArtist: "New Artist",
        mimeType: "audio/mp4",
      });

      const resultMdat = findTopLevelAtom(result, "mdat")!;
      expect(readStcoFirstEntry(result)).toBe(resultMdat.start + resultMdat.headerLen);
      expect(readStcoFirstEntry(buf)).toBe(mdatPayloadOffset);
    });

    it("throws diagnostic error for size==0 atoms", async () => {
      const { buf: base } = buildMinimalM4a();
      const moovAtom = findTopLevelAtom(base, "moov")!;
      const moovBytes = base.subarray(moovAtom.start, moovAtom.start + moovAtom.size);
      const mdatZero = Buffer.alloc(8);
      mdatZero.writeUInt32BE(0, 0);
      mdatZero.write("mdat", 4, "latin1");
      const ftyp = base.subarray(0, findTopLevelAtom(base, "ftyp")!.size);
      const buf = Buffer.concat([ftyp, moovBytes, mdatZero]);

      const result = await tagSongBytes({
        bytes: buf,
        newTitle: "Title",
        newArtist: "Artist",
        mimeType: "audio/mp4",
      });
      expect(result).toBe(buf);
      expect(taggerWarnMock).toHaveBeenCalled();
      const errMsg = String(
        taggerWarnMock.mock.calls.find((c) => c[0]?.event === "tagger_m4a_parse_failed")?.[0]
          ?.context?.error ?? ""
      );
      expect(errMsg).toContain("size_extends_to_end");
    });

    it("throws diagnostic error for truncated atoms", async () => {
      const skipPayload = Buffer.alloc(12, 0);
      const oversizeSkip = Buffer.alloc(8);
      oversizeSkip.writeUInt32BE(1000, 0);
      oversizeSkip.write("skip", 4, "latin1");
      const { buf: base } = buildMinimalM4a();
      const moovRange = findMoovRange(base)!;
      const moovInnerStart = moovRange.start + moovRange.headerLen;
      const moovInner = base.subarray(moovInnerStart, moovRange.end);
      const patchedMoovBody = Buffer.concat([moovInner, oversizeSkip, skipPayload]);
      const moov = buildM4aRawAtom("moov", patchedMoovBody);
      const ftypEnd = findTopLevelAtom(base, "ftyp")!.start + findTopLevelAtom(base, "ftyp")!.size;
      const mdatAtom = findTopLevelAtom(base, "mdat")!;
      const buf = Buffer.concat([
        base.subarray(0, ftypEnd),
        moov,
        base.subarray(mdatAtom.start),
      ]);

      const result = await tagSongBytes({
        bytes: buf,
        newTitle: "Title",
        newArtist: "Artist",
        mimeType: "audio/mp4",
      });
      expect(result).toBe(buf);
      expect(taggerWarnMock).toHaveBeenCalled();
      const errMsg = String(
        taggerWarnMock.mock.calls.find((c) => c[0]?.event === "tagger_m4a_parse_failed")?.[0]
          ?.context?.error ?? ""
      );
      expect(errMsg).toContain("size_exceeds_buffer");
    });
  });
});

describe("FLAC tagging (audio/flac)", () => {
  it("sets genre to _Routine_ and preserves title and artist", async () => {
    const bytes = buildMinimalFlac();
    const result = await tagSongBytes({
      bytes,
      newTitle: "FLAC Title",
      newArtist: "FLAC Artist",
      newYear: "2026",
      mimeType: "audio/flac",
    });
    const tags = await readFlacTags(result);
    expect(tags.tagMap.TITLE).toBe("FLAC Title");
    expect(tags.tagMap.ARTIST).toBe("FLAC Artist");
    expect(tags.tagMap.GENRE).toBe("_Routine_");
    expect(tags.tagMap.DATE).toBe("2026");

    const parsed = await parseBuffer(result, { mimeType: "audio/flac" });
    expect(parsed.common.title).toBe("FLAC Title");
    expect(parsed.common.artist).toBe("FLAC Artist");
    expect(parsed.common.genre).toEqual(["_Routine_"]);
    expect(parsed.common.year).toBe(2026);
  });

  it("writes lean provenance comment and omits year when newYear is absent", async () => {
    const bytes = buildMinimalFlac(["TITLE=Old Title", "ARTIST=Old Artist"]);
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/flac",
    });
    const tags = await readFlacTags(result);
    expect(tags.tagMap.COMMENT).toBe("title=Old Title,artist=Old Artist");
    expect(tags.tagMap.DATE).toBeUndefined();
  });

  it("removes stale COMMENT when the source had no previous title or artist", async () => {
    const bytes = buildMinimalFlac(["COMMENT=legacy noise", "GENRE=Rock"]);
    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/flac",
    });
    const tags = await readFlacTags(result);
    expect(tags.tagMap.COMMENT).toBeUndefined();
    expect(tags.tagMap.GENRE).toBe("_Routine_");
  });

  it("overwrites an existing FLAC genre with _Routine_", async () => {
    const bytes = buildMinimalFlac([
      "TITLE=Old Title",
      "ARTIST=Old Artist",
      "GENRE=Electronic",
    ]);
    const before = await readFlacTags(bytes);
    expect(before.tagMap.GENRE).toBe("Electronic");

    const result = await tagSongBytes({
      bytes,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/flac",
    });
    const tags = await readFlacTags(result);
    expect(tags.tagMap.TITLE).toBe("New Title");
    expect(tags.tagMap.ARTIST).toBe("New Artist");
    expect(tags.tagMap.GENRE).toBe("_Routine_");
    expect(
      Object.values(tags.tagMap).filter((value) =>
        Array.isArray(value) ? value.includes("Electronic") : value === "Electronic"
      )
    ).toHaveLength(0);
  });

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

describe("cross-format comment clearing", () => {
  const tagInput = {
    newTitle: "New Title",
    newArtist: "New Artist",
  };

  it("clears a source-only comment consistently across mp3, wav, flac, and m4a", async () => {
    const mp3Tags = NodeID3.create({
      comment: { language: "eng", text: SOURCE_ONLY_COMMENT },
    });
    const mp3Bytes = Buffer.isBuffer(mp3Tags) ? mp3Tags : Buffer.alloc(128);
    const mp3Result = await tagSongBytes({ ...tagInput, bytes: mp3Bytes, mimeType: "audio/mpeg" });
    expect(readMp3Comment(mp3Result)).toBeUndefined();

    const wavId3 = NodeID3.create({
      comment: { language: "eng", text: SOURCE_ONLY_COMMENT },
    });
    if (!Buffer.isBuffer(wavId3)) throw new Error("expected ID3 buffer");
    const wavResult = await tagSongBytes({
      ...tagInput,
      bytes: buildMinimalWav([{ id: "id3 ", payload: wavId3 }]),
      mimeType: "audio/wav",
    });
    const wavId3Chunk = walkChunks(wavResult).find((c) => c.id === "id3 ")!;
    expect(readMp3Comment(wavId3Chunk.payload)).toBeUndefined();

    const flacResult = await tagSongBytes({
      ...tagInput,
      bytes: buildMinimalFlac([`COMMENT=${SOURCE_ONLY_COMMENT}`]),
      mimeType: "audio/flac",
    });
    const flacTags = await readFlacTags(flacResult);
    expect(flacTags.tagMap.COMMENT).toBeUndefined();

    const { buf: m4aBytes } = buildMinimalM4a({
      existingIlstEntries: [buildM4aIlstTextEntry("©cmt", SOURCE_ONLY_COMMENT)],
    });
    const m4aResult = await tagSongBytes({
      ...tagInput,
      bytes: m4aBytes,
      mimeType: "audio/mp4",
    });
    expect(findIlstEntries(m4aResult).some((e) => e.name === "©cmt")).toBe(false);
  });
});

describe("sniffFormat-driven routing", () => {
  it("routes a RIFF/WAVE file through the WAV tagger even when MIME says audio/mpeg", async () => {
    const bytes = buildMinimalWav();
    const result = await tagSongBytes({
      bytes,
      newTitle: "Tagged Title",
      newArtist: "Tagged Artist",
      mimeType: "audio/mpeg",
    });
    expect(result.subarray(0, 4).toString("latin1")).toBe("RIFF");
    expect(result.subarray(8, 12).toString("latin1")).toBe("WAVE");
  });

  it("routes an ID3-prefixed MP3 through the MP3 tagger even when MIME says audio/wave", async () => {
    const id3 = NodeID3.create({ title: "Original", artist: "Original" });
    const bytes = Buffer.isBuffer(id3) ? id3 : Buffer.alloc(128);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Tagged Title",
      newArtist: "Tagged Artist",
      mimeType: "audio/wave",
    });
    expect(result.subarray(0, 3).toString("latin1")).toBe("ID3");
    const tags = NodeID3.read(result);
    if (typeof tags === "object" && tags !== null) {
      expect(tags.title).toBe("Tagged Title");
    }
  });

  it("routes a frame-sync MP3 (no ID3 header) through the MP3 tagger", async () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfb]), Buffer.alloc(100, 0xaa)]);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Tagged Title",
      newArtist: "Tagged Artist",
      mimeType: "audio/mpeg",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });

  it("routes ftyp-headed bytes through the m4a tagger even when MIME says audio/flac", async () => {
    const { buf } = buildMinimalM4a();
    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "Tagged Title",
      newArtist: "Tagged Artist",
      mimeType: "audio/flac",
    });
    expect(result.subarray(4, 8).toString("latin1")).toBe("ftyp");
  });

  it("returns input unchanged when bytes match no signature and MIME is unsupported", async () => {
    const bytes = Buffer.from("totally random bytes here, not any known format header");
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/ogg",
    });
    expect(result).toBe(bytes);
  });

  it("returns input unchanged when bytes match no signature and MIME is missing", async () => {
    const bytes = Buffer.from("totally random bytes here, not any known format header");
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
    });
    expect(result).toBe(bytes);
  });

  it("uses declared MIME when sniff is unsupported but MIME is known", async () => {
    const bytes = Buffer.alloc(20, 0xaa);
    const result = await tagSongBytes({
      bytes,
      newTitle: "Title",
      newArtist: "Artist",
      mimeType: "audio/mpeg",
    });
    expect(Buffer.isBuffer(result)).toBe(true);
  });
});

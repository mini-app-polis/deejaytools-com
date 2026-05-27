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
    const size = buf.readUInt32BE(pos);
    if (size < 8 || pos + size > containerEnd) return false;
    const name = buf.toString("latin1", pos + 4, pos + 8);
    const headerLen = m4aAtomHeaderLen(name);
    const payloadStart = pos + headerLen;
    const payloadEnd = pos + size;
    if (name === tableName) {
      if (tableName === "stco" && payloadEnd - payloadStart >= 12) {
        buf.writeUInt32BE(offset, payloadStart + 8);
        return true;
      }
      if (tableName === "co64" && payloadEnd - payloadStart >= 16) {
        buf.writeBigUInt64BE(BigInt(offset), payloadStart + 8);
        return true;
      }
    }
    if (M4A_CONTAINERS.has(name)) {
      if (patchSampleOffsetTable(buf, payloadStart, payloadEnd, offset, tableName)) return true;
    }
    pos += size;
  }
  return false;
}

function findMoovRange(buf: Buffer): { start: number; end: number } | null {
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const size = buf.readUInt32BE(pos);
    if (size < 8 || pos + size > buf.length) break;
    const name = buf.toString("latin1", pos + 4, pos + 8);
    if (name === "moov") return { start: pos, end: pos + size };
    pos += size;
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
      const size = buf.readUInt32BE(pos);
      if (size < 8 || pos + size > end) return;
      const name = buf.toString("latin1", pos + 4, pos + 8);
      const headerLen = m4aAtomHeaderLen(name);
      const payloadStart = pos + headerLen;
      const payloadEnd = pos + size;
      if (name === "ilst") {
        let ipos = payloadStart;
        while (ipos + 8 <= payloadEnd) {
          const isize = buf.readUInt32BE(ipos);
          if (isize < 8 || ipos + isize > payloadEnd) break;
          const iname = buf.toString("latin1", ipos + 4, ipos + 8);
          entries.push({
            name: iname,
            payload: buf.subarray(ipos + 8, ipos + isize),
          });
          ipos += isize;
        }
        return;
      }
      if (M4A_CONTAINERS.has(name)) walk(payloadStart, payloadEnd);
      pos += size;
    }
  };

  walk(moov.start + m4aAtomHeaderLen("moov"), moov.end);
  return entries;
}

function readIlstEntryText(entryPayload: Buffer): string {
  if (entryPayload.length < 16) return "";
  if (entryPayload.subarray(4, 8).toString("latin1") !== "data") return "";
  if (entryPayload.readUInt32BE(8) !== 1) return "";
  return entryPayload.subarray(16).toString("utf-8");
}

function findTopLevelAtom(buf: Buffer, atomName: string): { start: number; size: number } | null {
  let pos = 0;
  while (pos + 8 <= buf.length) {
    const size = buf.readUInt32BE(pos);
    if (size < 8 || pos + size > buf.length) break;
    const name = buf.toString("latin1", pos + 4, pos + 8);
    if (name === atomName) return { start: pos, size };
    pos += size;
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
      const size = buf.readUInt32BE(pos);
      if (size < 8 || pos + size > end) return;
      const name = buf.toString("latin1", pos + 4, pos + 8);
      const headerLen = m4aAtomHeaderLen(name);
      const payloadStart = pos + headerLen;
      const payloadEnd = pos + size;
      if (name === "stco" && payloadEnd - payloadStart >= 12) {
        found = buf.readUInt32BE(payloadStart + 8);
        return;
      }
      if (M4A_CONTAINERS.has(name)) walk(payloadStart, payloadEnd);
      pos += size;
    }
  };
  walk(moov.start + 8, moov.end);
  return found;
}

function readCo64FirstEntry(buf: Buffer): bigint | null {
  const moov = findMoovRange(buf);
  if (!moov) return null;
  let found: bigint | null = null;
  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos + 8 <= end) {
      const size = buf.readUInt32BE(pos);
      if (size < 8 || pos + size > end) return;
      const name = buf.toString("latin1", pos + 4, pos + 8);
      const headerLen = m4aAtomHeaderLen(name);
      const payloadStart = pos + headerLen;
      const payloadEnd = pos + size;
      if (name === "co64" && payloadEnd - payloadStart >= 16) {
        found = buf.readBigUInt64BE(payloadStart + 8);
        return;
      }
      if (M4A_CONTAINERS.has(name)) walk(payloadStart, payloadEnd);
      pos += size;
    }
  };
  walk(moov.start + 8, moov.end);
  return found;
}

function buildMinimalM4a(
  opts: {
    existingIlstEntries?: { name: string; data: Buffer }[];
    moovAfterMdat?: boolean;
    useCo64?: boolean;
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
  const moov = buildM4aRawAtom("moov", moovBody);
  const mdat = buildM4aRawAtom("mdat", mdatPayload);

  const parts = opts.moovAfterMdat ? [ftyp, mdat, moov] : [ftyp, moov, mdat];
  const buf = Buffer.concat(parts);

  const mdatAtom = findTopLevelAtom(buf, "mdat");
  if (!mdatAtom) throw new Error("fixture missing mdat");
  const mdatPayloadOffset = mdatAtom.start + 8;

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
    expect(names).toContain("©cmt");
    expect(readIlstEntryText(entries.find((e) => e.name === "©nam")!.payload)).toBe("New Title");
    expect(readIlstEntryText(entries.find((e) => e.name === "©ART")!.payload)).toBe("New Artist");
    expect(readIlstEntryText(entries.find((e) => e.name === "©cmt")!.payload)).toMatch(
      /prev\[title=,artist=,album=\]/
    );
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
    expect(after.some((e) => e.name === "©cmt")).toBe(true);
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
    const text = readIlstEntryText(cmt.payload);
    expect(text).toContain("Old Song");
    expect(text).toContain("Old Band");
  });

  it("adjusts stco entries by exactly the moov-size delta when moov precedes mdat", async () => {
    const { buf, mdatPayloadOffset, mdatPayloadLength } = buildMinimalM4a();
    const inputStco = readStcoFirstEntry(buf)!;
    expect(inputStco).toBe(mdatPayloadOffset);

    const result = await tagSongBytes({
      bytes: buf,
      newTitle: "New Title",
      newArtist: "New Artist",
      mimeType: "audio/mp4",
    });

    const resultMdat = findTopLevelAtom(result, "mdat")!;
    const resultPayloadOffset = resultMdat.start + 8;
    const resultStco = readStcoFirstEntry(result)!;
    expect(resultStco).toBe(resultPayloadOffset);
    expect(result.subarray(resultPayloadOffset, resultPayloadOffset + mdatPayloadLength)).toEqual(
      buf.subarray(mdatPayloadOffset, mdatPayloadOffset + mdatPayloadLength)
    );
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
    expect(result.subarray(resultMdat.start + 8, resultMdat.start + 8 + inputMdat.size - 8)).toEqual(
      buf.subarray(inputMdat.start + 8, inputMdat.start + inputMdat.size)
    );
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
    expect(readCo64FirstEntry(result)).toBe(BigInt(resultMdat.start + 8));
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

import {
  FlacStream,
  MetadataBlockType,
  readFlacTags,
  VorbisCommentBlock,
} from "flac-tagger";
import { createLogger, type LogCategory } from "common-typescript-utils";
import { parseBuffer } from "music-metadata";
import NodeID3 from "node-id3";

const TAGGER_CATEGORY = "tagger" as LogCategory;
const logger = createLogger("tagger");

export interface TagSongInput {
  bytes: Buffer;
  newTitle: string;
  newArtist: string;
  mimeType?: string;
}

type AudioFormat = "mp3" | "wav" | "m4a" | "flac" | "unsupported";

/**
 * Detect the audio format by inspecting the leading bytes of the buffer.
 * Returns "unsupported" if no recognized signature is found.
 *
 * This is deliberately byte-based and ignores any MIME type — clients
 * (especially browsers on mobile) frequently mislabel audio files, and
 * we've seen real uploads where the declared MIME type contradicts the
 * actual container. Trusting the bytes is the only reliable signal.
 */
function sniffFormat(bytes: Buffer): AudioFormat {
  if (bytes.length < 12) return "unsupported";

  if (
    bytes.subarray(0, 4).toString("latin1") === "RIFF" &&
    bytes.subarray(8, 12).toString("latin1") === "WAVE"
  ) {
    return "wav";
  }

  if (bytes.subarray(0, 4).toString("latin1") === "fLaC") {
    return "flac";
  }

  if (bytes.subarray(4, 8).toString("latin1") === "ftyp") {
    return "m4a";
  }

  if (bytes.subarray(0, 3).toString("latin1") === "ID3") {
    return "mp3";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "mp3";
  }

  return "unsupported";
}

function getFormat(mimeType: string | undefined): AudioFormat {
  if (!mimeType) return "unsupported";
  if (mimeType === "audio/mpeg" || mimeType === "audio/mp3" || mimeType === "audio/x-mp3")
    return "mp3";
  if (mimeType === "audio/wav" || mimeType === "audio/x-wav" || mimeType === "audio/wave")
    return "wav";
  if (mimeType === "audio/mp4" || mimeType === "audio/x-m4a" || mimeType === "video/mp4")
    return "m4a";
  if (mimeType === "audio/flac" || mimeType === "audio/x-flac") return "flac";
  return "unsupported";
}

type RiffChunk = { id: string; payload: Buffer };

function readRiffChunks(bytes: Buffer): RiffChunk[] {
  const chunks: RiffChunk[] = [];
  let pos = 12;
  while (pos + 8 <= bytes.length) {
    const id = bytes.subarray(pos, pos + 4).toString("latin1");
    const size = bytes.readUInt32LE(pos + 4);
    if (pos + 8 + size > bytes.length) break;
    chunks.push({ id, payload: bytes.subarray(pos + 8, pos + 8 + size) });
    pos += 8 + size + (size & 1);
  }
  return chunks;
}

function writeRiffChunk(parts: Buffer[], chunk: RiffChunk): void {
  const header = Buffer.alloc(8);
  header.write(chunk.id, 0, "latin1");
  header.writeUInt32LE(chunk.payload.length, 4);
  parts.push(header, chunk.payload);
  if (chunk.payload.length & 1) {
    parts.push(Buffer.from([0]));
  }
}

/** Embed ID3v2 metadata in a WAV `id3 ` RIFF sub-chunk (does not prepend ID3 to byte 0). */
async function tagWav(
  bytes: Buffer,
  newTitle: string,
  newArtist: string
): Promise<Buffer> {
  try {
    if (bytes.length < 12) return bytes;
    if (bytes.subarray(0, 4).toString("latin1") !== "RIFF") return bytes;
    if (bytes.subarray(8, 12).toString("latin1") !== "WAVE") return bytes;

    const chunks = readRiffChunks(bytes);
    let prevTitle = "";
    let prevArtist = "";
    let prevAlbum = "";
    let hadId3 = false;

    for (const chunk of chunks) {
      if (chunk.id === "id3 ") {
        hadId3 = true;
        const existing = NodeID3.read(chunk.payload);
        if (typeof existing === "object" && existing !== null) {
          prevTitle = existing.title ?? "";
          prevArtist = existing.artist ?? "";
          prevAlbum = existing.album ?? "";
        }
      }
    }

    const previousSummary = `prev[title=${prevTitle},artist=${prevArtist},album=${prevAlbum}]`;
    const id3TagBytes = NodeID3.create({
      title: newTitle,
      artist: newArtist,
      comment: { language: "eng", text: previousSummary },
    });
    if (!Buffer.isBuffer(id3TagBytes)) return bytes;

    const newId3Chunk: RiffChunk = { id: "id3 ", payload: id3TagBytes };
    const outputChunks: RiffChunk[] = [];
    for (const chunk of chunks) {
      if (chunk.id === "id3 ") {
        outputChunks.push(newId3Chunk);
      } else {
        outputChunks.push(chunk);
      }
    }
    if (!hadId3) {
      outputChunks.push(newId3Chunk);
    }

    const parts: Buffer[] = [Buffer.from("RIFF", "latin1"), Buffer.alloc(4), Buffer.from("WAVE", "latin1")];
    for (const chunk of outputChunks) {
      writeRiffChunk(parts, chunk);
    }
    const result = Buffer.concat(parts);
    result.writeUInt32LE(result.length - 8, 4);
    return result;
  } catch {
    return bytes;
  }
}

/** Tag MP3 using node-id3 */
async function tagWithId3(
  bytes: Buffer,
  newTitle: string,
  newArtist: string
): Promise<Buffer> {
  try {
    const existing = NodeID3.read(bytes);
    const prevTitle = typeof existing === "object" ? (existing.title ?? "") : "";
    const prevArtist = typeof existing === "object" ? (existing.artist ?? "") : "";
    const prevAlbum = typeof existing === "object" ? (existing.album ?? "") : "";
    const previousSummary = `prev[title=${prevTitle},artist=${prevArtist},album=${prevAlbum}]`;

    const updated = NodeID3.update(
      {
        title: newTitle,
        artist: newArtist,
        comment: { language: "eng", text: previousSummary },
      },
      Buffer.from(bytes)
    );
    if (Buffer.isBuffer(updated)) {
      logger.info({
        event: "tagger_success",
        category: TAGGER_CATEGORY,
        context: {
          format: "mp3_or_wav",
          byteLength: bytes.length,
          outputLength: updated.length,
        },
      });
      return updated;
    }
    logger.warn({
      event: "tagger_id3_returned_non_buffer",
      category: TAGGER_CATEGORY,
      context: { byteLength: bytes.length, updatedType: typeof updated },
    });
    return bytes;
  } catch (err) {
    logger.warn({
      event: "tagger_id3_failed",
      category: TAGGER_CATEGORY,
      context: { byteLength: bytes.length, error: String(err) },
    });
    return bytes;
  }
}

/** Tag FLAC using flac-tagger Vorbis comments */
async function tagFlac(
  bytes: Buffer,
  newTitle: string,
  newArtist: string
): Promise<Buffer> {
  try {
    const existing = await parseBuffer(bytes, { mimeType: "audio/flac" });
    const prevTitle = existing.common.title ?? "";
    const prevArtist = existing.common.artist ?? "";
    const previousSummary = `prev[title=${prevTitle},artist=${prevArtist}]`;

    const tags = await readFlacTags(bytes);
    const tagMap: Record<string, string | string[]> = { ...tags.tagMap };
    tagMap.TITLE = newTitle;
    tagMap.ARTIST = newArtist;
    tagMap.COMMENT = previousSummary;

    const stream = FlacStream.fromBuffer(bytes);
    const commentList: string[] = [];
    Object.entries(tagMap).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((singleValue) =>
          commentList.push(`${key.toUpperCase()}=${singleValue}`)
        );
      } else {
        commentList.push(`${key.toUpperCase()}=${value}`);
      }
    });
    if (stream.vorbisCommentBlock) {
      stream.vorbisCommentBlock.commentList = commentList;
    } else {
      stream.metadataBlocks.push(new VorbisCommentBlock({ commentList }));
    }
    stream.metadataBlocks = stream.metadataBlocks.filter(
      (b) => b.type !== MetadataBlockType.Padding
    );
    const result = stream.toBuffer();
    logger.info({
      event: "tagger_success",
      category: TAGGER_CATEGORY,
      context: { format: "flac", byteLength: bytes.length, outputLength: result.length },
    });
    return result;
  } catch (err) {
    logger.warn({
      event: "tagger_flac_failed",
      category: TAGGER_CATEGORY,
      context: { byteLength: bytes.length, error: String(err) },
    });
    return bytes;
  }
}

type ParsedAtom = {
  name: string;
  headerLen: number;
  payload: Buffer;
  children?: ParsedAtom[];
};

const M4A_CONTAINER_ATOMS = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "udta",
  "meta",
  "ilst",
]);

/**
 * Atom header convention: headerLen is 8 for every atom except `meta`, where it
 * is 12 because the 4 version+flags bytes count as header (never as payload).
 * The serializer always writes those 4 zero bytes after the name for `meta`.
 */
function atomHeaderLen(name: string): number {
  return name === "meta" ? 12 : 8;
}

function parseAtoms(buf: Buffer, offset: number, end: number): ParsedAtom[] {
  const atoms: ParsedAtom[] = [];
  let pos = offset;
  while (pos + 8 <= end) {
    const size32 = buf.readUInt32BE(pos);
    const name =
      pos + 8 <= end ? buf.toString("latin1", pos + 4, pos + 8) : "<unknown>";

    let realSize: number;
    let headerLen: number;

    if (size32 === 0) {
      throw new Error(
        `tagger_m4a_parse: size_extends_to_end (name=${name} offset=${pos})`
      );
    }

    if (size32 === 1) {
      if (name === "meta") {
        throw new Error(
          `tagger_m4a_parse: 64-bit-with-meta unsupported (name=${name} offset=${pos})`
        );
      }
      if (pos + 16 > end) {
        throw new Error(
          `tagger_m4a_parse: size_exceeds_buffer (name=${name} size=<truncated-ext> offset=${pos} end=${end})`
        );
      }
      realSize = Number(buf.readBigUInt64BE(pos + 8));
      headerLen = 16;
    } else if (size32 >= 2 && size32 < 8) {
      throw new Error(
        `tagger_m4a_parse: size_below_header (name=${name} size=${size32} offset=${pos})`
      );
    } else {
      realSize = size32;
      headerLen = atomHeaderLen(name);
    }

    if (realSize < headerLen) {
      throw new Error(
        `tagger_m4a_parse: size_below_header (name=${name} size=${realSize} offset=${pos})`
      );
    }

    if (pos + realSize > end) {
      throw new Error(
        `tagger_m4a_parse: size_exceeds_buffer (name=${name} size=${realSize} offset=${pos} end=${end})`
      );
    }

    const payloadStart = pos + headerLen;
    const payloadEnd = pos + realSize;
    const payload = buf.subarray(payloadStart, payloadEnd);

    const atom: ParsedAtom = { name, headerLen, payload };
    if (M4A_CONTAINER_ATOMS.has(name)) {
      atom.children = parseAtoms(buf, payloadStart, payloadEnd);
    }
    atoms.push(atom);
    pos += realSize;
  }
  return atoms;
}

function serializeAtoms(atoms: ParsedAtom[]): Buffer {
  return Buffer.concat(atoms.map(serializeAtom));
}

function serializeAtom(atom: ParsedAtom): Buffer {
  const payload = atom.children ? serializeAtoms(atom.children) : atom.payload;
  const totalSize = atom.headerLen + payload.length;

  if (atom.headerLen === 16) {
    if (atom.name === "meta") {
      throw new Error(
        `tagger_m4a_serialize: 64-bit-with-meta unsupported (name=${atom.name})`
      );
    }
    if (totalSize > 0xffffffff) {
      throw new Error(
        `tagger_m4a_serialize: total_size_exceeds_32bit (name=${atom.name} size=${totalSize})`
      );
    }
    const out = Buffer.alloc(totalSize);
    out.writeUInt32BE(1, 0);
    out.write(atom.name, 4, "latin1");
    out.writeBigUInt64BE(BigInt(totalSize), 8);
    payload.copy(out, 16);
    return out;
  }

  if (totalSize > 0xffffffff) {
    throw new Error(
      `tagger_m4a_serialize: total_size_exceeds_32bit (name=${atom.name} size=${totalSize})`
    );
  }

  const out = Buffer.alloc(totalSize);
  out.writeUInt32BE(totalSize, 0);
  out.write(atom.name, 4, "latin1");
  if (atom.name === "meta") {
    out.writeUInt32BE(0, 8);
  }
  payload.copy(out, atom.headerLen);
  return out;
}

function findChild(atom: ParsedAtom, name: string): ParsedAtom | undefined {
  return atom.children?.find((c) => c.name === name);
}

function buildLeaf(name: string, payload: Buffer): ParsedAtom {
  return { name, headerLen: atomHeaderLen(name), payload };
}

function buildContainer(name: string, children: ParsedAtom[]): ParsedAtom {
  return {
    name,
    headerLen: atomHeaderLen(name),
    payload: Buffer.alloc(0),
    children,
  };
}

function buildTextDataAtom(value: string): Buffer {
  const valueBytes = Buffer.from(value, "utf-8");
  const inner = Buffer.alloc(8 + valueBytes.length);
  inner.writeUInt32BE(1, 0);
  inner.writeUInt32BE(0, 4);
  valueBytes.copy(inner, 8);
  const dataAtom = Buffer.alloc(8 + inner.length);
  dataAtom.writeUInt32BE(8 + inner.length, 0);
  dataAtom.write("data", 4, "latin1");
  inner.copy(dataAtom, 8);
  return dataAtom;
}

function buildIlstEntry(name: string, text: string): ParsedAtom {
  return buildLeaf(name, buildTextDataAtom(text));
}

function updateStcoPayload(payload: Buffer, entryBytes: 4 | 8, delta: number): Buffer {
  if (payload.length < 8) return payload;
  const count = payload.readUInt32BE(4);
  const needed = 8 + count * entryBytes;
  if (payload.length < needed) return payload;

  const out = Buffer.alloc(needed);
  payload.subarray(0, 8).copy(out, 0);
  let readPos = 8;
  let writePos = 8;
  for (let i = 0; i < count; i++) {
    if (entryBytes === 4) {
      const next = payload.readUInt32BE(readPos) + delta;
      if (next < 0) throw new Error("stco offset underflow");
      out.writeUInt32BE(next, writePos);
      readPos += 4;
      writePos += 4;
    } else {
      const next = payload.readBigUInt64BE(readPos) + BigInt(delta);
      if (next < 0n) throw new Error("co64 offset underflow");
      out.writeBigUInt64BE(next, writePos);
      readPos += 8;
      writePos += 8;
    }
  }
  return out;
}

function updateStcoEntriesInTree(atom: ParsedAtom, delta: number): void {
  if (atom.name === "stco") {
    atom.payload = updateStcoPayload(atom.payload, 4, delta);
    atom.children = undefined;
    return;
  }
  if (atom.name === "co64") {
    atom.payload = updateStcoPayload(atom.payload, 8, delta);
    atom.children = undefined;
    return;
  }
  atom.children?.forEach((child) => updateStcoEntriesInTree(child, delta));
}

function updateStcoEntries(children: ParsedAtom[], delta: number): void {
  children.forEach((child) => updateStcoEntriesInTree(child, delta));
}

function readIlstText(entry: ParsedAtom): string {
  const p = entry.payload;
  if (p.length < 16) return "";
  if (p.subarray(4, 8).toString("latin1") !== "data") return "";
  if (p.readUInt32BE(8) !== 1) return "";
  return p.subarray(16).toString("utf-8");
}

/** Tag m4a: update ilst text tags and adjust stco/co64 when moov size changes. */
async function tagM4a(
  bytes: Buffer,
  newTitle: string,
  newArtist: string
): Promise<Buffer> {
  try {
    const atoms = parseAtoms(bytes, 0, bytes.length);
    const moovIdx = atoms.findIndex((a) => a.name === "moov");
    const mdatIdx = atoms.findIndex((a) => a.name === "mdat");
    if (moovIdx === -1 || mdatIdx === -1) return bytes;

    const moov = atoms[moovIdx]!;
    if (!moov.children) moov.children = [];

    const oldMoovSize = serializeAtom(moov).length;

    let udta = findChild(moov, "udta");
    if (!udta) {
      udta = buildContainer("udta", []);
      moov.children.push(udta);
    }
    if (!udta.children) udta.children = [];

    let meta = findChild(udta, "meta");
    if (!meta) {
      const hdlrPayload = Buffer.concat([
        Buffer.alloc(8),
        Buffer.from("mdir", "latin1"),
        Buffer.alloc(12),
        Buffer.from([0x00]),
      ]);
      meta = buildContainer("meta", [buildLeaf("hdlr", hdlrPayload)]);
      udta.children.push(meta);
    }
    if (!meta.children) meta.children = [];

    let ilst = findChild(meta, "ilst");
    if (!ilst) {
      ilst = buildContainer("ilst", []);
      meta.children.push(ilst);
    }
    if (!ilst.children) ilst.children = [];

    const prevTitleEntry = ilst.children.find((a) => a.name === "©nam");
    const prevArtistEntry = ilst.children.find((a) => a.name === "©ART");
    const prevAlbumEntry = ilst.children.find((a) => a.name === "©alb");
    const prevTitle = prevTitleEntry ? readIlstText(prevTitleEntry) : "";
    const prevArtist = prevArtistEntry ? readIlstText(prevArtistEntry) : "";
    const prevAlbum = prevAlbumEntry ? readIlstText(prevAlbumEntry) : "";
    const previousSummary = `prev[title=${prevTitle},artist=${prevArtist},album=${prevAlbum}]`;

    const setEntry = (name: string, text: string) => {
      const newEntry = buildIlstEntry(name, text);
      const idx = ilst!.children!.findIndex((a) => a.name === name);
      if (idx >= 0) ilst!.children![idx] = newEntry;
      else ilst!.children!.push(newEntry);
    };
    setEntry("©nam", newTitle);
    setEntry("©ART", newArtist);
    setEntry("©cmt", previousSummary);

    const newMoovSize = serializeAtom(moov).length;
    const delta = newMoovSize - oldMoovSize;
    const moovBeforeMdat = moovIdx < mdatIdx;

    if (moovBeforeMdat && delta !== 0) {
      updateStcoEntries(moov.children, delta);
    }

    const result = serializeAtoms(atoms);
    logger.info({
      event: "tagger_success",
      category: TAGGER_CATEGORY,
      context: { format: "m4a", byteLength: bytes.length, outputLength: result.length },
    });
    return result;
  } catch (err) {
    logger.warn({
      event: "tagger_m4a_parse_failed",
      category: TAGGER_CATEGORY,
      context: { byteLength: bytes.length, error: String(err) },
    });
    return bytes;
  }
}

export async function tagSongBytes({
  bytes,
  newTitle,
  newArtist,
  mimeType,
}: TagSongInput): Promise<Buffer> {
  const sniffed = sniffFormat(bytes);
  const declared = getFormat(mimeType);

  let format: AudioFormat;
  if (sniffed !== "unsupported") {
    if (declared !== "unsupported" && declared !== sniffed) {
      logger.warn({
        event: "tagger_mime_sniff_mismatch",
        category: TAGGER_CATEGORY,
        context: { declared, sniffed, byteLength: bytes.length },
      });
    }
    format = sniffed;
  } else {
    format = declared;
  }

  switch (format) {
    case "mp3":
      return tagWithId3(bytes, newTitle, newArtist);
    case "wav":
      return tagWav(bytes, newTitle, newArtist);
    case "flac":
      return tagFlac(bytes, newTitle, newArtist);
    case "m4a":
      return tagM4a(bytes, newTitle, newArtist);
    default:
      logger.warn({
        event: "tagger_unsupported_format",
        category: TAGGER_CATEGORY,
        context: { mimeType: mimeType ?? null, byteLength: bytes.length },
      });
      return bytes;
  }
}

/** @internal Exported for unit tests (64-bit atom round-trip). */
export { parseAtoms, serializeAtoms };

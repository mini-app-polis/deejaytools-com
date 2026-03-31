import {
  FlacStream,
  MetadataBlockType,
  readFlacTags,
  VorbisCommentBlock,
} from "flac-tagger";
import { parseBuffer } from "music-metadata";
import NodeID3 from "node-id3";

export interface TagSongInput {
  bytes: Buffer;
  newTitle: string;
  newArtist: string;
  mimeType?: string;
}

function getFormat(
  mimeType: string | undefined
): "mp3" | "wav" | "m4a" | "flac" | "unsupported" {
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

/** Tag MP3 and WAV using node-id3 (both support ID3 tags) */
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
    return Buffer.isBuffer(updated) ? updated : bytes;
  } catch {
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
    return stream.toBuffer();
  } catch {
    return bytes;
  }
}

/** Tag m4a using iTunes-style ilst atoms */
async function tagM4a(
  bytes: Buffer,
  newTitle: string,
  newArtist: string
): Promise<Buffer> {
  try {
    const existing = await parseBuffer(bytes, { mimeType: "audio/mp4" });
    const prevTitle = existing.common.title ?? "";
    const prevArtist = existing.common.artist ?? "";

    const result = setM4aTags(bytes, {
      "©nam": newTitle,
      "©ART": newArtist,
      "©cmt": `prev[title=${prevTitle},artist=${prevArtist}]`,
    });
    return result ?? bytes;
  } catch {
    return bytes;
  }
}

/**
 * Minimal iTunes atom writer.
 * Finds the ilst atom inside moov > udta > meta and replaces/adds tags.
 * Returns null if the structure can't be found (caller falls back to original bytes).
 */
function setM4aTags(bytes: Buffer, tags: Record<string, string>): Buffer | null {
  try {
    const dataAtoms = Object.entries(tags).map(([name, value]) => {
      const valueBytes = Buffer.from(value, "utf8");
      const dataPayload = Buffer.alloc(8 + valueBytes.length);
      dataPayload.writeUInt32BE(1, 0);
      dataPayload.writeUInt32BE(0, 4);
      valueBytes.copy(dataPayload, 8);
      const dataAtom = buildAtom("data", dataPayload);
      return buildAtom(name, dataAtom);
    });

    const ilstPayload = Buffer.concat(dataAtoms);
    const newIlst = buildAtom("ilst", ilstPayload);

    return replaceAtom(bytes, ["moov", "udta", "meta", "ilst"], newIlst);
  } catch {
    return null;
  }
}

function buildAtom(name: string, payload: Buffer): Buffer {
  const size = 8 + payload.length;
  const atom = Buffer.alloc(size);
  atom.writeUInt32BE(size, 0);
  atom.write(name, 4, "latin1");
  payload.copy(atom, 8);
  return atom;
}

function replaceAtom(bytes: Buffer, path: string[], replacement: Buffer): Buffer | null {
  if (path.length === 0) return null;

  let offset = 0;
  const target = path[0];

  while (offset + 8 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    if (size < 8 || offset + size > bytes.length) break;

    const name = bytes.toString("latin1", offset + 4, offset + 8);

    if (name === target) {
      if (path.length === 1) {
        return Buffer.concat([
          bytes.subarray(0, offset),
          replacement,
          bytes.subarray(offset + size),
        ]);
      }

      const headerLen = name === "meta" ? 12 : 8;
      if (size < headerLen) break;
      const innerBytes = bytes.subarray(offset + headerLen, offset + size);
      const replaced = replaceAtom(innerBytes, path.slice(1), replacement);
      if (!replaced) return null;

      const newAtom = Buffer.alloc(headerLen + replaced.length);
      newAtom.writeUInt32BE(headerLen + replaced.length, 0);
      newAtom.write(name, 4, "latin1");
      if (name === "meta" && headerLen === 12) {
        bytes.copy(newAtom, 8, offset + 8, offset + 12);
      }
      replaced.copy(newAtom, headerLen);

      return Buffer.concat([
        bytes.subarray(0, offset),
        newAtom,
        bytes.subarray(offset + size),
      ]);
    }

    offset += size;
  }

  return null;
}

export async function tagSongBytes({
  bytes,
  newTitle,
  newArtist,
  mimeType,
}: TagSongInput): Promise<Buffer> {
  const format = getFormat(mimeType);

  switch (format) {
    case "mp3":
    case "wav":
      return tagWithId3(bytes, newTitle, newArtist);
    case "flac":
      return tagFlac(bytes, newTitle, newArtist);
    case "m4a":
      return tagM4a(bytes, newTitle, newArtist);
    default:
      return bytes;
  }
}

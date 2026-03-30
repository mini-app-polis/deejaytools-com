import NodeID3 from "node-id3";

export interface TagSongInput {
  bytes: Buffer;
  newTitle: string;
  newArtist: string;
}

export async function tagSongBytes({
  bytes,
  newTitle,
  newArtist,
}: TagSongInput): Promise<Buffer> {
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
        comment: {
          language: "eng",
          text: previousSummary,
        },
      },
      Buffer.from(bytes)
    );

    return Buffer.isBuffer(updated) ? updated : bytes;
  } catch {
    return bytes;
  }
}

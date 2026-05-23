/**
 * Magic-byte detection for audio formats we accept.
 *
 * This is the source of truth for what we treat as a valid audio upload.
 * The client-reported MIME type (file.type) is unreliable on iOS — Safari
 * sometimes reports application/octet-stream for valid MP3s, and the Files
 * app picker filters by its own rules that don't always match our accept=
 * attribute. By sniffing the actual bytes on the server we avoid both
 * problems and can give users a clear "this isn't audio" error instead of
 * shipping a junk file to Drive.
 *
 * Supported formats match what tagSongBytes() can handle:
 *   - MP3  (ID3 header or MPEG frame sync)
 *   - WAV  (RIFF/WAVE)
 *   - FLAC (fLaC signature)
 *   - M4A / MP4 (ftyp box)
 *
 * Returns the canonical MIME type for tagging, or null if not recognized.
 */
export type DetectedAudioFormat = "audio/mpeg" | "audio/wav" | "audio/flac" | "audio/mp4";

export function detectAudioFormat(bytes: Buffer): DetectedAudioFormat | null {
  if (bytes.length < 12) return null;

  // MP3 with ID3v2 tag: "ID3" at offset 0
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return "audio/mpeg";
  }

  // MP3 frame sync: 0xFF followed by 0xE0..0xFF (11 sync bits).
  // Covers MPEG-1/2/2.5 Layer I/II/III. Reject if not followed by a
  // plausible MPEG header byte (avoids matching random 0xFF runs).
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  // WAV: "RIFF" + 4 bytes size + "WAVE"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45
  ) {
    return "audio/wav";
  }

  // FLAC: "fLaC" at offset 0
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return "audio/flac";
  }

  // M4A / MP4: "ftyp" at offset 4. Brand at offset 8 distinguishes audio
  // (M4A , M4B , isom, mp42, etc.) but for our purposes any ftyp box is
  // accepted — the tagger uses audio/mp4 for all of them.
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return "audio/mp4";
  }

  return null;
}

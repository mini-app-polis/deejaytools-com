import type { ApiSong } from "@/schemas";

// The API's /_v(\d+)(?:\.[^.]*)?$/ (labels.py song_version).
/** The song fields a label is built from. */
export type LabelledSong = Pick<
  ApiSong,
  "partnership_label" | "division" | "routine_name" | "processed_filename"
>;

const VERSION = /_v([0-9]+)(?:\.[^.]*)?$/;

/** The `vNN` a processed filename carries ("..._v03.mp3" → "v03"). */
export function songVersion(processedFilename: string | null | undefined): string | null {
  const match = VERSION.exec(processedFilename ?? "");
  return match ? `v${match[1]}` : null;
}

/**
 * A song as dancers see it: "Partnership Division Routine vNN", the same
 * pieces as the API's dancer-facing submission label.
 *
 * Built from the song's fields, never from the processed filename, and
 * without the season year: the filename's season rolls over on October 1,
 * so a routine for a November event reads as next year's. The year stays in
 * the Drive filename and folders; the app just doesn't show it.
 */
export function songLabel(s: LabelledSong): string {
  return songPieces(s) || "Untitled song";
}

/** The label's pieces alone: "" when the song has none of them. */
export function songPieces(s: LabelledSong): string {
  return [
    s.partnership_label?.trim(),
    s.division?.trim(),
    s.routine_name?.trim(),
    songVersion(s.processed_filename),
  ]
    .filter(Boolean)
    .join(" ");
}

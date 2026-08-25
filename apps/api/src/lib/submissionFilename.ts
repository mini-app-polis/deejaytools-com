import { isOpenEvent } from "@deejaytools/schemas";

export interface SubmissionFilenameInput {
  song: {
    originalFilename: string | null;
    processedFilename: string | null;
    id: string;
  };
  event: { name: string };
}

/**
 * Filename for the per-event Drive copy of a submitted song.
 *
 * Default: the processed filename — the normalized, versioned name built by
 * the upload pipeline (<Partnership>_<Division>_<Season>_<Routine>_v01.mp3).
 * This is also the name uploadSongToDrive gave the source file, so a copy and
 * its original are identifiable as the same track, and an event folder sorts
 * usefully for whoever is playing from it. The entrant's own filename is
 * arbitrary and is only a fallback.
 *
 * In practice the fallback never fires for a real copy: songs.ts writes
 * processed_filename and drive_file_id in the same update, and runCopyJob
 * skips songs with no drive_file_id.
 *
 * The Open is expected to want its own naming convention (bib number, running
 * order, division prefix — not yet decided). That branch lives here so there is
 * one place to change when the format is settled; today it returns the same
 * value as every other event.
 */
export function resolveSubmissionFilename(input: SubmissionFilenameInput): string {
  const { song, event } = input;
  const filename = song.processedFilename?.trim() || song.originalFilename?.trim() || song.id;

  if (isOpenEvent(event.name)) {
    // TODO(open): apply The Open's naming convention once defined.
    return filename;
  }

  return filename;
}

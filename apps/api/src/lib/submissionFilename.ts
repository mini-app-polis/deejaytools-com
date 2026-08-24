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
 * Default: the original filename the entrant uploaded. The processed filename
 * is a fallback for rows uploaded before original_filename was captured.
 *
 * The Open is expected to want its own naming convention (bib number, running
 * order, division prefix — not yet decided). That branch lives here so there is
 * one place to change when the format is settled; today it returns the same
 * value as every other event.
 */
export function resolveSubmissionFilename(input: SubmissionFilenameInput): string {
  const { song, event } = input;
  const original = song.originalFilename?.trim() || song.processedFilename?.trim() || song.id;

  if (isOpenEvent(event.name)) {
    // TODO(open): apply The Open's naming convention once defined.
    return original;
  }

  return original;
}

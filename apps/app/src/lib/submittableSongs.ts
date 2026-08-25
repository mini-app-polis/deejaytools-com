import type { ApiSong } from "@deejaytools/schemas";

export type SongPartition = {
  /** Songs the user may add to an event, plus any legacy song already submitted. */
  submittable: ApiSong[];
  /** How many legacy songs were withheld, for the explanatory note. */
  hiddenLegacyCount: number;
};

/**
 * Split a user's library into songs that can be submitted to an event and
 * legacy rows that cannot.
 *
 * Legacy catalog rows were imported without an audio file — see isLegacySong()
 * in the API — so there is nothing for a DJ to play and they are never valid
 * event submissions. The one exception is a legacy song that is *already*
 * submitted to the event in view: it stays in the list so the entrant can
 * remove it. Filtering it out would leave the submission with no UI to undo it.
 */
export function partitionSubmittableSongs(
  songs: ApiSong[],
  isAlreadySubmitted: (songId: string) => boolean
): SongPartition {
  const submittable = songs.filter((s) => !s.is_legacy || isAlreadySubmitted(s.id));
  return {
    submittable,
    hiddenLegacyCount: songs.length - submittable.length,
  };
}

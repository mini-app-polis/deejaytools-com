import type { ApiEventSongSubmission, ApiSong } from "@deejaytools/schemas";
import { entitySlotKey, songEntityKey } from "@deejaytools/schemas";

/** Slot key for one of the user's songs, matching the API's rule exactly. */
export function slotKeyForSong(song: ApiSong): string {
  return entitySlotKey(
    songEntityKey({
      userId: song.user_id,
      partnerId: song.partner_id,
      managedPartnershipId: song.managed_partnership_id,
    }),
    song.division
  );
}

/**
 * Map of slot key → the song id occupying it, for the submissions in view.
 *
 * Submissions carry song_id but not the entity columns, so the songs list is
 * the source for those. A submitted song the user cannot see in their own
 * library simply does not appear here — the API check is the real gate; this
 * only drives the button state.
 */
export function buildFilledSlots(
  submissions: ApiEventSongSubmission[],
  songs: ApiSong[]
): Map<string, string> {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const filled = new Map<string, string>();
  for (const sub of submissions) {
    const song = songById.get(sub.song_id);
    if (song) filled.set(slotKeyForSong(song), song.id);
  }
  return filled;
}

import {
  ROUND_SPLIT_DIVISION,
  roundsOccupied,
  songEntityKey,
  type ApiEventSongSubmission,
  type ApiSong,
  type SubmissionRound,
} from "@/schemas";

/** How a submission's round reads to a dancer. */
export function roundDisplayLabel(round: SubmissionRound): string {
  switch (round) {
    case "prelims_only":
      return "Prelims only";
    case "finals_only":
      return "Finals only";
    default:
      return "Prelims & finals";
  }
}

/**
 * A Classic entry's round label where rounds split (The Open), else null.
 */
export function classicRoundLabel(
  entry: { division: string | null; round: SubmissionRound },
  roundsAllowed: boolean
): string | null {
  if (!roundsAllowed || entry.division?.trim() !== ROUND_SPLIT_DIVISION) return null;
  return roundDisplayLabel(entry.round);
}

export type MissingRound = {
  /** The round no song covers yet. */
  missing: "prelims" | "finals";
  /** The round-specific submissions the entity does have, to name it by. */
  entered: ApiEventSongSubmission[];
};

/**
 * Entities whose Classic entry at one event covers only one round.
 *
 * Submissions are grouped by the song's entity (unknown songs by their own
 * id), and only Classic ones count. An entity with no Classic submission, or
 * with both rounds covered, is not listed. The caller decides whether the
 * event offers rounds at all.
 */
export function missingClassicRounds(
  submissions: readonly ApiEventSongSubmission[],
  songs: readonly ApiSong[]
): MissingRound[] {
  const songById = new Map(songs.map((s) => [s.id, s]));
  const byEntity = new Map<string, ApiEventSongSubmission[]>();
  for (const sub of submissions) {
    if (sub.division?.trim() !== ROUND_SPLIT_DIVISION) continue;
    const song = songById.get(sub.song_id);
    const key = song
      ? songEntityKey({
          userId: song.user_id,
          partnerId: song.partner_id,
          managedPartnershipId: song.managed_partnership_id,
        })
      : `song:${sub.song_id}`;
    const list = byEntity.get(key) ?? [];
    list.push(sub);
    byEntity.set(key, list);
  }

  const result: MissingRound[] = [];
  for (const subs of byEntity.values()) {
    const covered = new Set(subs.flatMap((s) => roundsOccupied(s.round)));
    for (const round of ["prelims", "finals"] as const) {
      if (!covered.has(round)) result.push({ missing: round, entered: subs });
    }
  }
  return result;
}

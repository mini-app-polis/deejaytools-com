/**
 * Build a structured song label for displays *outside* the live floor-trials
 * queue. Format: "Partnership Division Year RoutineName v##" — with any
 * missing pieces dropped.
 *
 * Inside the live queue we keep the simpler display_name (routine name or
 * filename) because horizontal space is at a premium and the entity is
 * already shown on its own line.
 *
 * Fallback: when the song has no structured metadata at all (no division,
 * no season year, no routine name), we fall back to display_name /
 * processed_filename / song id. This handles admin test placeholders and
 * songs that were created before structured metadata existed.
 */
export function buildStructuredSongLabel(parts: {
  /** "Leader First Last & Follower First Last" or just "Leader First Last" for solo. */
  partnership: string;
  division: string | null;
  seasonYear: string | null;
  routineName: string | null;
  /** Used to extract version (e.g. "_v03" → "v03"). */
  processedFilename: string | null;
  displayName: string | null;
  songId: string;
}): string {
  const versionMatch = parts.processedFilename?.match(/_v(\d+)(?:\.[^.]*)?$/);
  const version = versionMatch ? `v${versionMatch[1]}` : null;

  const division = parts.division?.trim() || null;
  const seasonYear = parts.seasonYear?.trim() || null;
  const routineName = parts.routineName?.trim() || null;
  const partnership = parts.partnership.trim();

  // If the song has at least one structured field, build the structured label.
  // Otherwise fall back to the simpler display name.
  const hasStructure = !!division || !!seasonYear || !!routineName;

  if (hasStructure && partnership) {
    return [partnership, division, seasonYear, routineName, version]
      .filter(Boolean)
      .join(" ");
  }

  return (
    parts.displayName?.trim() ||
    parts.processedFilename?.trim() ||
    partnership ||
    parts.songId
  );
}

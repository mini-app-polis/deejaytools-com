/**
 * A song's length as staff read it: minutes and seconds ("3:05"), with hours
 * in front from an hour on ("1:02:07"). Rounded to the nearest second. Null
 * for a length the API has not read (null or missing) or one that is not a
 * positive number.
 */
export function formatSongLength(ms: number | null | undefined): string | null {
  if (ms == null || !Number.isFinite(ms) || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Keep in sync with _SEASON_ROLLOVER_MONTH in api-deejaytools services/song_builds.py — UI default for event season year. */
export const SEASON_ROLLOVER_MONTH = 10;

export function seasonYearFromDateString(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    return "";
  }
  return String(month >= SEASON_ROLLOVER_MONTH ? year + 1 : year);
}

/** Keep in sync with apps/api/src/lib/seasonYear.ts — UI default for event season year. */
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

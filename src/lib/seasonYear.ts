/**
 * UI default for an event's season year: seasons roll over on October 1
 * (api-deejaytools ADR-0011). Keep the month in sync with the API's.
 */
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

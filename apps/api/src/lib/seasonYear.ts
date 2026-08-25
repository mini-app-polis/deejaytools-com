/**
 * The competitive season a date belongs to.
 *
 * Seasons roll over on October 1: October, November and December belong to the
 * FOLLOWING calendar year. So 2026-09-30 is season "2026" and 2026-10-01 is
 * season "2027".
 *
 * This is the single definition — songs derive it from upload time, events
 * from their start date. Do not reimplement it locally.
 */
export const SEASON_ROLLOVER_MONTH = 10;

/** Season year for a Date, evaluated in the runtime's local timezone. */
export function seasonYearFromDate(d: Date): string {
  const calMonth = d.getMonth() + 1;
  const year = d.getFullYear();
  return String(calMonth >= SEASON_ROLLOVER_MONTH ? year + 1 : year);
}

/** Season year for an epoch-millis timestamp. */
export function seasonYearFromTimestamp(ms: number): string {
  return seasonYearFromDate(new Date(ms));
}

/**
 * Season year for a YYYY-MM-DD date string.
 *
 * Parsed by hand rather than via `new Date(str)`: that constructor treats a
 * bare date as UTC midnight, so in a negative-offset timezone it lands on the
 * previous day and a September 30 / October 1 event would be filed in the
 * wrong season. The string's fields are the intended calendar date and are
 * used directly.
 */
export function seasonYearFromDateString(dateStr: string): string {
  const [yearStr, monthStr] = dateStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`Invalid date string for season year: ${dateStr}`);
  }
  return String(month >= SEASON_ROLLOVER_MONTH ? year + 1 : year);
}

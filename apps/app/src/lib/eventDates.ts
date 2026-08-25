/**
 * Formatting for an event's calendar dates.
 *
 * `events.start_date` / `end_date` are plain YYYY-MM-DD calendar dates, not
 * instants — an event "starts on August 24" everywhere in the world. They are
 * therefore parsed into a LOCAL date rather than through `new Date("2026-08-24")`,
 * which parses as UTC midnight and renders as the previous day for any viewer
 * west of Greenwich. Local noon is used as the anchor so no offset or DST
 * transition can push the value onto a neighbouring day.
 */

const MONTH_DAY = { month: "long", day: "numeric" } as const;
const MONTH_DAY_YEAR = { month: "long", day: "numeric", year: "numeric" } as const;
const DAY_ONLY = { day: "numeric" } as const;

/** Parse "YYYY-MM-DD" to local noon on that calendar day. Null if malformed. */
export function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Human date range for an event card.
 *
 *   one day          → "June 15, 2026"
 *   within a month   → "July 1 – 5, 2026"
 *   within a year    → "August 24 – October 2, 2026"
 *   across years     → "December 30, 2026 – January 2, 2027"
 *
 * Falls back to the raw strings if either date is malformed — the API contract
 * is YYYY-MM-DD, but a listing should degrade to something readable rather
 * than render "Invalid Date".
 */
export function formatEventDateRange(startDate: string, endDate: string): string {
  const start = parseCalendarDate(startDate);
  const end = parseCalendarDate(endDate);
  if (!start || !end) {
    return startDate === endDate ? startDate : `${startDate} – ${endDate}`;
  }

  if (startDate === endDate) {
    return start.toLocaleDateString(undefined, MONTH_DAY_YEAR);
  }

  if (start.getFullYear() !== end.getFullYear()) {
    return `${start.toLocaleDateString(undefined, MONTH_DAY_YEAR)} – ${end.toLocaleDateString(
      undefined,
      MONTH_DAY_YEAR
    )}`;
  }

  // Same year: the year is stated once, at the end. Within one month the month
  // is stated once too ("July 1 – 5" rather than "July 1 – July 5").
  const endPart =
    start.getMonth() === end.getMonth()
      ? end.toLocaleDateString(undefined, DAY_ONLY)
      : end.toLocaleDateString(undefined, MONTH_DAY);
  return `${start.toLocaleDateString(undefined, MONTH_DAY)} – ${endPart}, ${start.getFullYear()}`;
}

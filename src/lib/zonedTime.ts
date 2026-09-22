/**
 * Wall-clock ↔ epoch conversions in an IANA timezone.
 *
 * Used by the admin session editor to store floor-trial start times as the
 * intended local date+time in the parent event's zone, independent of the
 * admin's browser timezone.
 */

function zoneOffsetMs(epoch: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(epoch));

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)!.value;

  let hour = parseInt(get("hour"), 10);
  if (hour === 24) hour = 0;

  const asUtc = Date.UTC(
    parseInt(get("year"), 10),
    parseInt(get("month"), 10) - 1,
    parseInt(get("day"), 10),
    hour,
    parseInt(get("minute"), 10),
    parseInt(get("second"), 10)
  );

  return asUtc - epoch;
}

/**
 * Convert a "YYYY-MM-DD" date + "HH:MM" time string to a Unix epoch (ms),
 * interpreting the wall-clock time as local time in the given IANA timezone.
 *
 * Falls back to browser local time if the timezone is empty or invalid.
 */
export function toEpochInTz(dateStr: string, timeStr: string, tz: string): number {
  if (!tz?.trim()) {
    return new Date(`${dateStr}T${timeStr}:00`).getTime();
  }

  try {
    const [year, month, day] = dateStr.split("-").map(Number);
    const [hours, minutes] = timeStr.split(":").map(Number);
    const wallAsUtc = Date.UTC(year!, month! - 1, day!, hours!, minutes!, 0);
    const firstPass = wallAsUtc - zoneOffsetMs(wallAsUtc, tz);
    return wallAsUtc - zoneOffsetMs(firstPass, tz);
  } catch {
    return new Date(`${dateStr}T${timeStr}:00`).getTime();
  }
}

/**
 * Inverse of toEpochInTz: given an epoch and a timezone, return the local
 * wall-clock time in that zone as "HH:MM" (24-hour).
 */
export function epochToTimeInTz(epoch: number, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(epoch));
    const h = parts.find((p) => p.type === "hour")!.value;
    const m = parts.find((p) => p.type === "minute")!.value;
    return `${h === "24" ? "00" : h}:${m}`;
  } catch {
    const d = new Date(epoch);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
}

/** "YYYY-MM-DD" for the given epoch in the given IANA timezone. */
export function epochToDateInTz(epoch: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(epoch));
  } catch {
    const d = new Date(epoch);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
}

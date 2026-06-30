// Timezone-safe date-only formatting (D-11 / P3 / PLAT-04).
//
// The footgun: `new Date("2025-07-12")` parses the string as UTC midnight, which
// renders as the PREVIOUS day in any negative-offset timezone (all of North
// America). We must never construct a Date from a date-only *string*.
//
// The safe pattern used here: split the 'YYYY-MM-DD' string into numbers, build
// the Date from explicit UTC components, and format with `timeZone: "UTC"`. This
// pins interpretation to UTC regardless of the runtime TZ, so the calendar day is
// identical under Pacific/Kiritimati (UTC+14) and Etc/GMT+12 (UTC-12).

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/**
 * Formats a 'YYYY-MM-DD' date-only string as e.g. "Saturday, July 12".
 * Timezone-immune: identical output regardless of the process TZ.
 */
export function formatDateOnly(yyyymmdd: string): string {
  const match = DATE_RE.exec(yyyymmdd);
  if (!match) {
    throw new Error(`Invalid date-only string: ${yyyymmdd}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Build from explicit UTC components (NOT from the string) and format in UTC.
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Formats a 'HH:MM' 24-hour time string as a 12-hour clock time, e.g.
 * "14:00" -> "2:00 PM". Pure string math — no Date construction.
 */
export function formatTimeOnly(hhmm: string): string {
  const match = TIME_RE.exec(hhmm);
  if (!match) {
    throw new Error(`Invalid time string: ${hhmm}`);
  }
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? "PM" : "AM";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes} ${period}`;
}

/**
 * Formats a date with an optional start time. With a time:
 * "Saturday, July 12 at 2:00 PM"; without: "Saturday, July 12".
 */
export function formatDateWithTime(
  yyyymmdd: string,
  hhmm: string | null,
): string {
  const datePart = formatDateOnly(yyyymmdd);
  if (!hhmm) {
    return datePart;
  }
  return `${datePart} at ${formatTimeOnly(hhmm)}`;
}

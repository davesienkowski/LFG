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
 * Parses a 'YYYY-MM-DD' date-only string into a UTC-pinned Date, throwing on any
 * non date-only input. Shared by the condensed/month formatters below. Never
 * constructs a Date from the *string* (that would drift in negative-offset TZs);
 * builds from explicit UTC components instead (D-11 / P3 / PLAT-04).
 */
function utcDateFromYyyymmdd(yyyymmdd: string): Date {
  const match = DATE_RE.exec(yyyymmdd);
  if (!match) {
    throw new Error(`Invalid date-only string: ${yyyymmdd}`);
  }
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
}

/**
 * Condensed variant of formatDateOnly: 'YYYY-MM-DD' -> "Sat, Jul 12".
 * Timezone-immune (UTC-pinned); throws on invalid input.
 */
export function formatDateShort(yyyymmdd: string): string {
  return utcDateFromYyyymmdd(yyyymmdd).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Condensed date-with-time. With a time: "Sat, Jul 12 · 2:00 PM" (the separator
 * is exactly U+00B7 — a middot, never " at " and never a hyphen). Without a
 * time: "Sat, Jul 12". Reuses formatTimeOnly for the clock half.
 */
export function formatDateWithTimeShort(
  yyyymmdd: string,
  hhmm: string | null,
): string {
  const datePart = formatDateShort(yyyymmdd);
  if (!hhmm) {
    return datePart;
  }
  return `${datePart} · ${formatTimeOnly(hhmm)}`;
}

/**
 * Formats the month + year of a 'YYYY-MM-DD' date, e.g. "July 2025". Used for
 * month-group subheadings. Timezone-immune (UTC-pinned); throws on invalid input.
 */
export function formatMonthYear(yyyymmdd: string): string {
  return utcDateFromYyyymmdd(yyyymmdd).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
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

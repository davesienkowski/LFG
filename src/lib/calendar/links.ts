// Pure calendar-link builders (CAL-01..10). Two string-in/string-out functions —
// buildGoogleCalendarUrl and buildIcs — plus small private helpers. Same
// discipline as format-date.ts: NO I/O, NO DB, and NEVER `new Date(dateString)`
// on a date-only string (that footgun parses as UTC midnight and drifts a day in
// negative-offset zones — D-11 / P3). All date/time math goes through Date.UTC +
// UTC getters, which is ALSO what makes the +1-day roll correct across month,
// year, and leap boundaries (a naive string day-increment breaks 2026-12-31).
//
// Decisions folded in (see PLAN.md <decisions>):
//  - 3h (180 min) default duration for a timed event.
//  - All-day event when startTime is null; DTEND / Google second date is the day
//    AFTER (end-exclusive).
//  - Floating local time when startTime is set (no TZID, no Z on DTSTART/DTEND).
//  - No LOCATION property ever. Title falls back title -> description -> "LFG event".
//  - DESCRIPTION / Google details= emitted ONLY when the description is non-empty.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;

/** A D&D session runs long; a 3h block is a truer default than the usual 1h. */
const DEFAULT_DURATION_MIN = 180;

type BuildArgs = {
  title: string;
  description?: string | null;
  /** 'YYYY-MM-DD' date-only string. */
  date: string;
  /** 'HH:MM' 24h string, or null for an all-day event. */
  startTime: string | null;
};

/** Parse 'YYYY-MM-DD' into a UTC Date built from explicit components (no string parse). */
function utcDateFromYmd(yyyymmdd: string): Date {
  const m = DATE_RE.exec(yyyymmdd);
  if (!m) throw new Error(`Invalid date-only string: ${yyyymmdd}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Return a NEW UTC Date n days after `d`. Rolls month/year/leap boundaries. */
function addDaysUtc(d: Date, n: number): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n),
  );
}

/** Zero-pad a number to `width` digits. */
function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

/** Compact all-day stamp: YYYYMMDD (from a UTC Date). */
function formatDateCompact(d: Date): string {
  return (
    `${d.getUTCFullYear()}` +
    `${pad(d.getUTCMonth() + 1)}` +
    `${pad(d.getUTCDate())}`
  );
}

/** Compact floating date-time stamp: YYYYMMDDTHHMMSS (no zone). */
function formatDateTimeCompact(d: Date): string {
  return (
    `${formatDateCompact(d)}T` +
    `${pad(d.getUTCHours())}` +
    `${pad(d.getUTCMinutes())}` +
    `${pad(d.getUTCSeconds())}`
  );
}

/**
 * Given a date, an 'HH:MM' start, and a duration, produce the start and end as
 * UTC Dates. Built purely from Date.UTC arithmetic so a start near midnight rolls
 * the day forward (22:00 + 3h -> next-day 01:00; 21:00 + 3h -> next-day 00:00).
 * The UTC framing here is a formatting device only — the emitted stamp carries no
 * zone, so it reads as floating local time in the calendar client.
 */
function timedRange(
  yyyymmdd: string,
  hhmm: string,
  durationMin: number,
): { start: Date; end: Date } {
  const dm = DATE_RE.exec(yyyymmdd);
  const tm = TIME_RE.exec(hhmm);
  if (!dm) throw new Error(`Invalid date-only string: ${yyyymmdd}`);
  if (!tm) throw new Error(`Invalid time string: ${hhmm}`);
  const start = new Date(
    Date.UTC(
      Number(dm[1]),
      Number(dm[2]) - 1,
      Number(dm[3]),
      Number(tm[1]),
      Number(tm[2]),
      0,
    ),
  );
  const end = new Date(start.getTime() + durationMin * 60_000);
  return { start, end };
}

/** DTSTAMP: a REAL current instant in UTC (new Date() is legitimate — a true
 * instant, not a date-only string). Format YYYYMMDDTHHMMSSZ. */
function nowStampUtc(): string {
  const d = new Date();
  return `${formatDateTimeCompact(d)}Z`;
}

/** title -> description -> "LFG event" (trim-aware: whitespace-only counts as empty). */
function resolveTitle(title: string, description?: string | null): string {
  if (title && title.trim()) return title;
  if (description && description.trim()) return description;
  return "LFG event";
}

/** Non-empty after trim? */
function hasText(s?: string | null): s is string {
  return !!s && s.trim().length > 0;
}

/**
 * Escape an iCalendar TEXT value per RFC5545 §3.3.11. Backslash MUST be escaped
 * FIRST (otherwise the escapes we add would be double-escaped), then ; , and
 * newlines -> literal `\n`.
 */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n/g, "\\n")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\n");
}

/**
 * Fold a content line at ~75 octets per RFC5545 §3.1 with CRLF + a single space.
 * Iterate by CODE POINT (spread, not code-unit indexing) so a fold never splits a
 * surrogate pair. Called AFTER escaping.
 */
function foldLine(line: string): string {
  const MAX = 75;
  const chars = [...line];
  if (chars.length <= MAX) return line;
  const parts: string[] = [];
  let current = "";
  let first = true;
  for (const ch of chars) {
    // Continuation lines start with a leading space, so their budget is MAX-1.
    const budget = first ? MAX : MAX - 1;
    if ([...current].length >= budget) {
      parts.push(current);
      current = "";
      first = false;
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts.join("\r\n ");
}

/**
 * Build a plain "Add to Google Calendar" render URL (no backend). All-day uses
 * dates=YYYYMMDD/YYYYMMDD+1 (end-exclusive); timed uses
 * YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS with a +180min end (floating, no zone).
 */
export function buildGoogleCalendarUrl({
  title,
  description,
  date,
  startTime,
}: BuildArgs): string {
  const text = resolveTitle(title, description);

  let dates: string;
  if (startTime) {
    const { start, end } = timedRange(date, startTime, DEFAULT_DURATION_MIN);
    dates = `${formatDateTimeCompact(start)}/${formatDateTimeCompact(end)}`;
  } else {
    const startD = utcDateFromYmd(date);
    const endD = addDaysUtc(startD, 1); // end-exclusive next day
    dates = `${formatDateCompact(startD)}/${formatDateCompact(endD)}`;
  }

  const params = new URLSearchParams();
  params.set("action", "TEMPLATE");
  params.set("text", text);
  params.set("dates", dates);
  if (hasText(description)) params.set("details", description);

  // URLSearchParams encodes spaces as '+'; Google accepts either, but keep the
  // %20 convention the tests assert (and that reads more predictably in email).
  const query = params.toString().replace(/\+/g, "%20");
  return `https://calendar.google.com/calendar/render?${query}`;
}

/**
 * Build a valid iCalendar (.ics) document for a single VEVENT. All-day when
 * startTime is null (DTSTART;VALUE=DATE + next-day DTEND); floating timed
 * otherwise (no Z, no TZID). DESCRIPTION only when non-empty; never a LOCATION.
 */
export function buildIcs({
  title,
  description,
  date,
  startTime,
  uid,
}: BuildArgs & { uid: string }): string {
  const summary = escapeIcsText(resolveTitle(title, description));

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LFG//Looking For Group//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${nowStampUtc()}`,
  ];

  if (startTime) {
    const { start, end } = timedRange(date, startTime, DEFAULT_DURATION_MIN);
    lines.push(`DTSTART:${formatDateTimeCompact(start)}`);
    lines.push(`DTEND:${formatDateTimeCompact(end)}`);
  } else {
    const startD = utcDateFromYmd(date);
    const endD = addDaysUtc(startD, 1); // end-exclusive next day
    lines.push(`DTSTART;VALUE=DATE:${formatDateCompact(startD)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDateCompact(endD)}`);
  }

  lines.push(`SUMMARY:${summary}`);
  if (hasText(description)) {
    lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  }
  // NO LOCATION property, ever (decision).

  lines.push("END:VEVENT", "END:VCALENDAR");

  // Fold each line AFTER escaping, join with CRLF, and terminate with a final CRLF.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

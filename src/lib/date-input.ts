// Timezone-safe date INPUT conversion (D-11 / P3 / PLAT-04 — third surface).
//
// Phase 1 fixed the timezone bug at STORAGE (date mode:string) and DISPLAY
// (format-date.ts builds from Date.UTC and formats in UTC). This module fixes the
// INPUT boundary: react-day-picker yields JS `Date` objects, and the obvious
// `date.toISOString().slice(0,10)` formats in UTC, shifting to the PREVIOUS day
// for any local offset that crosses midnight relative to UTC. We must build the
// 'YYYY-MM-DD' string from LOCAL components only — never toISOString()/UTC getters.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Converts a JS `Date` to a 'YYYY-MM-DD' string using its LOCAL calendar day —
 * the day the user actually clicked. Timezone-immune: a Date built from local
 * components round-trips to the same string under any process TZ.
 */
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Today's date as a LOCAL 'YYYY-MM-DD' string — for the calendar's
 * disabled-past boundary. Reads "now" locally (NOT parsing a date-only string).
 */
export function localTodayDateString(): string {
  return toLocalDateString(new Date());
}

export type DatePayloadEntry = { date: string; startTime: string | null };

/**
 * Maps the calendar's selected `Date[]` plus a per-day start-time map into the
 * serialized hidden-input payload: chronologically sorted (date asc, blank time
 * before timed within a day — matching the action's `ORDER BY date, start_time
 * NULLS FIRST`), de-duplicated by local calendar day, every `date` built via the
 * timezone-immune `toLocalDateString`. `times` is keyed by `toLocalDateString`.
 */
export function buildDatesPayload(
  days: Date[],
  times: Record<string, string>,
): DatePayloadEntry[] {
  const seen = new Set<string>();
  const entries: DatePayloadEntry[] = [];
  for (const day of days) {
    const date = toLocalDateString(day);
    if (seen.has(date)) continue; // P-dupe: each day at most once
    seen.add(date);
    const t = times[date];
    entries.push({ date, startTime: t ? t : null });
  }
  entries.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const at = a.startTime ?? ""; // blank (null) sorts first
    const bt = b.startTime ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return 0;
  });
  return entries;
}

/**
 * "Apply to all": returns a times map assigning `value` to every selected day
 * (keyed by `toLocalDateString`). A blank `value` clears every day (date-only).
 * Affects only the days passed in — no partial application, never a silent no-op.
 */
export function applyTimeToAll(
  days: Date[],
  value: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const day of days) {
    next[toLocalDateString(day)] = value;
  }
  return next;
}

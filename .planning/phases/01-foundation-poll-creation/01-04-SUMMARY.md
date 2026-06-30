# Plan 01-04 Summary — Calendar Date Selection (Phase 1 Revision)

**Plan:** 01-04 (calendar multi-select date entry on the creation form)
**Type:** Revision to shipped Phase 1 — UI-only, **no schema/action change**
**Requirement:** POLL-05 (also re-satisfies POLL-03/POLL-04 via the new picker)
**Status:** Executed + verified locally; production redeploy = final step.

## What changed

Replaced the repeating "Add date" rows on `/` with a **month-calendar multi-select** + a
chronologically-sorted **Selected-dates** side list (optional per-date start time + remove) + a
**Default start time / "Apply to all"** control. Mirrors Doodle's "Add your times" Month view.

- `npx shadcn@latest add calendar` → `src/components/ui/calendar.tsx` (react-day-picker v10 + date-fns v4).
- **`src/lib/date-input.ts`** (new): the timezone-safe input boundary —
  - `toLocalDateString(Date)` builds `YYYY-MM-DD` from **local** `getFullYear()/getMonth()+1/getDate()`,
    never `toISOString()`/UTC (third surface of PLAT-04 / P3).
  - `buildDatesPayload(days, times)` — sorted (date asc, blank-time-first), de-duplicated, payload built
    via `toLocalDateString` (single source of truth for label + data).
  - `applyTimeToAll(days, value)` — stamps every selected day (blank clears all).
  - `localTodayDateString()` for the disabled-past boundary.
- **`src/components/calendar-date-picker.tsx`** (new): client component wrapping the calendar + list +
  apply-to-all; owns selection state; emits the serialized `[{date, startTime|null}]` array upward.
- **`src/components/poll-create-form.tsx`**: swapped the row UI for `<CalendarDatePicker>`; the hidden
  `dates` input and everything downstream (createPoll, Zod, dedupe, ordering) are **unchanged**.
- **`src/components/date-row.tsx`**: deleted (retired).

## Edge-probe (full family — engine + prohibition-probe)

Run at the UI-SPEC/PLAN boundary (design §8 step 2; new data shapes warranted the full engine).
Engine on POLL-05 surfaced adjacency/empty/ordering/idempotency/concurrency — all resolved
(see `01-04-UI-SPEC.md` "Edge-Probe Resolution"). Findings folded into `must_haves.prohibitions`:
P3-input (TZ), P-dupe, P-order, P-applyclear, P-pastghost, single-source-of-truth, local-midnight-today.

## Verification (automated, local)

- **Input-layer TZ test** `src/lib/date-input.test.ts` (10 tests) — **GREEN under `TZ=Pacific/Kiritimati`
  (UTC+14) AND `TZ=Etc/GMT+12` (UTC−12)**; a clicked day yields the identical `YYYY-MM-DD` (no off-by-one),
  and the whole payload (sort/dedupe/apply-to-all) is timezone-immune.
- **Full suite: 44/44 GREEN** against real local Postgres — all 34 original Phase 1 tests (incl. the 12
  create-poll contract tests asserting the preserved `[{date,startTime}]` payload, dedupe, ordering,
  token independence) plus the 10 new input-layer tests.
- `npm run lint` clean; `npm run build` passes (TypeScript validates the react-day-picker v10 wiring).
- **No schema migration generated** (`drizzle/` unchanged; `git status` shows no new `.sql`).
- Dev-server render smoke on `/`: calendar grid (`role="grid"`), Default-start-time, Apply-to-all,
  Selected-dates, empty-state copy, and Create-poll CTA all render; no runtime error overlay; clean log.

## Acceptance (design §9) — status

- [x] Month calendar; click adds/removes to a chronologically-sorted Selected-dates list (pure tests + render)
- [x] Optional per-date time; "Apply to all"; per-date overrides persist (pure tests)
- [x] Past days cannot be selected (disabled matcher = local midnight today)
- [x] Same `[{date,startTime}]` payload; createPoll/validation/dedupe/ordering unchanged; existing tests green
- [x] Clicked day correct under UTC+14 and UTC−12 (dual-TZ test green both ways)
- [x] No schema migration; no `polls`/`options` change
- [ ] **Production redeploy succeeds** — final step (Vercel)
- [ ] **Human browser spot-checks** (consistent with Phase 1's pattern): on the deployed `/`, pick days
  out-of-order across a month boundary → list sorts; set one time + Apply to all; remove one; submit →
  admin page lists the correct calendar days with no off-by-one.

## Notes

- react-day-picker v10 `mode="multiple"` `onSelect` returns the full new `Date[]`; selection is held as
  the user's clicked `Date` objects (never re-parsed from strings via `new Date("YYYY-MM-DD")`, design §5).
- The parent passes the stable `useState` setter as `onChange` directly — avoids a render loop from the
  picker's `useEffect([sorted, onChange])` without `useCallback`.
- Local DB tests require `DATABASE_URL` in the test process (vitest doesn't auto-load `.env.local`):
  `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npx vitest run`.

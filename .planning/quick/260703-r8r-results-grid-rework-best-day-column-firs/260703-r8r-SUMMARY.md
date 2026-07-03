---
phase: 260703-r8r
plan: 01
type: execute
status: complete
subsystem: results-ui
tags: [results-grid, ux, filter, best-day, admin, thanks-page]
requires:
  - src/lib/results.ts (computeResults / isBest — read-only)
  - src/lib/vote-state.ts (normalizeVoteState, STATE_META — read-only)
  - src/lib/format-date.ts (formatDateWithTime — read-only)
provides:
  - Best-first column ordering in the shared ResultsGrid (both admin + thanks)
  - Best-day summary sourced from the same isBest predicate as the header badge
  - Decoupled, always-active date/status filter (standalone All-dates status filter)
affects:
  - src/app/a/[adminUrlId]/page.tsx (shared component, no page edit)
  - src/app/p/[participantUrlId]/thanks/page.tsx (shared component, no page edit)
tech-stack:
  added: []
  patterns:
    - "Single derived ordering array (displayOptions) used by header, body, colSpan, and dropdown so they can never disagree"
    - "Module-level pure derivation helpers (resolveDateId, filterParticipants) shared by render + announcement"
    - "Derived-during-render visible set + announce-outside-setState (React 19 double-invocation guard)"
key-files:
  created: []
  modified:
    - src/components/results-grid.tsx
    - src/components/results-grid.test.tsx
    - src/app/a/[adminUrlId]/page.test.ts
decisions:
  - "Best day column(s) render leftmost via filter(isBest)+filter(!isBest) — stable chronological order by construction, no sort"
  - "Best-day summary reads resultByOption.isBest (never a second ranking) — guarantees it names exactly the badged column(s)"
  - "Default view is Best day + Available; degenerate no-best resolves deterministically to the first chronological date"
metrics:
  duration: 8min
  completed: 2026-07-03
---

# Phase 260703-r8r Plan 01: Results Grid Rework (Best-Day-First) Summary

Reworked the shared `ResultsGrid` (rendered on both the admin page and the participant thanks page) to move the best day column(s) to the far left, add a best-day summary, decouple the status filter so it works without first picking a date, and enlarge cells/typography for readability — all as a component-local presentation + filter-logic change with no schema/query/consumer-page edits.

## What Was Built

**Task 1 — `src/components/results-grid.tsx` rework:**
- **Best-first columns:** one derived `displayOptions` array = `options.filter(isBest)` concatenated with `options.filter(!isBest)`. `Array.filter` preserves incoming chronological order, so best days lead (co-best ties stay chronological among themselves) and the non-best remainder stays chronological — no sort, no mutation of `options`. `displayOptions` is the SINGLE ordering source: header `<th>` map, every body-row cell loop, the zero-match `colSpan` (`displayOptions.length + 1`), and the date `<select>` option list all enumerate it, so they can never disagree. The participant-name `<th scope="row">` stays the first (sticky-left) cell.
- **Best-day summary:** rendered above the grid from the SAME `resultByOption.isBest` predicate that drives the header "Best" badge — one source of truth, never a second ranking. Renders "Best day so far: {label} — {yes} available, {ifneedbe} if-need-be" (single best), a "Best days so far (tied):" list (co-best), or "No clear best day yet" (no yes vote). No descendant has exact textContent "Best", so the tests' exact `getByText("Best")` queries still count only header badges.
- **Decoupled, always-active filter:** state is `{ dateSel: string; status: VoteState }` (default `{ "__best__", "yes" }`). Two module-level sentinels `BEST_DAY_VALUE="__best__"` / `ALL_DATES_VALUE="__all__"`. Date select offers Best day (default) / specific dates (best-first) / All dates. Pure helpers `resolveDateId` and `filterParticipants` (module-level, no I/O) are shared by render and the announcement. All-dates mode filters standalone (participant holds the status on some date). Degenerate no-best resolves deterministically to the first chronological date (never a crash). Clear button `disabled` is derived (`dateSel === "__best__" && status === "yes"`). Announcement is computed via `filterParticipants(...).length` and set OUTSIDE any setState updater (React 19 double-invocation desync guard).
- **Readability:** cell padding `px-3 py-2` → `px-4 py-3`, chip text `text-xs` → `text-sm`, icons `size-3.5` → `size-4`, tally text `text-xs` → `text-sm`, `whitespace-nowrap` min-widths. Sticky first column, scroll-fade affordance, and icon+text on every cell preserved. Header intentionally kept non-sticky (unbounded-height overflow box).

**Task 2 — tests + verification:**
- Updated the two intentionally-changed tests (missing/unrecognized chip now needs a status switch under the always-active filter; "Clear filter" rewritten to default-reset semantics).
- Added six new tests: default = Best day + Available (Clear disabled), best-day-leftmost when a later date is best (R8R-01), co-best chronological leftmost order (R8R-02), summary/badge agreement (prohibition-probe #2), standalone All-dates status filter (R8R-05), and "No clear best day yet" determinism (R8R-04/06).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reconciled admin `page.test.ts` for the new default-filtered SSR**
- **Found during:** Task 2 (full-suite run)
- **Issue:** `src/app/a/[adminUrlId]/page.test.ts` asserted the server-rendered admin HTML contains "Jordan Vale". Under the intended new default (Best day + Available), Jordan (if-need-be on the best day) is filtered out of the initial render, so the assertion failed. This is a stale expectation directly caused by the redesign, not a product bug.
- **Fix:** Updated the assertion to reflect the new default view — Alex Canary + Sam Ryder (available on best) render; Jordan (if-need-be) is filtered by default. The tally caption, Best badge, and the non-vacuous email-leak negative (Alex Canary renders, email never appears) are all preserved. No consumer page component (`page.tsx`) was edited — only its test.
- **Files modified:** src/app/a/[adminUrlId]/page.test.ts
- **Commit:** 11cd350

**2. [Rule 1 - Bug] `toBeDisabled` is not available in this project's vitest setup**
- **Found during:** Task 2 (full-suite run)
- **Issue:** New tests used the jest-dom matcher `toBeDisabled`, which this project does not register (`Invalid Chai property: toBeDisabled`).
- **Fix:** Asserted `(button as HTMLButtonElement).disabled === true` instead.
- **Files modified:** src/components/results-grid.test.tsx
- **Commit:** 11cd350

## Verification Results

- `DATABASE_URL=… npm test` — **182 passed (21 files)**, 0 failures. Includes the reworked `results-grid.test.tsx` (all existing behavioral assertions preserved + 6 new tests) and the reconciled admin `page.test.ts`.
- `DATABASE_URL=… npm run build` — **green** (`✓ Compiled successfully`, TypeScript clean, all routes generated).
- `npx tsc --noEmit` (Task 1 gate) — no errors.

Manual visual checks (jsdom cannot assert CSS layout — not gated): best day leftmost, best-day summary visible, Status filter works with Date = "All dates", sticky participant column + scroll-fade + larger cells intact on desktop and narrow viewport.

## Known Stubs

None — all rendering wired to live server-computed props; no placeholder data.

## Self-Check: PASSED

- FOUND: src/components/results-grid.tsx
- FOUND: src/components/results-grid.test.tsx
- FOUND: src/app/a/[adminUrlId]/page.test.ts
- FOUND commit: 11cd350

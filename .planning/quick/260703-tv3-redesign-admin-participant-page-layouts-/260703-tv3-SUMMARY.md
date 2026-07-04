---
phase: 260703-tv3
plan: 01
status: complete
subsystem: ui-layout
tags: [layout, responsive, dashboard, date-formatting, a11y]
requires: []
provides:
  - formatDateShort / formatDateWithTimeShort / formatMonthYear (timezone-safe)
  - 2-column desktop availability matrix
  - functional sticky ResultsGrid header
  - two-column admin dashboard shell
  - condensed candidate-date grids (admin echo + Book-it picker)
affects:
  - src/app/a/[adminUrlId]/page.tsx
  - src/app/p/[participantUrlId]/page.tsx
  - src/components/availability-grid.tsx
  - src/components/results-grid.tsx
  - src/components/book-it-control.tsx
tech-stack:
  added: []
  patterns:
    - "Pure YYYY-MM string-prefix month grouping (no Date → timezone-safe)"
    - "Short visible label + full date carried in title/aria-label for a11y"
    - "Bounded max-h scroll box to make position:sticky top-0 real (edge TV3-09)"
key-files:
  created: []
  modified:
    - src/lib/format-date.ts
    - src/lib/format-date.test.ts
    - src/app/p/[participantUrlId]/page.tsx
    - src/components/availability-grid.tsx
    - src/components/availability-grid.test.tsx
    - src/components/results-grid.tsx
    - src/app/a/[adminUrlId]/page.tsx
    - src/components/book-it-control.tsx
decisions:
  - "Skipped the optional lg:sticky left rail — the controls column (title, echo, 2–3 share cards, invite form) can exceed viewport height on multi-date polls, which would clip its bottom cards. Plan explicitly permits skipping the sticky in this case."
  - "aria-label on non-interactive <li>/<label> chips PLUS title, so the full date is in both the a11y tree and the hover tooltip (and satisfies admin full-date HTML assertions)."
metrics:
  duration: ~18min
  completed: 2026-07-03
  tasks: 5
  files: 8
  tests: 229 passing (23 files)
---

# Phase 260703-tv3 Plan 01: Redesign Admin + Participant Page Layouts Summary

Presentation-only redesign so both pages use desktop width well and present long
candidate-date lists compactly: condensed timezone-safe date formatters, a
2-column desktop availability matrix, a genuinely-pinning ResultsGrid header, a
two-column admin dashboard shell, and denser candidate-date grids — with no data,
query, action, schema, or migration change.

## What was built

**Task 1 — condensed + month-year formatters (TDD).** Added `formatDateShort`
("Sat, Jul 12"), `formatDateWithTimeShort` ("Sat, Jul 12 · 2:00 PM", separator is
exactly U+00B7 with a null-time path), and `formatMonthYear` ("July 2025") to
`src/lib/format-date.ts`, reusing the file's UTC-pinned discipline via a new
`utcDateFromYyyymmdd` helper. Existing exports untouched. New tests assert exact
strings, the middot, the null-time path, and throw-on-invalid; verified
timezone-immune under TZ=Pacific/Kiritimati and TZ=Etc/GMT+12.

**Task 2 — participant shell + 2-column matrix.** ParticipantPage `<main>`
widened `max-w-2xl` → `max-w-4xl` (only token changed). AvailabilityGrid's desktop
matrix is now a responsive 2-column-at-lg grid with mirrored state-column headers,
short visible date labels, and the FULL date preserved in every `role=radio`
aria-label, the `role=radiogroup` label, and the live announcement. Month
subheadings appear only when the set spans >1 month (chronological,
boundary-correct via `date.slice(0,7)`). Exactly one radiogroup per option (no
duplication); mobile stacked-segments and disabled/closed branches unchanged.

**Task 3 — functional sticky ResultsGrid header.** Date `<th>` cells got
`sticky top-0 z-20` + opaque `bg-background` (emerald still wins on best columns);
the corner "Participant" cell got `top-0` and `z-30` so it paints above both the
sticky-left column and sticky-top headers. The scroll wrapper became a bounded
`max-h-[70vh] overflow-y-auto` box so the sticky containing block is bounded and
the header actually pins (edge TV3-09) — short tables stay unchanged under the cap.
Filter, scroll-fade, sticky-left column, and best-first ordering untouched.

**Task 4 — admin two-column dashboard.** `<main>` widened `max-w-2xl` →
`max-w-6xl`; base `flex-col` (controls-then-results below lg), lg two-column grid
`lg:grid-cols-[minmax(320px,380px)_1fr] lg:gap-10`. Left rail: title/pill/summary,
condensed candidate-date echo, share + invite. Right hero: Results (now wrapped in
a `Card p-6`) + Book-it (NOT double-wrapped — BookItControl emits its own Card).
Candidate-date echo is a `grid-cols-2 sm:grid-cols-3` chip grid with short visible
labels and the full date in title + aria-label, month-grouped when multi-month.

**Task 5 — condensed Book-it radio grid.** Candidate-date picker moved from
`flex-wrap` to `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2`,
short visible labels + full date in title/aria-label, options in source
(chronological) order so the first-best preselection and Suggested badge stay
correct. `name=winningOptionId`, value, defaultChecked, disabled, the 44px
`min-h-11` targets, the Suggested badge, and the two-step confirm all preserved.

## Deviations from Plan

None affecting behavior. One in-plan judgment call: the optional `lg:sticky`
left rail was intentionally skipped (see decisions) because the controls column
can exceed viewport height and clip its bottom cards — the plan explicitly allows
skipping the sticky in that case.

## Known Stubs

None.

## Threat Flags

None — presentation/layout-only; no new endpoints, auth paths, file access, or
schema at any trust boundary. The admin page still omits the admin token from the
participant surface and passes no email prop to ResultsGrid (both verified by the
unchanged P2 leak-check and canary-email negative tests).

## Verification

- `DATABASE_URL=… npm test`: **229 passed (23 files)**, 0 failures.
- `DATABASE_URL=… npm run build`: **compiled successfully**, TypeScript passed,
  all routes generated.
- The only intended test edit was `availability-grid.test.tsx` a11y-1 header-label
  counts (1 → 2 for the mirrored headers); every other assertion unchanged.
- No file under `src/lib/actions`, `src/lib/db`, `drizzle/`, or any schema touched.
- Timezone-immunity re-verified for the new formatters under UTC+14 and UTC-12.

## Commits

- `b5ad24a` test(260703-tv3): failing tests for the new formatters (RED)
- `55985d2` feat(260703-tv3): condensed + month-year timezone-safe formatters (GREEN)
- `ab6a3e9` feat(260703-tv3): widen participant shell + 2-column desktop matrix
- `faa2b8f` feat(260703-tv3): functional sticky header row on ResultsGrid
- `5a744a8` feat(260703-tv3): admin two-column dashboard shell + condensed echo
- `9998087` feat(260703-tv3): condensed BookItControl candidate-date radio grid

## Next

Orchestrator will screenshot-verify admin + participant at desktop + mobile, then
deploy. No deploy performed here.

## Self-Check: PASSED
- All 8 modified files exist on disk.
- All 6 commit hashes present in `git log`.

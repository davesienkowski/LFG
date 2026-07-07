---
phase: 03-results-dashboard
plan: 02
subsystem: results-ui
tags: [results, ui, client-island, table, filter, accessibility, best-day]

# Dependency graph
requires:
  - phase: 03-results-dashboard
    plan: 01
    provides: "vote-state.ts (STATE_META/normalizeVoteState), results.ts (computeResults, OptionResult/ResultsParticipant), getResultsForPoll"
provides:
  - "src/components/results-grid.tsx — 'use client' ResultsGrid island: semantic participants × dates table, three-state cells, per-date tallies, best-day highlight, concurrency-safe client-only date/status filter"
  - "Results Dashboard mounted on /a/[adminUrlId] below the Share section (RSC fetch + computeResults -> serializable props)"
affects: [admin-page, phase-04-finalize]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only client island over fully server-computed, serializable props (no client mutation to sync back)"
    - "Derived-during-render filter (no second useState) + announcement set outside the setState updater — React 19 Strict/concurrent double-invocation safe"
    - "Pure-CSS Lea Verou horizontal scroll-shadow (local/scroll background layers) for the off-screen-column affordance — zero new dependency"
    - "Non-vacuous no-leak integration assertion: a rendered participant carries a seeded canary email that must be ABSENT from the admin HTML"

key-files:
  created:
    - src/components/results-grid.tsx
    - src/components/results-grid.test.tsx
  modified:
    - src/app/a/[adminUrlId]/page.tsx
    - src/app/a/[adminUrlId]/page.test.ts

key-decisions:
  - "Single ResultsGrid component holds both table + filter state (RESEARCH Open Q2 recommendation) — no grid/filter split, no prop-drilling seam"
  - "BestDayBadge inlined in results-grid.tsx (Claude's Discretion) rather than a separate file — single small consumer"
  - "Scroll-edge fade implemented as the pure-CSS local/scroll background scroll-shadow (only fades when scrollable) instead of an unconditional mask-image"
  - "GridOption type reused from availability-grid.tsx; ResultsParticipant/OptionResult imported as types from results.ts — zero new shapes"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04, DASH-05]

# Metrics
duration: 15min
completed: 2026-07-01
status: complete
---

# Phase 3 Plan 02: Results Dashboard UI Summary

**A `"use client"` `ResultsGrid` island that renders plan 03-01's server-computed data as an accessible participants × dates table — three-state icon+label cells, always-on per-date tallies, co-located best-day badges, a concurrency-safe client-only date/status filter with zero network round-trips, and a scroll-edge fade — mounted on the admin page and proven not to leak participant email.**

## Performance
- **Duration:** ~15 min
- **Completed:** 2026-07-01
- **Tasks:** 3
- **Files:** 4 (2 created, 2 modified)

## Accomplishments
- Built `ResultsGrid` (DASH-01..05) as a read-only client island over 03-01's serializable props: a semantic `<table>` with a sticky `<th scope="row">` name column and one `<th scope="col">` per candidate date, three-state cells rendered through `STATE_META` + `normalizeVoteState` (icon AND text label; missing/unrecognized -> "Not available", never blank/throws), an always-rendered `"{yes} yes · {ifneedbe} if-need-be"` tally caption (incl. `0 yes · 0 if-need-be`), and a `BestDayBadge` + emerald tint on every `isBest` column co-located with its tally.
- Implemented the DASH-05 filter as a **derived-during-render** row set over local `useState<{ dateId, status }>` — never mirrored into a second state — with the aria-live announcement computed from the NEXT selection and set OUTSIDE any setState updater (mirrors the AvailabilityGrid post-260701-il0 fix), so React 19 Strict/concurrent double-invocation cannot desync the count. Zero `fetch`/Server Action/navigation (grep guard + fetch-spy test both green).
- Added the pure-CSS Lea Verou horizontal scroll-shadow so the `overflow-x-auto` wrapper cues off-screen date columns (including any best-day column) on narrow viewports — no new dependency (UI prohibition-probe finding).
- Mounted the dashboard on `/a/[adminUrlId]` below the Share section (RSC fetches `getResultsForPoll`, runs `computeResults`, passes plain props) with existing sections untouched; extended the DB-backed page test with a **non-vacuous** canary-email-absent assertion and a zero-participants empty-state case.
- Full verify gate green: `tsc`, `lint`, `build`, and the full **111/111** vitest suite (was 96; +13 results-grid + 2 page tests). Both grep guards clean (`src/app/p/` gains no results capability; the filter is network-free).

## Task Commits
1. **Task 1: ResultsGrid client island** — `f6af2e7` (feat)
2. **Task 2: results-grid.test.tsx prohibition-probe + behavior + concurrency** — `c0a5c49` (test)
3. **Task 3: mount on admin page + DB-backed Results test** — `8ba14d8` (feat)

## Files Created/Modified
- `src/components/results-grid.tsx` (created) — the ResultsGrid island (table + cells + tallies + best-day + filter + scroll-fade + inlined BestDayBadge).
- `src/components/results-grid.test.tsx` (created) — 13 jsdom tests: icon+label per state, missing/unrecognized -> Not available, exact tallies incl. zero-vote, co-leader vs no-Best, badge co-located with tally, empty vs zero-match distinction, filter count/rows, rapid date->status final-selection consistency, fetch-spy no-round-trip, Clear filter restore.
- `src/app/a/[adminUrlId]/page.tsx` (modified) — additive: `getResultsForPoll` + `computeResults` fetch/compute, ResultsGrid mounted under a "Results" heading below Share.
- `src/app/a/[adminUrlId]/page.test.ts` (modified) — `seedPoll` extended to seed participants+votes (keyed by option index) + a canary email; 2 new tests (Results render + canary-absent; zero-participants empty state).

## Decisions Made
- **Single component, filter state inline** (RESEARCH Open Q2): the phase's small surface didn't justify a grid/filter split.
- **Scroll-edge affordance = pure-CSS scroll-shadow** (local/scroll background layers): fades only when content is actually scrollable, avoiding an unconditional mask that would dim a fully-visible last column.
- **Reused existing types** (`GridOption`, `ResultsParticipant`, `OptionResult`) — no new shapes; `getOptionsForPoll`'s row (with `position`) satisfies `GridOption` structurally.

## Deviations from Plan
None affecting scope or behavior. One in-task implementation note: the Task 1 file-header comment originally contained the literal phrase `router.refresh`, which tripped the plan's own verify guard (`! grep -nE "useRouter|router\.refresh|next/navigation"`). Reworded the comment to "no client navigation refresh" so the guard proves the source is genuinely navigation-free. No code behavior changed.

## Threat Surface
All threat-register mitigations honored, no new surface introduced:
- **T-03-04 (Info Disclosure):** ResultsGrid accepts no `email` prop; page.test.ts asserts a seeded canary email is absent from the rendered admin HTML (non-vacuous — the participant IS rendered). PASS.
- **T-03-05 (EoP):** grep guard `! grep -rn "ResultsGrid|getResultsForPoll|computeResults" src/app/p/` returns no matches. PASS.
- **T-03-06 (Info Disclosure / round-trip):** no `useRouter`/`fetch`/nav in results-grid.tsx (grep guard) + a `vi.fn()` fetch spy asserts no network call on filter change. PASS.
- **T-03-SC (Supply chain):** zero new dependencies this phase. PASS.

## Known Stubs
None. Every cell/tally/badge is wired to real `getResultsForPoll` + `computeResults` output; no placeholder or hardcoded-empty data paths.

## Next Phase Readiness
- The Results Dashboard is live and integration-tested on `/a/[adminUrlId]`. Phase 4 (finalize / "Book it") can build on the best-day surface; the "Best" copy is strictly a ranking label (never "Confirmed"/"Booked"), leaving the finalize verb to Phase 4.
- Outstanding: one end-of-phase human-verify item — the scroll-edge fade rendering on a narrow viewport when date columns overflow (visual QA, `human_verify_mode=end-of-phase`).

## Self-Check: PASSED

---
*Phase: 03-results-dashboard*
*Completed: 2026-07-01*

---
phase: 03-results-dashboard
plan: 01
subsystem: database
tags: [results, aggregation, drizzle, pure-function, vote-state, leftjoin]

# Dependency graph
requires:
  - phase: 02-participant-voting
    provides: "participants/votes tables, votes_poll_id_idx, AvailabilityGrid STATE_META vocabulary, getOptionsForPoll"
provides:
  - "src/lib/vote-state.ts — shared STATE_META/VoteState/normalizeVoteState (single source of truth for the three-state vocabulary + gap-fill fallback)"
  - "computeResults(participants, options) — pure per-date tally + best-day tie-break aggregation"
  - "getResultsForPoll(pollId) — admin-only, participant-safe LEFT JOIN results read"
affects: [03-02-results-grid-ui, results-dashboard, admin-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared tier-agnostic vocabulary module (vote-state.ts) imported by both client component and pure server logic"
    - "Pure unit-testable aggregation (computeResults) instead of SQL GROUP BY for the high-risk tie-break"
    - "participants LEFT JOIN votes grouped in TS via insertion-ordered Map to preserve SQL createdAt-asc order"
    - "Non-vacuous negative security test via a seeded canary email + structural own-key assertion"

key-files:
  created:
    - src/lib/vote-state.ts
    - src/lib/results.ts
    - src/lib/results.test.ts
    - src/lib/db/queries.test.ts
  modified:
    - src/components/availability-grid.tsx
    - src/lib/db/queries.ts
    - src/lib/actions/create-poll.test.ts

key-decisions:
  - "Extracted STATE_META/VoteState into src/lib/vote-state.ts (RESEARCH Pattern 3 option 2) and re-exported VoteState from availability-grid.tsx so the three participant-route type importers stay untouched"
  - "createdAt selected only for ORDER BY, never projected into getResultsForPoll's returned shape (avoids the Date RSC->client serialization footgun, Pitfall 2)"
  - "Fixed a latent race-unsafe global pollCount() in create-poll.test.ts surfaced by the new parallel DB test file (Rule 1)"

patterns-established:
  - "vote-state.ts: one shared three-state vocabulary + one normalizeVoteState fallback used by both counting and cell rendering"
  - "computeResults: pure, no-throw, preserves caller's chronological option order; flags all co-leaders tied on (yes, if-need-be)"
  - "getResultsForPoll: explicit participant-safe column select-list with a JSDoc-documented omission of email/editToken/adminUrlId"

requirements-completed: [DASH-01, DASH-02, DASH-03, DASH-04]

coverage:
  - id: D1
    description: "src/lib/vote-state.ts is the single source of truth for STATE_META/VoteState/normalizeVoteState; availability-grid.tsx imports from it, its test unchanged"
    requirement: "DASH-02"
    verification:
      - kind: unit
        ref: "src/components/availability-grid.test.tsx (6 tests, unchanged)"
        status: pass
      - kind: other
        ref: "npx tsc --noEmit (proves the three src/app/p/ VoteState importers still resolve)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pure computeResults per-date tallies + best-day tie-break covering every DASH-03/DASH-04 SPEC Edge Coverage case"
    requirement: "DASH-03"
    verification:
      - kind: unit
        ref: "src/lib/results.test.ts (9 tests: strict leader, co-leaders, if-need-be break, all-zero-yes, zero participants, gap-fill, unrecognized literal, exact integers, no-re-sort)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Best-day highlight lexicographic ranking (yes desc, if-need-be desc); all co-leaders flagged isBest; none when max yes is 0"
    requirement: "DASH-04"
    verification:
      - kind: unit
        ref: "src/lib/results.test.ts#flags all co-leading dates tied on both yes and if-need-be"
        status: pass
    human_judgment: false
  - id: D4
    description: "getResultsForPoll admin-only participant-safe read: createdAt-asc order, zero-vote LEFT JOIN row, non-vacuous no-leak (canary email + structural own-keys)"
    requirement: "DASH-01"
    verification:
      - kind: integration
        ref: "src/lib/db/queries.test.ts (6 tests, DB-backed)"
        status: pass
      - kind: other
        ref: "! grep -rn getResultsForPoll|computeResults src/app/p/ (exit 0, no participant-surface leak)"
        status: pass
    human_judgment: false

# Metrics
duration: 22min
completed: 2026-07-01
status: complete
---

# Phase 3 Plan 01: Results Aggregation Foundation Summary

**Shared vote-state vocabulary module, a pure unit-tested best-day/tally `computeResults`, and an admin-only participant-safe `getResultsForPoll` LEFT JOIN read — the tested, serializable building blocks plan 03-02 renders.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-07-01
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- Extracted `STATE_META`/`VoteState` and added `normalizeVoteState` into `src/lib/vote-state.ts` as the single source of truth for the three-state vocabulary and the D-03 gap-fill/unrecognized-literal fallback; `availability-grid.tsx` now imports from it and re-exports `VoteState`, leaving all three participant-route importers and the grid's own test untouched.
- Implemented the pure, no-throw `computeResults` with 9 explicit edge-case tests covering the entire DASH-03 (tallies) and DASH-04 (best-day tie-break) SPEC Edge Coverage — including all co-leaders tied on (yes, if-need-be), all-zero-yes → no highlight, gap-fill, unrecognized literals, and no-re-sort output order.
- Added `getResultsForPoll` (participants LEFT JOIN votes, createdAt-asc, participant-safe columns only) with a DB-backed test proving ordering, the zero-vote LEFT JOIN row, per-vote mapping, and a **non-vacuous** no-leak guarantee via a seeded canary email plus a structural `id/name/votes` own-key assertion.
- Full verify gate green: `tsc`, `lint`, `build`, and the full 96-test vitest suite (stable across 3 consecutive runs).

## Task Commits

1. **Task 1: Extract vote-state.ts + refactor AvailabilityGrid** - `b41b6e3` (refactor)
2. **Task 2: Pure computeResults + edge-case tests** - `4400241` (test, RED) → `29a35ba` (feat, GREEN)
3. **Task 3: getResultsForPoll + non-vacuous DB test** - `3391ae0` (feat, includes the Rule 1 test-isolation fix)

_TDD Task 2 followed RED → GREEN; no refactor commit needed (implementation was clean on first pass)._

## Files Created/Modified
- `src/lib/vote-state.ts` (created) - Shared STATE_META/VoteState + normalizeVoteState fallback helper.
- `src/lib/results.ts` (created) - Pure `computeResults` tally + best-day aggregation.
- `src/lib/results.test.ts` (created) - 9 pure edge-case tests (no DB).
- `src/lib/db/queries.ts` (modified) - Added `getResultsForPoll`; extended drizzle-orm import with `and`.
- `src/lib/db/queries.test.ts` (created) - 6 DB-backed ordering/zero-vote/non-vacuous no-leak tests.
- `src/components/availability-grid.tsx` (modified) - Imports STATE_META/VoteState from vote-state; re-exports VoteState; dropped unused CircleHelp import.
- `src/lib/actions/create-poll.test.ts` (modified) - Rule 1 fix: scoped `pollCount()` to the file's own tracked polls.

## Decisions Made
- **vote-state.ts extraction (not a bare `export`):** chose RESEARCH Pattern 3 option 2 so pure `computeResults` can import `normalizeVoteState` without pulling in a `"use client"` component, and both counting and cell rendering share one fallback definition.
- **createdAt omitted from the returned shape:** selected only inside `ORDER BY`; never projected, sidestepping the `Date` RSC→client serialization question (Pitfall 2) and keeping the payload to `{ id, name, votes }`.
- **VoteState re-exported from availability-grid.tsx:** preserves the public surface for the three `src/app/p/` importers with zero edits to the participant surface (SPEC Prohibition #2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Race-unsafe global `pollCount()` in create-poll.test.ts**
- **Found during:** Task 3 (running the full suite after adding the new DB-backed `queries.test.ts`)
- **Issue:** `create-poll.test.ts` proved "a rejected validation creates no poll" by snapshotting a **global** `SELECT ... FROM polls` count before/after the call and asserting equality. That count is not race-safe: DB-backed test files run in parallel vitest workers and INSERT polls. Five such files already existed; the new `queries.test.ts` (a 6th parallel inserter) tipped the latent flake into a hard failure (`expected 6 to be 5`). The test passed in isolation (12/12), confirming a cross-file parallelism race, not a logic error.
- **Fix:** Scoped `pollCount()` to `inArray(polls.adminUrlId, createdAdminIds)` — the file's own tracked polls, mutated only by this file's sequential success tests, never by a parallel worker. Preserves the exact "our rejected call added no poll" intent while being immune to cross-file inserts. Added an explanatory comment.
- **Files modified:** src/lib/actions/create-poll.test.ts
- **Verification:** Full suite 96/96 passing across 3 consecutive runs (previously flaky).
- **Committed in:** `3391ae0` (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug / test-isolation)
**Impact on plan:** Fix was necessary to keep the suite deterministic; strictly scoped to the failing assertion. No production code affected, no scope creep.

## Issues Encountered
- The `create-poll.test.ts` flake above — root-caused (parallel-worker race on a global count), fixed, and verified stable. No other issues.

## User Setup Required
None - no external service configuration required. DB-backed tests use the existing local Docker Postgres (`lfg-db-1` on :5432) with `DATABASE_URL` exported.

## Next Phase Readiness
- Plan 03-02 can now build `ResultsGrid` / `BestDayBadge` over `getResultsForPoll` + `computeResults` outputs (both serializable, participant-safe) and reuse `STATE_META`/`normalizeVoteState` from `src/lib/vote-state.ts` for read-only cells.
- No blockers. The participant surface (`src/app/p/`) remains free of any results capability (grep gate green).

## Self-Check: PASSED

---
*Phase: 03-results-dashboard*
*Completed: 2026-07-01*

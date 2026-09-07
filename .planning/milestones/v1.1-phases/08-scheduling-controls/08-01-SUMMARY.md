---
phase: 08-scheduling-controls
plan: 01
subsystem: database
tags: [drizzle, postgres, migration, timestamptz, pure-function, vitest, tdd]

# Dependency graph
requires:
  - phase: 07-response-tracking
    provides: "Additive-nullable migration precedent (invitations table, organizerId, creatorEmail) and the local drizzle journal at count 6"
provides:
  - "Nullable polls.deadline (timestamptz) column — NULL = no deadline"
  - "Nullable participants.is_organizer (boolean default false) column"
  - "Additive-only migration 0006, applied to local Docker Postgres"
  - "isVotingOpen(poll, now) pure helper — the single source of truth for the lazy-close rule"
affects: [08-02, 08-03, 08-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy auto-close via a pure derived check (no cron, no read-triggered status write)"
    - "Structurally-typed poll param so one helper serves both admin and participant-safe rows"

key-files:
  created:
    - src/lib/poll-status.ts
    - src/lib/poll-status.test.ts
    - drizzle/0006_lonely_korg.sql
  modified:
    - src/lib/db/schema.ts

key-decisions:
  - "deadline is a timestamptz INSTANT (exempt from the PLAT-04 date-only new Date() prohibition)"
  - "is_organizer single-row invariant enforced by the ORG-01 upsert action (plan 03), not a DB constraint"
  - "isVotingOpen typed structurally as { status, deadline } — accepts admin + participant-safe rows"

patterns-established:
  - "Lazy-close rule lives in exactly one pure function; vote gates consume it rather than re-deriving"
  - "deadline == now closes voting (rule is strictly deadline > now)"

requirements-completed: [DEAD-01, ORG-01]

coverage:
  - id: D1
    description: "Nullable polls.deadline + participants.is_organizer columns via additive-only migration 0006, applied to local Postgres"
    requirement: "DEAD-01"
    verification:
      - kind: automated
        ref: "drizzle/0006_lonely_korg.sql (two ADD COLUMN, no DROP/ALTER); information_schema confirms both columns nullable"
        status: pass
      - kind: automated
        ref: "npx tsc --noEmit — schema typechecks with both new nullable columns"
        status: pass
    human_judgment: false
  - id: D2
    description: "isVotingOpen(poll, now) pure lazy-close helper covering all six branches incl. deadline==now boundary and closed-beats-future-deadline"
    requirement: "DEAD-01"
    verification:
      - kind: unit
        ref: "src/lib/poll-status.test.ts — 6 cases, all pass, no DATABASE_URL required"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-07-07
status: complete
---

# Phase 8 Plan 01: Scheduling Controls Foundation Summary

**Additive migration 0006 adding nullable polls.deadline + participants.is_organizer, plus a pure isVotingOpen(poll, now) helper that is the single source of truth for the lazy-close rule.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-07T18:32:00Z
- **Completed:** 2026-07-07T18:35:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 modified, 3 created)

## Accomplishments
- Added a nullable `deadline` timestamptz to `polls` (NULL = no deadline = existing behavior)
- Added a nullable `is_organizer` boolean (default false) to `participants` (legacy rows read false)
- Generated additive-only migration 0006 (exactly two ADD COLUMN statements, no DROP/ALTER of existing columns) and applied it to the local Docker Postgres
- Created `isVotingOpen(poll, now)` as a pure, DB-free helper implementing `status === "open" && (deadline == null || deadline > now)`, with exhaustive branch coverage

## Task Commits

Each task was committed atomically:

1. **Task 1: Add deadline + is_organizer columns and generate/apply migration 0006** - `6a147c1` (feat)
2. **Task 2 (TDD RED): failing tests for isVotingOpen** - `eac2ef2` (test)
3. **Task 2 (TDD GREEN): implement isVotingOpen** - `f4c8bb1` (feat)

_No REFACTOR commit — the helper is a single-line pure comparison; no cleanup needed._

## Files Created/Modified
- `src/lib/db/schema.ts` - Added `boolean` import; nullable `deadline` on polls, nullable `isOrganizer` (default false) on participants
- `drizzle/0006_lonely_korg.sql` - Additive migration: ADD COLUMN is_organizer (participants), ADD COLUMN deadline (polls)
- `drizzle/meta/_journal.json`, `drizzle/meta/0006_snapshot.json` - Migration journal + snapshot
- `src/lib/poll-status.ts` - Pure `isVotingOpen(poll, now)` lazy-close helper
- `src/lib/poll-status.test.ts` - 6 unit cases (node env, no DB, no mocks) covering every branch

## Decisions Made
- `deadline` typed as timestamptz instant (an exact moment), exempt from the PLAT-04 date-only `new Date()` prohibition per LOCKED constraint 5
- `is_organizer` single-row-per-poll invariant deliberately NOT enforced by a DB constraint this phase — left to the ORG-01 upsert action (plan 03), matching the single-admin model
- `isVotingOpen`'s `poll` param typed structurally as `{ status: string; deadline: Date | null }` so it accepts both the admin poll row and the participant-safe row plan 02 will wire in

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Migration 0006 applied cleanly on top of the existing local journal (as anticipated in the environment note — 0005 was already applied; 0006 is new).

## User Setup Required
None - no external service configuration required. Prod migration is the separate gated ship (plan 04).

## Next Phase Readiness
- Plan 02 (DEAD-01) can consume the migrated `deadline` column and `isVotingOpen` at every vote gate
- Plan 03 (ORG-01) can consume `is_organizer` on participants, gating the organizer's own availability with the SAME helper
- Prod DB has NOT been touched — migration 0006 awaits plan 04's backup → migrate → deploy gate

---
*Phase: 08-scheduling-controls*
*Completed: 2026-07-07*

## Self-Check: PASSED
All created files present (poll-status.ts, poll-status.test.ts, 0006_lonely_korg.sql, 08-01-SUMMARY.md); all task commits (6a147c1, eac2ef2, f4c8bb1) exist in git history; schema.ts contains the deadline column.

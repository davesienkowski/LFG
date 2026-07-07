---
phase: 07-respondent-tracking-nudges
plan: 01
subsystem: database
tags: [drizzle, postgres, migration, invitations, server-action, email]

# Dependency graph
requires:
  - phase: 04-invites-email (send-invites action / MAIL-01/02)
    provides: sendInvites server action with the sequential best-effort per-recipient send loop
provides:
  - Additive invitations table (poll_id FK cascade, email as-entered, invited_at) with a case-insensitive per-poll unique index
  - Best-effort invitation-record write inside sendInvites on each successful send (onConflictDoNothing)
  - Invitation / NewInvitation inferred types
affects: [respondent-tracking, RESP-01, RESP-02, nudge, admin-page, queries]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Functional case-insensitive unique index (poll_id, lower(email)) + target-less onConflictDoNothing() for casing-agnostic dedupe"
    - "Best-effort persistence inside a send loop: try/catch swallows DB errors so the UI result contract is never perturbed (D-05)"

key-files:
  created:
    - drizzle/0005_easy_madripoor.sql
  modified:
    - src/lib/db/schema.ts
    - src/lib/actions/send-invites.ts
    - src/lib/actions/send-invites.test.ts

key-decisions:
  - "Functional unique index over (poll_id, lower(email)) instead of a normalized lowercase column — leads with poll_id so the future admin-only tracking read uses it directly; no redundant plain poll_id index"
  - "Record an invitation ONLY in the ok-branch — rate_limited/failed record nothing (invited = they actually got a link)"
  - "Store the address as-entered (first successful send's original casing); the functional index handles dedupe"

patterns-established:
  - "Best-effort side-effect write wrapped in try/catch inside a send loop never throws to the user, never aborts the loop, never mutates the already-pushed result row"
  - "Additive, prod-safe migration (CREATE TABLE + CREATE UNIQUE INDEX only) — no ALTER against existing tables"

requirements-completed: [RESP-03]

coverage:
  - id: D1
    description: "Additive invitations table (poll_id FK cascade, email, invited_at) with a case-insensitive per-poll unique index; migration is additive-only"
    requirement: "RESP-03"
    verification:
      - kind: other
        ref: "grep -F 'CREATE TABLE \"invitations\"' drizzle/0005_easy_madripoor.sql && no ALTER against polls/options/participants/votes"
        status: pass
      - kind: integration
        ref: "npm run db:migrate applied 0005 clean (exit 0); psql \\d invitations shows unique btree (poll_id, lower(email))"
        status: pass
    human_judgment: false
  - id: D2
    description: "sendInvites records exactly one invitations row per successful send (dedup-safe, best-effort); rate_limited/failed record none; SendInviteResult contract unchanged"
    requirement: "RESP-03"
    verification:
      - kind: integration
        ref: "src/lib/actions/send-invites.test.ts#invitation recording (RESP-03) — (a) ok->1 row, (b) rate_limited/failed->0, (c) any-casing re-invite->1, (d) mixed batch result contract byte-for-byte unchanged"
        status: pass
    human_judgment: false

# Metrics
duration: 15min
completed: 2026-07-07
status: complete
---

# Phase 7 Plan 01: Invitation Persistence Summary

**Additive `invitations` table with a case-insensitive `(poll_id, lower(email))` unique index, plus a best-effort record-on-successful-send write inside `sendInvites` that leaves the per-recipient UI result contract byte-for-byte unchanged.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T17:12:00Z
- **Completed:** 2026-07-07T17:27:00Z
- **Tasks:** 2
- **Files modified:** 3 (+1 migration, +1 snapshot, +journal generated)

## Accomplishments
- New additive `invitations` pgTable (poll_id FK cascade, email as-entered, invited_at timestamptz default now) with a functional `UNIQUE INDEX (poll_id, lower(email))` for casing-agnostic per-poll dedupe; `Invitation`/`NewInvitation` types exported.
- drizzle `0005_easy_madripoor.sql` migration — `CREATE TABLE` + `CREATE UNIQUE INDEX` only, zero `ALTER` against existing tables; applied clean locally.
- `sendInvites` now records exactly one invitation per successful send via `onConflictDoNothing()`, best-effort in try/catch so a DB failure never throws, never aborts the loop, and never mutates the already-pushed `SendInviteResult`.
- 5 new DB-backed tests prove ok→1 row, rate_limited/failed→0 rows, any-casing re-invite→still 1 row, and the mixed-batch result array is byte-for-byte unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add invitations table + case-insensitive unique index + generate migration** - `70bc89b` (feat)
2. **Task 2: Record an invitation on each successful send (best-effort, result-preserving)** - `a577fee` (feat)

## Files Created/Modified
- `src/lib/db/schema.ts` - Added `invitations` pgTable + functional unique index; imported `sql` and `uniqueIndex`; exported `Invitation`/`NewInvitation`.
- `drizzle/0005_easy_madripoor.sql` - Additive migration (CREATE TABLE invitations + CREATE UNIQUE INDEX over lower(email)).
- `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json` - drizzle-kit generated snapshot + journal entry.
- `src/lib/actions/send-invites.ts` - Best-effort `db.insert(invitations).values({ pollId, email }).onConflictDoNothing()` inside the `if (result.ok)` branch, wrapped in try/catch.
- `src/lib/actions/send-invites.test.ts` - Extended `seedPoll` to return `pollId`, added `invitationCount` helper, explicit invitations cleanup in `afterAll`, and the RESP-03 recording test group (a)-(d).

## Decisions Made
- Functional unique index over `(poll_id, lower(email))` (per CONTEXT Claude's-discretion) rather than a generated lowercase column — a single composite index also serves the future admin-only `where poll_id = $1` read, so no separate plain `poll_id` index was added.
- Address stored as-entered; dedupe delegated entirely to the functional index + target-less `onConflictDoNothing()`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Backfilled the local drizzle migration journal so `db:migrate` could apply 0005**
- **Found during:** Task 1 (applying the migration locally)
- **Issue:** The local Docker Postgres already had the v1.0 schema (polls/options/participants/votes) but `drizzle.__drizzle_migrations` was empty — the local DB had been provisioned via `db:push`, not `migrate`. As a result `drizzle-kit migrate` tried to replay `0000` (CREATE TABLE polls → already exists) and exited 1, blocking the plan's required `npm run db:migrate` step.
- **Fix:** Inserted the five pre-0005 journal rows (correct sha256 file hashes + `when` timestamps from `_journal.json`) into `drizzle.__drizzle_migrations`, so `migrate` recognized 0000-0004 as applied and ran only `0005`. Local-only; prod is untouched (prod migration is the separate, gated plan 07-04).
- **Files modified:** none (local DB tracking-table state only)
- **Verification:** `npm run db:migrate` then exited 0 and applied `0005`; `psql \d invitations` confirms the table, the `(poll_id, lower(email))` unique btree index, and the cascade FK.
- **Committed in:** n/a (DB state, not source)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The backfill was necessary to satisfy the plan's `db:migrate` acceptance step; it reconciles the local migration journal with reality and does not alter any schema or prod. No scope creep.

## Issues Encountered
- The `drizzle-kit` spinner overwrote its own failure line, so the initial `migrate` failure surfaced only as a bare exit-1 with no visible error. Diagnosed by inspecting `drizzle.__drizzle_migrations` (0 rows) against the existing tables, which revealed the push-vs-migrate journal mismatch. Resolved via the backfill above.

## User Setup Required
None - no external service configuration required. Prod migration of the `invitations` table is deferred to plan 07-04 (backup → migrate → deploy).

## Next Phase Readiness
- The invited-list source of truth now persists, unblocking RESP-01 (responded/not-responded tracking) and RESP-02 (nudge non-respondents).
- Follow-on plans should add: an admin-only invited-emails read in `queries.ts` (no-leak discipline), the "Who's responded" admin surface (07-02/03), the `nudgeNonRespondents` action + reminder template, and the gated prod migration (07-04).

## Self-Check: PASSED

- All created/modified files exist on disk (schema.ts, 0005 migration, send-invites.ts, send-invites.test.ts, SUMMARY.md).
- Both task commits present in git history (70bc89b, a577fee).
- `npm test -- src/lib/actions/send-invites.test.ts` green (14/14); touched files lint clean.

---
*Phase: 07-respondent-tracking-nudges*
*Completed: 2026-07-07*

---
phase: 04-email-finalization
plan: 02
subsystem: finalization
tags: [drizzle, migration, server-actions, nextjs-after, react, useActionState, postgres]

# Dependency graph
requires:
  - phase: 01-foundation-poll-creation
    provides: "polls/options schema, getPollByAdminUrlId, getOptionsForPoll, resolveBaseUrl/buildParticipantUrl, formatDateWithTime, drizzle-kit generate/migrate"
  - phase: 02-participant-voting
    provides: "status open->closed read-only guard (submit/updateResponse reject non-open), participants.email field"
  - phase: 03-results-dashboard
    provides: "computeResults OptionResult.isBest (best-day pre-selection source), ResultsGrid"
  - phase: 04-email-finalization
    plan: 01
    provides: "sendEmail() transport seam, renderFinalizationEmail template, after() best-effort send pattern"
provides:
  - "polls.winning_option_id nullable uuid FK -> options.id (ON DELETE SET NULL), live in local Docker Postgres"
  - "closePoll admin-token-gated finalize action: single UPDATE close + best-effort deduped finalization emails"
  - "getVoterEmailsForPoll + getPollWithWinningOption read helpers"
  - "BookItControl client island (native radio picker + two-step confirm disclosure)"
  - "Admin-page Book-it section (picker when open / finalized card when closed) + Booked badge"
affects: [04-03-deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Circular FK type-inference broken with an explicit `(): AnyPgColumn` reference-thunk annotation (Drizzle bidirectional FK)"
    - "Finalize = single atomic UPDATE (neon-http-safe) + best-effort after() notify loop deduped by trimmed/lower-cased address"
    - "Two-step confirm disclosure: type=button trigger reveals an in-place amber panel; only the type=submit control fires the server action"

key-files:
  created:
    - src/lib/actions/close-poll.ts
    - src/lib/actions/close-poll.test.ts
    - src/components/book-it-control.tsx
    - src/components/book-it-control.test.tsx
    - drizzle/0002_superb_skaar.sql
    - drizzle/meta/0002_snapshot.json
  modified:
    - src/lib/db/schema.ts
    - src/lib/db/queries.ts
    - src/lib/db/queries.test.ts
    - src/app/a/[adminUrlId]/page.tsx
    - src/app/a/[adminUrlId]/page.test.ts
    - drizzle/meta/_journal.json

key-decisions:
  - "winning_option_id is additive + nullable (D-04): NULL is the legitimate 'open, undecided' state, not accidental debt; reuses the existing status column for open->closed (no new status vocabulary)"
  - "A `(): AnyPgColumn` annotation on the reference thunk is REQUIRED (not stylistic) to break the polls<->options circular type-inference cycle that otherwise fails the TypeScript build"
  - "closePoll validates winningOptionId (uuid) BEFORE the poll lookup; a non-uuid short-circuits to the same _form message as a foreign option id"
  - "Finalization emails swallow per-recipient failures in a try/catch inside after() so one throw never reverts the committed close nor aborts the remaining recipients (D-09/T-04-10)"
  - "Admin page uses getPollWithWinningOption (one LEFT JOIN read) so the finalized card gets the winner's date/time without a second query"

requirements-completed: [FNL-01, FNL-02, FNL-03]

coverage:
  - id: D6
    description: "polls.winning_option_id nullable FK live in local Postgres (BLOCKING migration gate), additive-only migration, build passes"
    requirement: "FNL-01"
    verification:
      - kind: manual_procedural
        ref: "docker exec lfg-db-1 psql -U postgres -d lfg -c '\\d polls' shows winning_option_id | uuid + ON DELETE SET NULL FK; npm run build passes"
        status: pass
    human_judgment: false
  - id: D7
    description: "closePoll: admin-token gated (notFound on unknown), rejects already-closed poll, rejects foreign winningOptionId, single UPDATE sets status+winner"
    requirement: "FNL-01"
    verification:
      - kind: integration
        ref: "src/lib/actions/close-poll.test.ts#guards (already-closed / foreign-option T-04-09 / non-uuid / unknown-token notFound)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Finalization emails via after(), deduped by trimmed/lower-cased address, skip no-email voters, zero-email polls close cleanly, a send failure never reverts the close (D-09)"
    requirement: "FNL-03"
    verification:
      - kind: integration
        ref: "src/lib/actions/close-poll.test.ts#valid-finalize dedupe + best-effort D-09 send-failure"
        status: pass
    human_judgment: false
  - id: D9
    description: "getVoterEmailsForPoll returns only name/email for emailed voters, leaks no token/admin column (T-04-08)"
    requirement: "FNL-03"
    verification:
      - kind: integration
        ref: "src/lib/db/queries.test.ts#getVoterEmailsForPoll no-leak + null-email exclusion"
        status: pass
    human_judgment: false
  - id: D10
    description: "Two-step confirm ('Book this date' type=button never submits; only 'Confirm and close poll' fires closePoll); best day pre-selected; exactly one of picker/finalized renders by status"
    requirement: "FNL-01/FNL-02"
    verification:
      - kind: unit
        ref: "src/components/book-it-control.test.tsx#two-step confirm + pre-selection; src/app/a/[adminUrlId]/page.test.ts#open picker vs closed finalized card"
        status: pass
    human_judgment: false
  - id: D11
    description: "Mailpit finalization smoke: close a poll with emailed voters -> finalization email with chosen date lands in Mailpit; participant page shows 'Voting is closed'"
    requirement: "FNL-02/FNL-03"
    verification:
      - kind: manual_procedural
        ref: "docker compose up; finalize a seeded poll; check http://localhost:8025 + /p/[participantUrlId]"
        status: unknown
    human_judgment: true
    rationale: "Visual/functional email-capture + read-only confirmation is a human end-of-phase check (human_verify_mode: end-of-phase)."

# Metrics
duration: 9min
completed: 2026-07-02
status: complete
---

# Phase 4 Plan 02: Finalization — Book it, Close Poll & Finalization Emails Summary

**The organizer can now "Book it" on a winning date (best day pre-selected) behind an explicit two-step confirm; closePoll flips the poll closed in one authoritative UPDATE (reusing Phase 2's read-only guard) and best-effort-notifies every unique emailed voter via `after()`, backed by a new additive, nullable `winning_option_id` FK verified live in local Postgres before any code read it.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-02T16:33:47Z
- **Completed:** 2026-07-02T16:43:10Z
- **Tasks:** 3 completed
- **Files created/modified:** 12

## Accomplishments

- **The BLOCKING migration gate (FNL-01 / T-04-11):** added `polls.winningOptionId` (nullable `uuid` FK → `options.id`, `ON DELETE SET NULL`), generated `drizzle/0002_superb_skaar.sql` (reviewed: a single `ADD COLUMN` + FK, no DROP/ALTER of any existing column), applied it to the live local Docker Postgres via `db:migrate`, and verified the `winning_option_id | uuid` row exists via `psql` before any downstream code read the column — closing the false-positive gap where the TypeScript build would pass without the live column.
- **`closePoll` finalize action (FNL-01/02):** admin-token-gated (re-derives the poll via `getPollByAdminUrlId`, `notFound()` on miss — V4/T-04-07), rejects an already-closed poll and a `winningOptionId` that doesn't belong to this poll (T-04-09), then commits the close as a **single** `db.update(polls).set({ status:'closed', winningOptionId })` — neon-http-safe, no interactive transaction. Read-only enforcement is entirely reused from Phase 2 (no new enforcement code).
- **Best-effort finalization emails (FNL-03 / D-09 / T-04-10):** scheduled via `after()` *after* the UPDATE, reusing 04-01's `sendEmail()` seam + `renderFinalizationEmail`. Recipients are deduped by trimmed/lower-cased address (a shared inbox gets one notice), no-email voters are skipped, a zero-email poll still closes cleanly, and each send is wrapped so a failure never reverts the committed close nor aborts the remaining recipients. The base URL is captured before `after()`; the subject is a fixed template + the length-capped `poll.title` (T-04-01).
- **Read helpers:** `getVoterEmailsForPoll` (name/email of emailed voters only — no `edit_token`/`admin_url_id` leak, T-04-08) and `getPollWithWinningOption` (poll row + winning option date/time via a single LEFT JOIN).
- **Book-it UI (FNL-01/02):** `BookItControl` client island — a native `<fieldset>`/radio picker with the computed best day pre-selected (falls back to the first candidate when no votes exist), and a two-step confirm disclosure where "Book this date" (`type="button"`) only reveals the amber panel and **only** "Confirm and close poll" (`type="submit"`) fires `closePoll`. The admin page renders exactly one of {picker, "Poll finalized" card} by `poll.status`, adds an emerald "Booked" badge next to the title when closed, and uses best-effort framing ("should get a confirmation", never "was notified").

## Task Commits

1. **Task 1: winning_option_id column + local migration gate** — `ad1fdc3` (feat)
2. **Task 2: closePoll action + voter-email query + finalization emails** — `ab606f5` (feat)
3. **Task 3: Book-it picker + confirm UI, finalized card, Booked badge** — `eda457e` (feat)

## Files Created/Modified

- `src/lib/db/schema.ts` — additive nullable `winningOptionId` FK; `AnyPgColumn` annotation to break the circular FK type cycle
- `drizzle/0002_superb_skaar.sql` / `drizzle/meta/*` — generated additive migration (ADD COLUMN + ON DELETE SET NULL FK)
- `src/lib/db/queries.ts` — `getVoterEmailsForPoll`, `getPollWithWinningOption`
- `src/lib/db/queries.test.ts` — `getVoterEmailsForPoll` no-leak + null-email-exclusion cases
- `src/lib/actions/close-poll.ts` — `closePoll` finalize server action
- `src/lib/actions/close-poll.test.ts` — DB-backed: valid close, dedupe/skip, guards, unknown-token notFound, zero-email, send-failure best-effort
- `src/components/book-it-control.tsx` — `BookItControl` picker + two-step confirm island
- `src/components/book-it-control.test.tsx` — two-step confirm + best-day pre-selection (jsdom)
- `src/app/a/[adminUrlId]/page.tsx` — Book-it section (picker/finalized), Booked badge, `getPollWithWinningOption`
- `src/app/a/[adminUrlId]/page.test.ts` — open-picker vs closed-finalized render coverage

## Decisions Made

- **`winning_option_id` additive + nullable (D-04):** a nullable FK correctly models "open, no winner yet"; the open→closed transition reuses the existing `status` text column — no new status vocabulary, no enum-alter friction.
- **`getPollWithWinningOption` used by the page:** one LEFT-JOIN read yields both the poll row and the winner's date/time, so the finalized card needs no second query; `getPollByAdminUrlId` (full row, now including `winningOptionId`) still backs `closePoll`.
- **uuid validation precedes the poll lookup in `closePoll`:** a non-uuid `winningOptionId` can never match a real option, so it short-circuits to the same "Choose a candidate date from this poll." message as a foreign option id.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Broke a circular FK type-inference cycle with an `AnyPgColumn` annotation**
- **Found during:** Task 1 (first `npm run build` after adding the column)
- **Issue:** Adding `polls.winningOptionId → options.id` while `options.pollId → polls.id` already exists creates a mutual/circular table reference. TypeScript failed the build with "'polls' implicitly has type 'any' … referenced directly or indirectly in its own initializer." The plan assumed the forward-thunk alone would suffice (it does for a one-directional reference, but not for a bidirectional cycle).
- **Fix:** Annotated the reference thunk return type as `(): AnyPgColumn => options.id` (the Drizzle-documented fix for circular FKs) and imported `type AnyPgColumn` from `drizzle-orm/pg-core`. This breaks the inference cycle without changing the emitted SQL.
- **Files modified:** `src/lib/db/schema.ts`
- **Verification:** `npm run build` passes; the additive migration SQL is unchanged.
- **Committed in:** `ad1fdc3` (part of Task 1)

**Total deviations:** 1 auto-fixed (1 × Rule 3). No architectural changes, no scope creep.

## Issues Encountered

- **`z.string().uuid()` strictness (test-only, self-corrected during Task 2):** an initial test placeholder id (`1111…1111`) is not a valid UUID per Zod (invalid variant nibble), so it short-circuited before the intended notFound path. Fixed the test fixture to a well-formed v4/variant-8 UUID (`00000000-0000-4000-8000-000000000000`). No production-code impact.
- **Build requires `DATABASE_URL`** (pre-existing Phase 1 condition, noted in 04-01): `next build` evaluates `db/index.ts`. Builds run with the local `DATABASE_URL` exported.

## User Setup Required

None for local development. Production Neon migration of `0002_superb_skaar.sql` + redeploy is Plan 04-03's responsibility (per-MEMORY, self-serve via `npx vercel env pull` → `db:migrate` → deploy).

## Next Phase Readiness

- `0002_superb_skaar.sql` is generated and journal-tracked, ready for the prod Neon `db:migrate` + Vercel deploy in 04-03.
- Recommended end-of-phase human smoke (Mailpit): `docker compose up`, finalize a poll that has emailed voters, confirm a finalization email with the chosen date lands at http://localhost:8025, and that the participant page renders "Voting is closed".

---
*Phase: 04-email-finalization*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 6 spot-checked created/modified source files exist on disk; all 3 task commits (ad1fdc3, ab606f5, eda457e) are present in git history; the `winning_option_id` column is confirmed live in the local Docker Postgres.

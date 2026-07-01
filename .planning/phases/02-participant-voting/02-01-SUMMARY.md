---
phase: 02-participant-voting
plan: 01
subsystem: ui
tags: [drizzle, postgres, server-actions, react, useActionState, cookies, nanoid, zod, vitest, testing-library]

# Dependency graph
requires:
  - phase: 01-foundation-poll-creation
    provides: polls/options schema, dual-driver db client (neon-http no-txn), generateToken, getPollByParticipantUrlId/getOptionsForPoll participant-safe queries, formatDateWithTime, CopyLinkButton, PollSummary, createPoll no-transaction + token-collision-retry pattern
provides:
  - participants + votes tables (+ 0001 migration) with votes_participant_option_unique
  - INSERT-only submitResponse server action (validate -> insert participant + gap-filled votes -> httpOnly edit cookie -> redirect /thanks)
  - buildEditUrl absolute edit-link builder
  - AvailabilityGrid 3-state click-to-cycle client island with VOTE-07 bulk actions
  - shared VoteForm (parameterized action/initial/readOnly for 02-02 reuse)
  - live participant vote view (open submit form / closed read-only) + /thanks confirmation
affects: [02-02-edit-route, 03-results-aggregation, 04-email-and-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "INSERT-only two-statement write (participant insert w/ token-retry, then one batched votes insert) — no interactive transaction (neon-http, D2-04)"
    - "Server-side gap-fill: vote rows built by iterating authoritative getOptionsForPoll, untouched options => 'no', foreign optionIds ignored"
    - "Server action sets httpOnly cookie (keyed on participantUrlId) then redirect; RSC reads it via next/headers on /thanks"
    - "Shared client-island form (AvailabilityGrid -> hidden votes input -> useActionState) parameterized for reuse across submit and edit routes"

key-files:
  created:
    - src/lib/actions/submit-response.ts
    - src/lib/actions/submit-response.test.ts
    - src/components/availability-grid.tsx
    - src/components/availability-grid.test.tsx
    - src/components/vote-form.tsx
    - src/app/p/[participantUrlId]/thanks/page.tsx
    - drizzle/0001_lazy_odin.sql
  modified:
    - src/lib/db/schema.ts
    - src/lib/urls.ts
    - src/app/p/[participantUrlId]/page.tsx
    - src/app/p/[participantUrlId]/page.test.ts

key-decisions:
  - "editToken is a third independent nanoid(21) minted via generateToken(), never derived from participantUrlId (D2-11, extends P1)"
  - "vote.state stored as text constrained by Zod enum at the action boundary, not a Postgres enum (D2-03)"
  - "Added an optional `heading` prop to VoteForm (default 'Your availability') so 02-02's edit route can render 'Edit your availability' without forking the component"
  - "Read-only (closed) grid cells render as non-interactive <span>, not disabled <button>; bulk row + submit button omitted entirely (UI-SPEC a11y)"

patterns-established:
  - "No-interactive-transaction insert extended from createPoll to submitResponse"
  - "Server-authoritative gap-fill defeats poisoned/partial client vote arrays (T-02-01)"
  - "TOCTOU status guard: poll.status re-checked server-side at write time (T-02-02)"

requirements-completed: [VOTE-01, VOTE-02, VOTE-03, VOTE-07]

coverage:
  - id: D1
    description: "participants + votes tables with votes_participant_option_unique, both indexes, cascade FKs, nullable email, NOT NULL edit_token; 0001 migration applied to local Postgres"
    verification:
      - kind: integration
        ref: "src/lib/actions/submit-response.test.ts (persists one participant + one vote per option)"
        status: pass
      - kind: other
        ref: "pg introspection: TABLES/CONSTRAINTS/VOTES_INDEXES/FK_DELETE_RULES all present"
        status: pass
    human_judgment: false
  - id: D2
    description: "INSERT-only submitResponse: Zod validation, status guard, editToken independence, gap-fill, foreign-optionId rejection, httpOnly cookie, redirect /thanks; buildEditUrl"
    requirement: "VOTE-01"
    verification:
      - kind: integration
        ref: "src/lib/actions/submit-response.test.ts (13 tests: success/validation/status/unknown-token/foreign-option/cookie)"
        status: pass
    human_judgment: false
  - id: D3
    description: "AvailabilityGrid 3-state click-to-cycle with icon+label (color never sole signal), Set all/Clear bulk actions + per-cell override, disabled => span"
    requirement: "VOTE-07"
    verification:
      - kind: unit
        ref: "src/components/availability-grid.test.tsx (6 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "VoteForm + participant vote view: open renders submit form pointed at submitResponse; closed renders 'Voting is closed' banner + non-interactive cells + no submit; no admin_url_id leak; unknown token 404"
    requirement: "VOTE-02"
    verification:
      - kind: integration
        ref: "src/app/p/[participantUrlId]/page.test.ts (open/closed/unknown-token)"
        status: pass
    human_judgment: false
  - id: D5
    description: "/thanks confirmation: edit-link card via buildEditUrl + CopyLinkButton + explicit don't-share bearer-credential warning; missing cookie 404s; no admin_url_id"
    requirement: "VOTE-03"
    verification:
      - kind: integration
        ref: "src/app/p/[participantUrlId]/page.test.ts (ThanksPage: edit-link + warning + no-admin-leak; cookie-absent 404)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Rendered visual/interaction quality of the grid + surfaces (emerald/amber/neutral palette, 48px touch targets, cycle feel, closed-poll read-only look) in a real browser"
    verification: []
    human_judgment: true
    rationale: "Visual appearance, color contrast in-browser, and click-to-cycle feel cannot be fully proven by static/jsdom tests — needs a human pass on the running dev server."

# Metrics
duration: ~35min (active build); DB cold-start diagnosis added wall-clock, see Issues
completed: 2026-07-01
status: complete
---

# Phase 2 Plan 01: Participant First-Submit Slice Summary

**End-to-end participant vote-and-confirm journey: participants + votes schema, an INSERT-only submitResponse action with server-authoritative gap-fill and a status guard, the 3-state AvailabilityGrid client island with VOTE-07 bulk actions, a shared VoteForm, and the live vote view + /thanks edit-link confirmation.**

## Performance

- **Duration:** ~35 min active build (plus DB cold-start diagnosis — see Issues)
- **Started:** 2026-07-01 (session)
- **Completed:** 2026-07-01T03:13Z
- **Tasks:** 3
- **Files modified/created:** 11 source files (+ generated migration/snapshot/journal)

## Accomplishments
- Added `participants` + `votes` tables (0001 migration) with the `votes_participant_option_unique` constraint, `votes_poll_id_idx`/`votes_participant_id_idx`, cascade FKs, nullable `email`, and `NOT NULL UNIQUE edit_token` — verified live against the Docker Postgres.
- Implemented INSERT-only `submitResponse`: Zod-validated name/email/votes, `notFound()` on unknown token, server-enforced `poll.status` guard, independent `editToken` mint with unique-collision retry, gap-filled vote rows from the authoritative option list (foreign optionIds ignored), an httpOnly edit cookie keyed on `participantUrlId`, then redirect to `/thanks`. 13 DB-backed tests green.
- Built the `AvailabilityGrid` (3-state click-to-cycle, icon+label so color is never the only signal, untouched cell shows full "Not available", bulk Set all/Clear, disabled => non-interactive span) and the shared `VoteForm`, and rewrote the participant page to render the open submit form / closed read-only surface, plus the `/thanks` edit-link card with the mandatory don't-share bearer-credential warning.
- Full suite 65 tests green; `next build`, `tsc --noEmit`, and `eslint` all clean.

## Task Commits

1. **Task 1: participants + votes tables + migration (blocking schema gate)** - `ad20817` (feat)
2. **Task 2: submitResponse + buildEditUrl (TDD)** - `2501209` (test / RED), `e730b6f` (feat / GREEN)
3. **Task 3: AvailabilityGrid + VoteForm + vote view + /thanks** - `850c46f` (feat)

**Plan metadata:** _this commit_ (docs: complete plan)

## Files Created/Modified
- `src/lib/db/schema.ts` - added `participants`/`votes` tables + inferred type exports (additive; polls/options untouched)
- `drizzle/0001_lazy_odin.sql` (+ snapshot/journal) - generated migration, applied locally (production replay artifact for 02-02's deploy)
- `src/lib/actions/submit-response.ts` - INSERT-only submitResponse server action
- `src/lib/actions/submit-response.test.ts` - 13 DB-backed behavior tests
- `src/lib/urls.ts` - added `buildEditUrl`
- `src/components/availability-grid.tsx` (+ test) - 3-state grid client island
- `src/components/vote-form.tsx` - shared useActionState form
- `src/app/p/[participantUrlId]/page.tsx` (+ test) - live vote view (open/closed)
- `src/app/p/[participantUrlId]/thanks/page.tsx` - /thanks confirmation

## Decisions Made
- Kept `submitResponse` strictly INSERT-only (no `onConflictDoUpdate`) per the scope note — the return/edit upsert path is 02-02's `updateResponse`. No same-device cookie preload was added to the participant page (also 02-02).
- Added an optional `heading` prop to `VoteForm` (default "Your availability") so 02-02's edit route reuses the component verbatim with "Edit your availability".
- Email Zod chain ordered `.max(200).email()` so an over-length value surfaces the length message and an invalid short value surfaces the format message.

## Deviations from Plan

None - plan executed exactly as written. (No deviation rules triggered; all changes were the planned work. Two minor within-discretion additions — the `heading` prop and a bulk-action live-region announcement — are noted under Decisions.)

## Issues Encountered
- **Local Postgres appeared unreachable at start.** The Docker daemon was cold in this WSL session: `docker info` hung on the Server section and `localhost:5432` connections timed out, which initially looked like a hard environment block. It resolved once the `lfg-db-1` container spun up (a `docker start lfg-db-1` completed and queued pg probes then returned `TABLES: options, polls`). After that the migration applied cleanly and all DB-backed tests ran green. No code change was needed — it was a cold-start latency issue, not a missing dependency.
- Note: `psql` is not installed on the host and `docker exec` was slow to respond, so table/constraint verification was done via the project's `pg` driver (equivalent introspection: constraint, indexes, nullability, and FK delete rules all confirmed).

## User Setup Required
None - no external service configuration required. Local Docker Postgres (`lfg-db-1`) must be running for DB-backed tests. Production Neon migration + redeploy is deliberately deferred to the final task of 02-02 (prod is never left half-migrated mid-phase).

## Next Phase Readiness
- 02-02 can build the `/p/[participantUrlId]/edit/[editToken]` route + `updateResponse` upsert directly on this slice: `VoteForm` is already parameterized (action/initialVotes/readOnly/editToken/heading), `buildEditUrl` + the edit cookie are in place, and the `votes_participant_option_unique` constraint is ready for `onConflictDoUpdate({ target: [votes.participantId, votes.optionId] })`.
- The denormalized `votes(poll_id)` index is the seam Phase 3 results aggregation will read.
- Reminder for 02-02: apply the 0001 migration to Neon and redeploy as the final task.

## Self-Check: PASSED

All 11 declared files exist on disk; all 4 task commits (`ad20817`, `2501209`, `e730b6f`, `850c46f`) are present in git history.

---
*Phase: 02-participant-voting*
*Completed: 2026-07-01*

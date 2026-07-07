---
phase: 08-scheduling-controls
plan: 03
subsystem: api
tags: [drizzle, postgres, server-actions, react, next, zod, availability]

# Dependency graph
requires:
  - phase: 08-01
    provides: participants.is_organizer column + isVotingOpen helper (src/lib/poll-status.ts)
  - phase: 08-02
    provides: DEAD-01 deadline control + isVotingOpen at all vote gates
provides:
  - saveOrganizerAvailability server action (admin-token-authorized single-organizer-row upsert, isVotingOpen-gated, no email)
  - getOrganizerParticipant(pollId) read helper (the single is_organizer row's {id,name} or null)
  - getResultsForPoll now surfaces is_organizer per participant (computeResults unchanged)
  - results-grid flag-driven "(you)" suffix (both mobile + desktop layouts)
  - admin "Your availability" card (OrganizerAvailabilityControl island reusing AvailabilityGrid)
affects: [scheduling-controls, results, admin-page, phase-8-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Find-or-create single-row upsert enforced in the action (no DB partial-unique index) — mirrors the single-admin no-constraint participant precedent"
    - "Admin-token re-derivation for a self-participation write (organizer adds their own row without the participant link)"
    - "Presentation-only flag ('(you)') driven SOLELY by is_organizer, never inferred from a name string"

key-files:
  created:
    - src/lib/actions/save-organizer-availability.ts
    - src/lib/actions/save-organizer-availability.test.ts
    - src/components/organizer-availability-control.tsx
  modified:
    - src/lib/db/queries.ts
    - src/lib/results.ts
    - src/components/results-grid.tsx
    - src/app/a/[adminUrlId]/page.tsx
    - src/lib/db/queries.test.ts

key-decisions:
  - "At-most-one organizer row enforced by find-or-create upsert + isPending single-submit guard, no DB constraint (LOCKED 6 / edge-probe concurrency resolution)"
  - "Organizer row folds into getResultsForPoll/computeResults as a normal participant; the ONLY read change is selecting is_organizer (SC5)"
  - "Name defaults to 'You' when blank; no email is ever collected for the organizer row (LOCKED 6)"

patterns-established:
  - "Self-participation server action: re-derive poll from admin token, gate on isVotingOpen, upsert a flagged participant row + votes with one onConflictDoUpdate"
  - "Client island reuses AvailabilityGrid verbatim with a name-only wrapper (no email field) + collapsed/expanded add-edit-cancel form"

requirements-completed: [ORG-01]

coverage:
  - id: D1
    description: "saveOrganizerAvailability upserts a single is_organizer row + its votes under admin-token auth, gated by isVotingOpen, no email, no duplicate row"
    requirement: "ORG-01"
    verification:
      - kind: integration
        ref: "src/lib/actions/save-organizer-availability.test.ts (7 tests: first add, name override, foreign-id ignore, edit-upserts-same-row exactly-one, closed rejected, deadline-passed rejected, unknown-token notFound)"
        status: pass
    human_judgment: false
  - id: D2
    description: "getResultsForPoll surfaces is_organizer; results-grid renders a flag-driven '(you)' suffix; computeResults untouched so organizer votes fold into best-day"
    requirement: "ORG-01"
    verification:
      - kind: unit
        ref: "src/lib/db/queries.test.ts (participant shape now id/name/isOrganizer/votes; no-leak test still passes) + src/lib/results.test.ts (9 tests) + src/components/results-grid.test.tsx (27 tests)"
        status: pass
      - kind: automated
        ref: "npx tsc --noEmit && grep isOrganizer queries.ts results.ts && grep '(you)' results-grid.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Admin 'Your availability' card adds/edits the organizer row while voting is open and hides/read-only-locks once closed; saved row shows '(you)' in Results"
    requirement: "ORG-01"
    verification:
      - kind: automated
        ref: "npx tsc --noEmit + grep OrganizerAvailabilityControl page.tsx + grep AvailabilityGrid/useActionState in the control"
        status: pass
      - kind: automated_ui
        ref: "manual visual verification of the /a/[adminUrlId] card (add/edit/read-only/hidden states) — not yet run in a browser"
        status: unknown
    human_judgment: true
    rationale: "The card's visibility states and the '(you)' suffix rendering are visual/interaction behaviors best confirmed against a running admin page with real poll data (screenshot verify per project memory)."

# Metrics
duration: 25min
completed: 2026-07-07
status: complete
---

# Phase 8 Plan 03: Organizer's Own Availability Row (ORG-01) Summary

**The organizer can now add and edit their own availability row from the admin view — a single admin-token-authorized `is_organizer` participant that upserts (never duplicates), folds into the results grid and best-day tally like any other participant, and is labelled "(you)" from the flag alone.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-07T22:54:14Z
- **Tasks:** 3 of 3
- **Files created:** 3 · **Files modified:** 5

## Accomplishments
- New `saveOrganizerAvailability` action: re-derives the poll from the admin token, gates on `isVotingOpen`, find-or-creates the SINGLE `is_organizer=true` row (email null, minted editToken), and persists votes with one atomic `onConflictDoUpdate` — no email hook, no duplicate row.
- `getResultsForPoll` now surfaces `is_organizer` (coalesced to boolean) with the email/token no-leak discipline intact; `ResultsParticipant` gains an optional `isOrganizer` and `computeResults` is untouched (SC5), so the organizer's votes count toward best-day automatically.
- Admin "Your availability" card (`OrganizerAvailabilityControl`) reuses `AvailabilityGrid` verbatim, adds/edits while voting is open, and hides (no row) or read-only-locks (row exists) once voting closes — the editable grid never renders on a closed poll (UI Probe #1).

## Task Commits

1. **Task 1: saveOrganizerAvailability action + getOrganizerParticipant (TDD)** — `df8079d` (test, RED) → `efc6801` (feat, GREEN)
2. **Task 2: surface is_organizer through the results read + "(you)" suffix** — `4bb1af5` (feat)
3. **Task 3: admin "Your availability" card** — `643a36f` (feat)

_TDD Task 1: the RED commit's tests failed on a missing module; the GREEN commit made all 7 pass. No REFACTOR commit was needed._

## Files Created/Modified
- `src/lib/actions/save-organizer-availability.ts` — the ORG-01 upsert action (admin-token, isVotingOpen gate, single-row find-or-create, atomic votes upsert, no email hook).
- `src/lib/actions/save-organizer-availability.test.ts` — 7 DB-backed tests covering every `<behavior>` row, including the exactly-one-row-after-add-then-edit assertion and the no-write-on-closed/expired assertions.
- `src/components/organizer-availability-control.tsx` — admin-only client island: collapsed add/edit summary → inline form (name + AvailabilityGrid + Save/Cancel), allAnswered gate, read-only/hidden closed states.
- `src/lib/db/queries.ts` — added `getOrganizerParticipant(pollId)`; `getResultsForPoll` now selects `is_organizer` and sets `isOrganizer: r.isOrganizer ?? false` per participant.
- `src/lib/results.ts` — `ResultsParticipant` gains optional `isOrganizer` (computeResults unchanged).
- `src/components/results-grid.tsx` — flag-driven muted `" (you)"` suffix appended in both the mobile per-date cell and the desktop sticky row-header.
- `src/app/a/[adminUrlId]/page.tsx` — derives `organizerRow` (from the existing results read) + `votingOpen`, inserts `OrganizerAvailabilityControl` between the candidate-date echo and the Results Card.
- `src/lib/db/queries.test.ts` — updated the `getResultsForPoll` participant shape-contract test to the new authoritative `id/isOrganizer/name/votes` key set.

## Decisions Made
- Followed the plan as specified. At-most-one enforcement lives in the action's find-or-create (no DB partial-unique index this phase), matching the single-admin no-constraint participant precedent.

## Deviations from Plan

None — plan executed exactly as written.

The one adjustment worth noting is **not** a deviation from plan intent: Task 2 intentionally changed the shape of `getResultsForPoll` (adding `isOrganizer` per the plan's explicit action step), which broke a pre-existing structural shape-assertion test in `src/lib/db/queries.test.ts`. Updating that assertion to the new authoritative key set (`id/isOrganizer/name/votes`) is a direct consequence of the planned change, committed alongside Task 3. The sibling no-leak test (`email`/`editToken`/`adminUrlId` absent) still passes unchanged — `isOrganizer` introduces no leaked substring.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration and no new dependencies (reuses AvailabilityGrid + native inputs; threat register T-08-SC "npm installs" disposition: accept).

## Next Phase Readiness
- SC4 (organizer adds/edits their own row from the admin view) and SC5 (organizer row appears in the grid + best-day like any participant) are delivered and green under `npx tsc --noEmit` + the full 320-test suite.
- Remaining for phase verification: a browser visual pass of the "Your availability" card states (add / edit / read-only / hidden) and the "(you)" suffix against real poll data — flagged `human_judgment: true` (coverage D3), consistent with the project's screenshot-verify convention.
- Schema was already shipped in 08-01; no migration is introduced by this plan.

## Threat Flags
None — no new network endpoints, auth paths, file access, or schema changes beyond the threat register in the plan. The organizer row carries a null email (no new disclosure surface) and the write is admin-token-authorized (T-08-08..12 all mitigated as planned).

## Self-Check: PASSED

All created files present on disk; all task commits (`df8079d`, `efc6801`, `4bb1af5`, `643a36f`) present in git history. Full suite: 320/320 tests pass; `npx tsc --noEmit` clean; ESLint clean on all changed files.

---
*Phase: 08-scheduling-controls*
*Completed: 2026-07-07*

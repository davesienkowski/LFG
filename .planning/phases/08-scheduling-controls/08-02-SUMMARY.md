---
phase: 08-scheduling-controls
plan: 02
subsystem: scheduling
tags: [nextjs, server-actions, drizzle, rsc, datetime, timezone, zod]

# Dependency graph
requires:
  - phase: 08-01
    provides: "polls.deadline (nullable timestamptz) column + isVotingOpen(poll, now) pure helper"
provides:
  - "setDeadline server action: admin-token-authorized set/clear of an optional voting deadline with server-side future-only validation"
  - "isVotingOpen wired at every server-side vote gate (submitResponse, updateResponse)"
  - "Participant vote form read-only via isVotingOpen + distinct deadline-passed copy"
  - "Admin Voting deadline card (unset/future/passed) + mutually-exclusive Booked-xor-deadline-passed header pill"
affects: [08-03, organizer-availability, book-it]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Naive datetime-local wall-clock <-> UTC instant round-trip done ENTIRELY in the browser (client island) so voting never closes early/late by the server offset"
    - "TZ-derived render nodes carry suppressHydrationWarning instead of a mount effect (satisfies react-hooks/set-state-in-effect)"

key-files:
  created:
    - src/lib/actions/set-deadline.ts
    - src/lib/actions/set-deadline.test.ts
    - src/components/deadline-control.tsx
  modified:
    - src/lib/db/queries.ts
    - src/lib/actions/submit-response.ts
    - src/lib/actions/update-response.ts
    - src/app/p/[participantUrlId]/page.tsx
    - src/app/p/[participantUrlId]/edit/[editToken]/page.tsx
    - src/components/vote-form.tsx
    - src/app/a/[adminUrlId]/page.tsx

key-decisions:
  - "The deadline field posted to the server is `deadlineIso` (a browser-converted UTC ISO string); the visible datetime-local input is intentionally unnamed so its naive wall-clock value never reaches the server (LOCKED 5)."
  - "TZ-dependent values (input value, human status copy) are derived during render with suppressHydrationWarning rather than in a mount effect, because react-hooks/set-state-in-effect is an ESLint error in this repo."
  - "deadlinePassed is computed independently of isVotingOpen on the admin/participant pages (status open + deadline <= now) — isVotingOpen drives readOnly; deadlinePassed drives the distinct copy/pill."

patterns-established:
  - "Admin-token authorization spine reused from close-poll.ts: re-derive poll via getPollByAdminUrlId, notFound on miss, single UPDATE, redirect."
  - "Three-way closed-copy branch in VoteForm (booked / deadline-passed / generic) gated on server-computed booleans only."

requirements-completed: [DEAD-01]

coverage:
  - id: D1
    description: "setDeadline sets a future instant, rejects past/present/unparseable with a field error and no write, clears to null, and notFounds an unknown admin token — all under admin-token re-derivation, never touching status"
    requirement: "DEAD-01"
    verification:
      - kind: unit
        ref: "src/lib/actions/set-deadline.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "submitResponse and updateResponse reject a post-deadline vote server-side (isVotingOpen gate) with no write, even from a stale open form"
    requirement: "DEAD-01"
    verification:
      - kind: unit
        ref: "src/lib/actions/submit-response.test.ts / update-response.test.ts (deadline-passed rejection cases)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both participant routes render read-only via isVotingOpen with the distinct 'Voting has closed' deadline copy; only server-computed booleans cross the RSC boundary"
    requirement: "DEAD-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit + grep gate in 08-02-PLAN Task 2 <verify>"
        status: pass
      - kind: manual_procedural
        ref: "visual: open-but-expired poll shows 'Voting has closed' on /p and /p/.../edit"
        status: unknown
    human_judgment: true
    rationale: "The distinct participant-facing closed copy is a visual/UX assertion best confirmed by a human on a rendered page."
  - id: D4
    description: "Admin Voting deadline card (unset/future/passed states) renders only when !isClosed; header pill is Booked xor deadline-passed, never both"
    requirement: "DEAD-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit + grep gate in 08-02-PLAN Task 3 <verify>"
        status: pass
      - kind: manual_procedural
        ref: "visual: admin page pill mutual-exclusivity + datetime round-trip to local wall-clock"
        status: unknown
    human_judgment: true
    rationale: "Pill mutual-exclusivity and the local-wall-clock datetime round-trip are visual/interaction assertions needing a human on the rendered admin page."

# Metrics
duration: 35min
completed: 2026-07-07
status: complete
---

# Phase 8 Plan 02: Voting Deadline (DEAD-01) Summary

**An optional voting deadline that lazily closes a poll to further voting — derived at every gate via isVotingOpen (no cron, no status write on read), enforced server-side against stale forms, and kept strictly distinct from "Book it".**

## Performance

- **Duration:** ~35 min
- **Tasks:** 3 completed
- **Files modified:** 7 modified, 3 created

## Accomplishments
- `setDeadline` server action: admin-token re-derivation, single UPDATE, server-side strict future-only validation, clear-to-null, never touches `status` (a deadline never books nor reopens a poll).
- `isVotingOpen(poll, now)` wired at BOTH server vote gates (submitResponse, updateResponse) so a stale open form that POSTs after the deadline is rejected with no write (LOCKED 4).
- Participant view + edit routes derive `readOnly` from `isVotingOpen` and pass a distinct `deadlinePassed` boolean; VoteForm gained a three-way closed-copy branch (booked / "Voting has closed" / generic).
- Admin "Voting deadline" card (unset/future/passed states) + amber "Voting closed — deadline passed" header pill that is mutually exclusive with the emerald "Booked" pill by construction (if/else; card hidden when isClosed).
- Deadline round-trips as a timezone-independent INSTANT: the client island converts the organizer's naive datetime-local wall-clock to a UTC ISO string in the browser; only strings/booleans cross the RSC boundary (LOCKED 5).

## Task Commits

1. **Task 1 (RED): failing tests for setDeadline + gates** - `4ec046a` (test)
2. **Task 1 (GREEN): setDeadline action + isVotingOpen at every server gate** - `e24e018` (feat)
3. **Task 2: participant read-only + distinct deadline-passed copy** - `ef2b67e` (feat)
4. **Task 3: admin Voting deadline card + header pill** - `8703933` (feat)

_Task 1 is TDD (test → feat)._

## Files Created/Modified
- `src/lib/actions/set-deadline.ts` (created) - admin-token-authorized set/clear deadline action, future-only server validation, single UPDATE.
- `src/lib/actions/set-deadline.test.ts` (created) - DB-backed coverage: future save, past/unparseable no-write, clear, unknown-token notFound, closed-poll no-reopen.
- `src/components/deadline-control.tsx` (created) - admin-only client island; datetime-local <-> UTC-instant round-trip; Save/Update/Clear + FieldError.
- `src/lib/db/queries.ts` - select `polls.deadline` in getPollByParticipantUrlId (participant-safe) + getPollWithWinningOption.
- `src/lib/actions/submit-response.ts` / `update-response.ts` - gate on `!isVotingOpen(poll, new Date())`.
- `src/app/p/[participantUrlId]/page.tsx` / `.../edit/[editToken]/page.tsx` - server-derive readOnly/deadlinePassed booleans.
- `src/components/vote-form.tsx` - `deadlinePassed` prop + three-way closed-copy branch.
- `src/app/a/[adminUrlId]/page.tsx` - deadline card (when !isClosed) + mutually-exclusive header pill.

## Decisions Made
- Posted the browser-converted UTC ISO string as `deadlineIso`; left the visible datetime-local input unnamed so its naive value never reaches the server (honors LOCKED 5 + UI Probe #4 with the server as the sole validation boundary).
- Derived TZ-dependent render values during render with `suppressHydrationWarning` rather than a mount effect (see Deviations — Rule 3).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] datetime TZ conversion moved out of useEffect to satisfy `react-hooks/set-state-in-effect`**
- **Found during:** Task 3 (deadline-control island)
- **Issue:** The plan's suggested approach (seed input value / status copy from a mount `useEffect`) trips the repo's ESLint rule `react-hooks/set-state-in-effect`, which is an ERROR (blocks the build/lint gate). Setting state synchronously in an effect is disallowed here.
- **Fix:** Compute the browser-local input value and human status copy directly during render (lazy `useState` initializer for the controlled input value + `min`; plain derivation for the status copy), and mark the two TZ-dependent nodes with `suppressHydrationWarning` so the TZ-less server render never triggers a mismatch. No effect is used. This preserves the LOCKED-5 no-raw-Date contract and the correct browser-TZ round-trip.
- **Files modified:** src/components/deadline-control.tsx
- **Verification:** `npx eslint src/components/deadline-control.tsx` → "No issues found"; `npx tsc --noEmit` clean; `next build` 0 errors.
- **Committed in:** `8703933` (part of Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1× Rule 3)
**Impact on plan:** The visible markup, states, and copy match the UI-SPEC verbatim; only the internal mechanism for TZ derivation changed to pass the repo lint gate. No scope creep.

## Issues Encountered
None beyond the deviation above.

## User Setup Required
None - no external service configuration required. (The `polls.deadline` column shipped in 08-01; migration 0006 is already applied locally. Production deploy still needs the standard backup → `db:migrate` → deploy gate when 08 ships to prod.)

## Verification Summary
- `npx tsc --noEmit` — clean.
- `npx eslint` on all changed files — no issues.
- Full suite: `DATABASE_URL=... npx vitest run` → PASS 313 / FAIL 0 (includes the new set-deadline + deadline-passed rejection cases).
- `next build` — 0 errors, 0 warnings (RSC→client boundary compiles; only strings/booleans cross).

## Self-Check: PASSED
- All created files present (set-deadline.ts, set-deadline.test.ts, deadline-control.tsx, 08-02-SUMMARY.md).
- All task commits present in git history (4ec046a, e24e018, ef2b67e, 8703933).

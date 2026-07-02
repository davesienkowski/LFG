---
phase: 05-vote-grid-redesign-matrix-1c
plan: 04
subsystem: ui
tags: [poll-create, calendar-date-picker, card, sticky-footer, tailwind, react, mobile]

# Dependency graph
requires:
  - phase: 05-03-participant-surface-reconciliation
    provides: "The mobile `sticky bottom-0` pinned-footer pattern (D-03) this plan mirrors for the Create poll action"
  - phase: 01-poll-creation-flow
    provides: "The shipped createPoll Server Action, PollCreateForm, CalendarDatePicker, and root create page this plan reconciles"
provides:
  - "PollCreateForm + root create page reconciled to board 3a / 3a-m (desktop card frame + mobile sticky Create poll footer)"
  - "CalendarDatePicker reconciled to board 3a's right pane (pane gap + per-row time-input width)"
affects: [05-05, poll-creation-surface, D-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Responsive card frame: bordered/rounded/shadow card chrome applied only at `sm:` so the mobile view stays full-bleed for a sticky footer"
    - "Mobile-only `sticky bottom-0` pinned Create-poll footer that reverts to static inline flow at `sm:` (mirrors 05-03 D-03)"

key-files:
  created: []
  modified:
    - src/app/page.tsx
    - src/components/poll-create-form.tsx
    - src/components/calendar-date-picker.tsx

key-decisions:
  - "Added the board-3a card frame as `sm:`-only utilities on a plain wrapper div (not the shadcn `<Card>` component) — `<Card>` carries `overflow-hidden` which would clip the mobile `-mx-4` sticky footer bleed; utility-only chrome keeps mobile full-bleed while matching 3a on desktop"
  - "Reused the exact 05-03 sticky-footer recipe (`sticky bottom-0 z-10 -mx-4 border-t bg-background px-4 py-4 sm:static ...`) for the Create poll action so the create and vote surfaces pin identically (D-03/D-09)"
  - "Kept the shipped default `Button` sizing for Create poll (consistent with the vote-screen submit) rather than forcing the mock's literal 44px height — no new size utility, cross-surface consistency"
  - "Used only existing utilities/primitives — no new token, utility, @layer rule, font, animation, dark-mode branch, or date library"

patterns-established:
  - "Pattern: reconcile a single-card create surface by applying card chrome at `sm:` only, leaving mobile full-bleed so a sticky pinned footer can bleed to the page edges"

requirements-completed: []

coverage:
  - id: D1
    description: "PollCreateForm + root page match board 3a/3a-m — Create-a-poll Display title, required Poll title, Description, Location, Candidate dates section, Create poll button; desktop card frame; mobile stacks the panes and pins Create poll; createPoll action wiring + hidden serialized dates field unchanged"
    verification:
      - kind: automated_ui
        ref: "grep: poll-create-form.tsx retains action={formAction}, hidden input name=\"dates\", createPoll import; npm run build typecheck pass; npm run lint clean on touched files"
        status: pass
      - kind: manual_procedural
        ref: "Compare `/` desktop + narrow against boards 3a/3a-m — title, field order, and the pinned Create poll action on mobile"
        status: unknown
    human_judgment: true
    rationale: "The card-frame vs full-bleed responsive swap and the mobile pinned-footer scroll behavior are pixel/interaction checks automation cannot fully assert; needs an eyes-on pass against 3a/3a-m."
  - id: D2
    description: "CalendarDatePicker matches board 3a right pane — mode=\"multiple\" with past days disabled, Default start time + Apply to all, chronologically sorted Selected-dates list with per-row time + remove; client-island + serialize seam and timezone-safe date-only handling preserved"
    verification:
      - kind: automated_ui
        ref: "grep: mode=\"multiple\" present; no new `new Date(` on a date-only value (the only two are the shipped local-midnight pastBoundary); npm run build pass; npx eslint clean"
        status: pass
      - kind: integration
        ref: "src/lib/date-input.test.ts + src/lib/actions/create-poll.test.ts green (serialize seam + action unchanged)"
        status: pass
      - kind: manual_procedural
        ref: "On `/`, select several dates across month boundaries; confirm calendar, Default start time + Apply to all, and the sorted selected-list with per-row time + remove match 3a; no off-by-one"
        status: unknown
    human_judgment: true
    rationale: "Multi-select interaction and same-calendar-day rendering (no timezone off-by-one) are a runtime/pixel check best confirmed eyes-on against board 3a."

# Metrics
duration: 15min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 04: Poll-Creation Surface Reconciliation (board 3a / 3a-m, D-09) Summary

**PollCreateForm + root create page framed in a `sm:`-only board-3a card with a mobile `sticky` pinned Create poll footer, and CalendarDatePicker's right pane nudged to board-3a spacing — all visual-only: the createPoll Server Action, hidden serialized dates field, and timezone-safe date-only handling are untouched.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-07-02
- **Tasks:** 2 (both visual reconciliation)
- **Files modified:** 3

## Accomplishments
- **Board 3a (desktop):** the root create page now frames the "Create a poll" Display title + form in a bordered card (`sm:rounded-2xl sm:border sm:bg-card sm:px-11 sm:py-10 sm:shadow-sm`) — matching the mock's single outer card — while staying full-bleed below `sm:`.
- **Board 3a-m (mobile):** the `Create poll` action is now a `sticky bottom-0` pinned footer (edge-bled with `-mx-4`, `border-t`, solid bg) that reverts to the shipped static inline flow at `sm:`, so a long candidate-date list never buries it. The two calendar panes already stack on mobile (shipped `flex-col ... lg:flex-row`), satisfying "stacks the two panes and pins Create poll".
- **CalendarDatePicker (board 3a right pane):** tightened the two-pane gap to 24px (`lg:gap-6`) and the per-row time input to ~110px (`w-28`) to match the mock; `mode="multiple"`, past-day disabling, Default start time + Apply to all, and the sorted Selected-dates list with per-row time + remove are otherwise verbatim.
- **Behavior preserved verbatim:** `<form action={formAction}>`, the hidden `<input name="dates">` serialized payload, Zod-validated field wiring, the redirect to `/a/[adminUrlId]`, and the timezone-safe `toLocalDateString`/`formatDateOnly` handling (no new `new Date()` on a date-only value) are all unchanged (T-05-09 mitigation held).

## Task Commits

1. **Task 1: reconcile PollCreateForm + root page to board 3a/3a-m** - `675b0f1` (feat)
2. **Task 2: reconcile CalendarDatePicker to board 3a** - `1e98d47` (feat)

**Plan metadata:** (final docs commit — this SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `src/app/page.tsx` - Wrapped the title + form in a `sm:`-only card frame (rounded-2xl/border/bg-card/px-11 py-10/shadow-sm); mobile stays full-bleed. Updated the shell comment.
- `src/components/poll-create-form.tsx` - Wrapped the Create poll submit `Button` in a mobile `sticky bottom-0` pinned footer (`-mx-4 border-t bg-background px-4 py-4`) that resets to static at `sm:`; form/action/hidden-field wiring unchanged.
- `src/components/calendar-date-picker.tsx` - `lg:gap-8` → `lg:gap-6` (two-pane gap) and per-row time input `w-32` → `w-28`; nothing else changed.

## Per-file drift record (plan artifacts_produced)
- `src/app/page.tsx` — **drift fixed**: added the board-3a card frame (desktop) + responsive full-bleed (mobile). No new symbol/export.
- `src/components/poll-create-form.tsx` — **drift fixed**: added the board-3a-m mobile sticky Create-poll footer wrapper. Form structure/action unchanged.
- `src/components/calendar-date-picker.tsx` — **drift fixed (minor)**: pane gap + per-row time-input width nudged to board-3a values. Everything else — **no drift** (mode/past-disable/Default-time/Apply-to-all/sorted list/remove already match).

## Decisions Made
- Applied the card chrome as `sm:`-only utilities on a plain wrapper `<div>` rather than the shadcn `<Card>` component — `<Card>`'s `overflow-hidden` would clip the mobile `-mx-4` sticky-footer edge-bleed. Utility-only chrome matches 3a on desktop and keeps mobile full-bleed.
- Reused the exact 05-03 sticky-footer recipe so the create and vote surfaces pin identically (D-03/D-09).
- Kept the shipped default `Button` size for Create poll (consistent with the vote-screen submit) instead of forcing the mock's literal 44px — cross-surface consistency, no new size utility.

## Deviations from Plan
None - plan executed exactly as written. Both tasks were visual reconciliation with no structural or behavior change.

## Issues Encountered
- `npm run build` initially failed with `DATABASE_URL is not set` (pre-existing: the `event.ics` route imports the DB client at module load and `.env.local` carries no exported `DATABASE_URL` for the build shell). Resolved by exporting the local Docker Postgres URL (`postgres://postgres:password@localhost:5432/lfg`, container `lfg-db-1`) for the build/test run — an environment concern, not a code issue, out of scope for this plan. TypeScript compiled clean regardless.
- Lint reports issues only in `design_handoff_vote_grid_redesign/designs/support.js` (the vendored design-reference runtime) — pre-existing and out of scope; the three touched source files lint clean (`npx eslint` exit 0).

## Verification
- `npm run build` typechecks + builds clean (with `DATABASE_URL` exported); route table intact.
- `npx eslint` on all three touched files: no issues (exit 0).
- Full `npx vitest run`: 176 passed, 0 failed (incl. create-poll action + date-input serialize).
- Grep: `action={formAction}` + hidden `name="dates"` + `createPoll` import present in poll-create-form.tsx; `mode="multiple"` present in calendar-date-picker.tsx; the only `new Date(` occurrences are the shipped local-midnight `pastBoundary` (built from local components, not a date-only value).

## Next Phase Readiness
- The poll-creation surface (boards 3a / 3a-m) is reconciled; D-09 for the create surface is done.
- Remaining phase-5 work: 05-05 (email templates + any final surfaces / D-10 calendar-button color).
- End-of-phase human checks outstanding: eyes-on `/` at desktop + narrow against boards 3a/3a-m (card frame, field order, pinned mobile Create poll), and a multi-month date selection with no off-by-one.

## Self-Check: PASSED
- FOUND: 05-04-SUMMARY.md
- FOUND: src/app/page.tsx, src/components/poll-create-form.tsx, src/components/calendar-date-picker.tsx
- FOUND: commit 675b0f1 (Task 1), commit 1e98d47 (Task 2)

---
*Phase: 05-vote-grid-redesign-matrix-1c*
*Completed: 2026-07-02*

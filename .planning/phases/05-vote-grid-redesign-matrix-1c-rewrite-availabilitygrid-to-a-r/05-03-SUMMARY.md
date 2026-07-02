---
phase: 05-vote-grid-redesign-matrix-1c
plan: 03
subsystem: ui
tags: [vote-form, participant-pages, sticky-footer, tailwind, react, mobile]

# Dependency graph
requires:
  - phase: 05-01-availability-grid-rewrite
    provides: "AvailabilityGrid radio-matrix with an UNCHANGED public contract (disabled/onChange/initial/GridOption/VoteState + internal bulk row and read-only chips)"
  - phase: 02-participant-vote-flow
    provides: "The shipped VoteForm + participant vote/thanks/edit pages this plan reconciles"
provides:
  - "Mobile sticky/pinned submit + closed-banner footer in vote-form.tsx (D-03 form half)"
  - "Confirmation that the participant vote (2a-2c), thanks (3b), and edit (3c) pages already match the mocks (no drift)"
affects: [05-04, 05-05, participant-surfaces, D-03, D-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mobile-only `sticky bottom-0` pinned footer that reverts to static flow at `sm:` — content scrolls, primary action stays visible (D-03)"
    - "`-mx-4 px-4` edge-bleed so the pinned bar spans to the page edges (parent `main` carries `px-4`)"

key-files:
  created: []
  modified:
    - src/components/vote-form.tsx

key-decisions:
  - "Implemented D-03 with `position: sticky` (Tailwind `sticky bottom-0 z-10`) rather than a fixed footer — keeps the action in document flow, avoids overlap math, and cleanly reverts to the shipped static layout at `sm:`"
  - "Used only existing utilities (sticky/bottom-0/z-10/-mx-4/px-4/py-4/border-t/bg-background/bg-muted) — no new token, utility, animation, font, or dark-mode branch"
  - "Left the CopyLinkButton aria-label 'Copy edit link' unchanged — visible text is already 'Copy link' (matches mock 3b) and page.test.ts asserts the aria-label"

patterns-established:
  - "Pattern: primary-action block styled per-viewport — mobile pinned footer (border-t + solid bg + edge-bleed), desktop static — via `sm:` resets on the same element"

requirements-completed: []

coverage:
  - id: D1
    description: "Mobile sticky/pinned submit button (open poll) and closed banner (readOnly) stay visible over a long date list; desktop 2a-2c unchanged; AvailabilityGrid mount contract + hidden votes seam + readOnly submit-omission preserved"
    verification:
      - kind: automated_ui
        ref: "grep: vote-form.tsx retains name=\"votes\", sticky, bg-muted, disabled={isPending || readOnly}, onChange={setVotes}; npm run build (typecheck) pass"
        status: pass
      - kind: manual_procedural
        ref: "Narrow viewport with many candidate dates — submit/banner pinned while the list scrolls (mocks 2d/2e)"
        status: unknown
    human_judgment: true
    rationale: "Sticky-footer visual/scroll behavior on a narrow viewport is a pixel/interaction check that automation cannot fully assert; needs an eyes-on pass against boards 2d/2e."
  - id: D2
    description: "Participant vote (2a-2c), thanks (3b), and edit (3c) pages match the mocks — amber bearer-credential warning + Copy link on thanks, 'Edit your availability'/'Save changes' on edit, no admin /a/ URL leak (SEC/D-10)"
    requirement: ""
    verification:
      - kind: integration
        ref: "src/app/p/[participantUrlId]/page.test.ts (10) + src/app/p/[participantUrlId]/edit/[editToken]/page.test.ts (5) — 15 passed"
        status: pass
      - kind: automated_ui
        ref: "grep: EDIT_OK (Edit your availability + Save changes), THANKS_OK (warning + CopyLinkButton), NO_ADMIN_LEAK (no /a/ on the three pages)"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 03: Participant-Surface Reconciliation (D-03 sticky submit + D-09 visual) Summary

**Mobile `position: sticky` pinned submit/closed-banner footer added to vote-form.tsx (D-03); the three participant pages (vote 2a-2c, thanks 3b, edit 3c) verified already-matching the mocks with the AvailabilityGrid contract untouched.**

## Performance

- **Duration:** ~18 min
- **Completed:** 2026-07-02
- **Tasks:** 2 (1 code change, 1 no-drift verification)
- **Files modified:** 1

## Accomplishments
- D-03 (form half): the primary-action block — submit `Button` when open, the "Voting is closed" `bg-muted` banner when readOnly — is now a `sticky bottom-0` pinned footer on mobile (edge-bled with `-mx-4 px-4`, `border-t`, solid bg), reverting to the shipped static flow at `sm:`, so a long date list never buries the action (mocks 2d/2e).
- The AvailabilityGrid mount contract is preserved verbatim: `disabled={isPending || readOnly}`, `onChange={setVotes}`, `initial={initialVotes}`, and the hidden `<input name="votes">` serialization seam are all unchanged; readOnly still OMITS the submit button (not disabled).
- D-09 verification: the participant vote page (2a-2c), thanks page (3b, amber bearer-credential warning + `Copy link`), and edit page (3c, "Edit your availability" / "Save changes", prefilled) already conform to the mocks — no drift to fix. SEC/D-10 confirmed: no admin `/a/` URL is constructed or rendered on any of the three pages.

## Task Commits

1. **Task 1: vote-form.tsx sticky mobile submit/banner (D-03)** - `098a5bc` (feat)
2. **Task 2: reconcile vote/thanks/edit pages (2a-2c, 3b, 3c)** - no commit — all three pages already match the mocks (no drift); verified via tests + grep only.

**Plan metadata:** (final docs commit — this SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `src/components/vote-form.tsx` - Wrapped the submit/closed-banner block in a mobile `sticky bottom-0` pinned footer (`-mx-4 px-4 border-t bg-background`/`bg-muted`) that resets to static at `sm:`; contract and copy otherwise unchanged.

## Per-file drift record (plan artifacts_produced)
- `src/components/vote-form.tsx` — **drift fixed**: added the D-03 mobile sticky footer wrapper (new responsive positioning, no new symbol/export).
- `src/app/p/[participantUrlId]/page.tsx` — **no drift**: shell matches 2a-2c anatomy; `readOnly={poll.status !== "open"}` threading preserved.
- `src/app/p/[participantUrlId]/thanks/page.tsx` — **no drift**: matches 3b (amber warning, mono link, `Copy link` control, "No email was sent — save this link now").
- `src/app/p/[participantUrlId]/edit/[editToken]/page.tsx` — **no drift**: matches 3c ("Edit your availability" heading, "Save changes" submit, values prefilled).

## Decisions Made
- Chose `position: sticky` over a fixed footer for D-03 (keeps the action in normal flow, avoids overlap/padding compensation, trivially reverts at `sm:`).
- Edge-bleed the pinned bar with `-mx-4 px-4` to reach the page edges since the parent `main` carries `px-4` — matches the mock's full-width pinned footer.
- Kept the CopyLinkButton aria-label `"Copy edit link"` (visible text is already `"Copy link"`, matching mock 3b; the shipped test asserts the aria-label).

## Deviations from Plan
None - plan executed exactly as written. Task 2 legitimately produced no code changes: the three participant pages were already built to the shipped structure the mocks target, so no drift existed to reconcile (an outcome the plan explicitly anticipates via its "no drift" record).

## Issues Encountered
- `npm run build` initially failed with `DATABASE_URL is not set` (pre-existing: the `event.ics` route imports the DB client at module load, and `.env.local` carries no `DATABASE_URL`). Resolved by exporting the local Docker Postgres URL (`postgres://postgres:password@localhost:5432/lfg`, container `lfg-db-1`) for the build/test run — an environment concern, not a code issue, and out of scope for this plan.
- Lint reports issues only in `design_handoff_vote_grid_redesign/designs/support.js` (the vendored design-reference runtime) — pre-existing and out of scope; `vote-form.tsx` lints clean.

## Verification
- `npm run build` typechecks clean (with `DATABASE_URL` exported).
- Full `npx vitest run`: 176 passed, 0 failed (incl. participant vote page 10 + edit page 5).
- Grep: `name="votes"`, `sticky`, `bg-muted`, `disabled={isPending || readOnly}`, `onChange={setVotes}` all present in vote-form.tsx; `Edit your availability` + `Save changes` on the edit page; amber warning + CopyLinkButton on thanks; no `/a/` admin URL on any of the three participant pages.

## Next Phase Readiness
- D-03 form half done; D-03 is fully satisfied in combination with the grid's mobile segments (05-01).
- Participant surfaces conform to boards 2a-2e / 3b / 3c. Remaining phase-5 work (05-04, 05-05) covers the admin/results and email surfaces.
- End-of-phase human check outstanding: eyes-on the mobile sticky submit/banner over a long date list (2d/2e).

## Self-Check: PASSED
- FOUND: 05-03-SUMMARY.md
- FOUND: src/components/vote-form.tsx
- FOUND: commit 098a5bc (feat(05-03): sticky mobile submit/banner)

---
*Phase: 05-vote-grid-redesign-matrix-1c*
*Completed: 2026-07-02*

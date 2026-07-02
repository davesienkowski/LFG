---
phase: 05-vote-grid-redesign-matrix-1c
plan: 02
subsystem: ui
tags: [tailwind, shadcn, results-grid, admin, react-19, next16]

# Dependency graph
requires:
  - phase: 05-01
    provides: "AvailabilityGrid Matrix (1c) rewrite — the shared vote-state visual language (STATE_META palette, emerald/amber/muted chips, best-day emerald-100/800 + 'Best' badge) this plan aligns the admin surface to"
provides:
  - "ResultsGrid reconciled to board 3d — table now sits in a rounded-xl bordered card container; filter selects widened to the mock's 180px/140px targets"
  - "Confirmation that the admin shell, InviteByEmailForm, and BookItControl already match boards 3d/3e (no-drift) with two-step finalize + closed-poll hiding intact"
affects: [05-03, 05-04, 05-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pixel-target reconciliation (D-09): diff shipped Tailwind classes against the HTML mock and adjust ONLY drifting utilities — no structural rewrite, no new token/utility/font/animation"

key-files:
  created: []
  modified:
    - "src/components/results-grid.tsx — rounded-xl border container + filter select min-widths"

key-decisions:
  - "Kept the shipped semantic <table> + SCROLL_FADE_STYLE (did NOT convert to the mock's CSS-grid) — the table is the shipped, tested, sticky-column pattern and D-09 forbids structural rewrites; only added the bordered-card wrapper the mock shows around it"
  - "admin page, InviteByEmailForm, BookItControl: recorded as no-drift — shipped classes/copy already match boards 3d/3e verbatim; made zero edits to avoid regression risk"

patterns-established:
  - "No-drift is a valid task outcome: when a shipped surface already matches the mock, leave it unchanged and document rather than fabricate edits"

requirements-completed: []

coverage:
  - id: D1
    description: "ResultsGrid matches board 3d — bordered rounded card container, best-day emerald tint + 'Best' badge + 'N yes · N if-need-be' tallies, Date/Status filter + Clear, horizontal scroll-edge fade"
    verification:
      - kind: unit
        ref: "src/components/results-grid.test.tsx (13 tests)"
        status: pass
      - kind: automated_ui
        ref: "npm run build — TypeScript clean, static generation 4/4"
        status: pass
    human_judgment: true
    rationale: "Pixel fidelity to boards 3d/3e (tint alignment, card border, select widths) is a visual judgment the shipped tests do not assert; end-of-phase human check against the mock required"
  - id: D2
    description: "Admin shell (3d/3e): Share cards with amber 'Keep private' badge, emerald 'Booked' pill + 'Poll finalized' card when closed, Invite/Book-it hidden when finalized, Results always visible"
    verification:
      - kind: automated_ui
        ref: "npm run build — /a/[adminUrlId] compiles and collects page data"
        status: pass
    human_judgment: true
    rationale: "Open-vs-finalized visual gating is verified structurally in code but final look must be human-checked against 3d/3e"
  - id: D3
    description: "InviteByEmailForm per-recipient chips (Sent/Rate limited/Failed) render icon AND text; BookItControl two-step confirm preserved (Book this date type=button reveal-only; Confirm and close poll the sole type=submit)"
    verification:
      - kind: unit
        ref: "src/components/book-it-control.test.tsx (4 tests)"
        status: pass
    human_judgment: false

# Metrics
duration: 12min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 2: Admin/Results Surface Reconciliation Summary

**ResultsGrid reconciled to board 3d's bordered-card layout; admin shell, invite form, and two-step Book-it confirm verified as already-matching (no-drift), with all shipped admin behavior intact.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-02
- **Completed:** 2026-07-02
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Wrapped the ResultsGrid table in a `rounded-xl border` card container to match board 3d's bordered results card (was a bare table); kept the shipped `SCROLL_FADE_STYLE` / `overflow-x-auto` scroll-edge fade unchanged.
- Widened the Date/Status filter selects to the mock's `min-w-[180px]` / `min-w-[140px]` targets.
- Verified (no-drift, zero edits) that the best-day emerald-100/800 tint + literal "Best" badge, `N yes · N if-need-be` tallies, admin "Keep private" amber badge, "Booked" pill, "Poll finalized" emerald card, closed-poll hiding of Invite/Book-it, per-recipient icon+text invite chips, and the BookItControl two-step confirm all already match boards 3d/3e verbatim.
- Full suite green (176 tests); `npm run build` typechecks clean and completes static generation.

## Task Commits

1. **Task 1: Reconcile ResultsGrid + admin page shell to boards 3d/3e** - `c942e69` (style) — results-grid.tsx bordered card + select widths; admin page: no drift.
2. **Task 2: Reconcile InviteByEmailForm + BookItControl to board 3d** - no commit (no-drift: both components already match the mock; editing would only risk regression).

**Plan metadata:** (final docs commit)

## Files Created/Modified
- `src/components/results-grid.tsx` - Added `rounded-xl border` container around the scroll wrapper; added `min-w-[180px]`/`min-w-[140px]` to the two filter selects.

## Decisions Made
- Preserved the shipped semantic `<table>` + `SCROLL_FADE_STYLE` rather than porting the mock's CSS-grid markup. The table is the shipped, tested, sticky-first-column pattern and D-09 explicitly forbids structural rewrites; the only genuine drift was the missing bordered-card wrapper, which was added non-invasively.
- Treated the admin page, InviteByEmailForm, and BookItControl as no-drift. Their shipped Tailwind classes and copy already match boards 3d/3e (Keep-private amber badge, Booked pill, Poll-finalized card, closed-poll hiding, icon+text chips, two-step confirm with a single `type="submit"`). Per the plan's "leave unchanged and record no drift" guidance, no edits were made.

## Deviations from Plan
None - plan executed exactly as written. Task 2 correctly resolved to a no-drift outcome (an explicitly sanctioned result), so it produced no code change or commit.

## Issues Encountered
- `npm run build` initially failed with "DATABASE_URL is not set" during page-data collection of the `event.ics` route. This is a local env condition, not a code fault — TypeScript compilation succeeded before the failure. `DATABASE_URL` lives in `.env.vercel.local` (not `.env.local`); sourcing it let the build complete cleanly. No code change required.
- `npm run lint` reports 2 errors / 8 warnings, all confined to `design_handoff_vote_grid_redesign/designs/support.js` — the untracked design-prototype bundle, not app source. The edited `results-grid.tsx` lints clean (0 issues). Out of scope; logged, not fixed.

## Threat surface
No new security surface. Security-relevant invariants verified preserved (SEC/D-10): the admin "Keep private" warning stays on the admin-link card; the Book-it two-step confirm keeps exactly one `type="submit"` (`Confirm and close poll`) while `Book this date` stays `type="button"` (reveal-only); Invite/Book-it remain admin-gated and hidden when finalized. No admin `/a/` URL added to any shared/participant surface.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Admin/results surface (3d/3e) reconciled and verified. Remaining phase-05 plans (05-03..05-05) cover the other mock boards (create/thanks/edit, emails).
- No blockers.

## Self-Check: PASSED
- FOUND: 05-02-SUMMARY.md
- FOUND: commit c942e69 (Task 1)

---
*Phase: 05-vote-grid-redesign-matrix-1c*
*Completed: 2026-07-02*

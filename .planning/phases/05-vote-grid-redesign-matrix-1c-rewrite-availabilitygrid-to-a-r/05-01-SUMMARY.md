---
phase: 05-vote-grid-redesign-matrix-1c
plan: 01
subsystem: ui
tags: [react, tailwind, availability-grid, wcag, radiogroup, accessibility, vote-grid]

# Dependency graph
requires:
  - phase: 02-vote-capture
    provides: AvailabilityGrid click-to-cycle grid, never-blank default, bulk actions, aria-live region, onChange serialize contract
  - phase: 03-results-dashboard
    provides: STATE_META shared vote vocabulary (@/lib/vote-state), ResultsGrid layout/tint/cn() analog
provides:
  - AvailabilityGrid rewritten as a role=radiogroup/radio Matrix (1c) — desktop icon-only cells under labelled column headers + mobile stacked icon+text segments + read-only chips
  - selectCell(opt, next) direct-selection setter replacing cycleCell/CYCLE
  - data-testid layer hooks (matrix-desktop / segments-mobile) for layer-scoped a11y tests
  - Rewritten availability-grid.test.tsx with radio semantics + desktop-header-association + mobile-segmented-fallback a11y tests
affects: [05-03-vote-form-reconciliation, 05-vote-screen-visual-reconciliation, vote-form, participant-pages]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual-layout responsive component: two sibling layers (hidden sm:block / sm:hidden) both in DOM, display:none isolates ONE layer to the a11y tree (EDGE-A11Y-EXCL)"
    - "WCAG radiogroup/radio matrix built on plain focusable <button>s (no roving-tabindex) — column-header carries the text label for icon-only desktop cells"

key-files:
  created: []
  modified:
    - src/components/availability-grid.tsx
    - src/components/availability-grid.test.tsx

key-decisions:
  - "AvailabilityGrid is a role=radiogroup/radio matrix (D-01) — click-to-cycle removed entirely"
  - "Desktop cells are icon-only; a11y satisfied at the column-header level with per-radio aria-label='{date}: {state}' (D-02/D-06)"
  - "Mobile collapses to stacked full-width icon+text segments — no icon-only cell at mobile width (D-03)"
  - "Both layouts render into the DOM; display:none removes the hidden layer from the a11y tree so AT sees exactly one radiogroup per date (EDGE-A11Y-EXCL)"
  - "STATE_META palette/labels/icons reused verbatim from @/lib/vote-state; no new token/utility/font/animation (D-07)"

patterns-established:
  - "Dual-layout a11y-exclusion: sibling responsive layers isolated by display:none so only one is exposed to assistive tech"
  - "Icon-only cell + labelled-column a11y contract: cell inherits meaning from its column header, backed by an explicit per-cell aria-label"

requirements-completed: []

coverage:
  - id: D1
    description: "AvailabilityGrid renders as a radio matrix — each date row is a role=radiogroup of three role=radio cells, exactly one aria-checked; click-to-cycle removed (D-01)"
    verification:
      - kind: unit
        ref: "src/components/availability-grid.test.tsx#defaults every untouched row to Not available (never-blank, D-04)"
        status: pass
      - kind: unit
        ref: "src/components/availability-grid.test.tsx#Set all Available checks every yes radio; a single direct override changes only that row"
        status: pass
    human_judgment: false
  - id: D2
    description: "Never-blank default (D-04) + idempotent re-selection (EDGE-IDEMPOTENT) — every untouched row is 'no'; re-clicking a checked radio never blanks the row"
    verification:
      - kind: unit
        ref: "src/components/availability-grid.test.tsx#re-selecting the already-checked state stays selected (never blanks, EDGE-IDEMPOTENT)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Desktop column-header association (D-02/D-06) — icon-only radio cells carry aria-label suffix equal to a labelled column header"
    verification:
      - kind: unit
        ref: "src/components/availability-grid.test.tsx#associates each icon-only desktop radio with a labelled column header"
        status: pass
    human_judgment: false
  - id: D4
    description: "Mobile segmented fallback (D-03/D-06) — every mobile segment carries both an icon and visible text; no icon-only cell exists at mobile width"
    verification:
      - kind: unit
        ref: "src/components/availability-grid.test.tsx#renders mobile segments with BOTH an icon and visible text (no icon-only cell)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Preserved contract — bulk actions + Clear reset, closed read-only chips (no radios/bulk row), onChange serialized payload, disabled/onChange/GridOption/VoteState public contract intact (D-05)"
    verification:
      - kind: unit
        ref: "src/components/availability-grid.test.tsx#renders read-only chips with no radios and no bulk actions when disabled"
        status: pass
      - kind: unit
        ref: "src/components/availability-grid.test.tsx#emits the serialized votes for every option via onChange"
        status: pass
      - kind: integration
        ref: "npm run build (TypeScript typecheck — vote-form.tsx + participant pages still resolve disabled/onChange/GridOption/VoteState)"
        status: pass
    human_judgment: false
  - id: D6
    description: "End-of-phase visual/AT check — desktop icon-only matrix with labelled headers, mobile stacked icon+text segments, exactly one radiogroup announced per date, closed poll read-only chips (mock states 2a–2e)"
    verification: []
    human_judgment: true
    rationale: "Pixel/visual fidelity against mocks 2a–2e and single-radiogroup screen-reader announcement require human/AT judgment beyond jsdom unit assertions"

# Metrics
duration: 15min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 01: AvailabilityGrid Radio Matrix (1c) Summary

**AvailabilityGrid rewritten from a click-to-cycle button into a WCAG role=radiogroup/radio Matrix — desktop icon-only cells under labelled column headers, mobile stacked icon+text segments, both layers in the DOM with display:none a11y isolation, preserving the never-blank/bulk/read-only/onChange contract verbatim.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-02T21:19Z (approx)
- **Completed:** 2026-07-02T21:25Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the single click-to-cycle `<button>` + `CYCLE` walk with a direct `selectCell(opt, next)` setter that writes exactly one state per row (no cycling, idempotent re-selection).
- Built the desktop matrix: persistent labelled column headers (`grid-cols-[1.6fr_1fr_1fr_1fr]`, empty label cell + three icon+text state headers) over per-date `role="radiogroup"` rows of three icon-only 44px `role="radio"` cells; selected cell carries the STATE_META tint + icon, unselected is an empty white box (mock 2a).
- Built the mobile fallback: stacked full-width (`min-h-12`) segments, each `role="radio"` always carrying its own icon AND visible text — no icon-only cell at mobile width (mock 2d).
- Both layouts render into the DOM (`hidden sm:block` / `sm:hidden`) with `data-testid` hooks; `display:none` removes the hidden layer from the accessibility tree so AT announces exactly one radiogroup per date (EDGE-A11Y-EXCL).
- Preserved verbatim: never-blank seed `initial?.[o.id] ?? "no"`, the `onChange` emission effect, the `aria-live="polite"` region, the three `h-11` bulk buttons (absent when disabled), the closed-poll read-only chips, and the `VoteState`/`GridOption` re-export — the `disabled`/`onChange`/`GridOption`/`VoteState` public contract is unchanged (build typechecks).
- Rewrote the test suite to radio semantics (9 tests, green): never-blank default, single direct override, idempotent re-selection, Clear reset, initial seed, onChange payload, read-only chips, plus the two new a11y tests (desktop column-header association + mobile icon+text segments).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite AvailabilityGrid to the radio matrix** - `cbf4085` (feat)
2. **Task 2: Rewrite availability-grid.test.tsx for radio semantics + a11y tests** - `8f4370b` (test)

**Plan metadata:** see final `docs(05-01)` commit.

## Files Created/Modified
- `src/components/availability-grid.tsx` - Radio-matrix rewrite (desktop matrix + mobile segments + read-only chips), `selectCell` setter, preserved bulk/never-blank/aria-live/onChange, STATE_ORDER + HEADER_COLOR maps, `cn()` composition, updated file-header a11y comment block.
- `src/components/availability-grid.test.tsx` - Rewritten radio-semantics tests + desktop-header-association + mobile-segmented-fallback a11y tests, layer-scoped by `data-testid`.
- `.planning/phases/05-.../deferred-items.md` - Logged one out-of-scope pre-existing lint finding (design_handoff/support.js).

## Decisions Made
- Followed the plan's markup shapes and the mock's exact class values (`grid-cols-[1.6fr_1fr_1fr_1fr]`, `size-11`, `min-h-12`, `focus-visible:ring-3 focus-visible:ring-ring/50`). Desktop unselected cells render an empty white box (icon only appears when selected) per mock 2a; mobile segments always show icon+text per mock 2d.
- Used `getAttribute("aria-checked")` + plain vitest assertions (no `@testing-library/jest-dom` is configured in this repo) and scoped every layer-specific query by `data-testid` because jsdom does not evaluate the `hidden`/`sm:hidden` media queries, so both layers are accessible in the test DOM.
- Adopted `cn()` for cell class composition (matches ResultsGrid's more recent convention) rather than the old raw template-literal concatenation.

## Deviations from Plan

None - plan executed exactly as written. (STATE_META, tokens, labels, and the public prop/type contract were all reused verbatim; no auto-fixes were required.)

## Issues Encountered
- `npm run build` initially failed at page-data collection with "DATABASE_URL is not set" (the `event.ics` route reads the DB at module load). This is a pre-existing environmental constraint, not a code fault — TypeScript typecheck itself passed. Re-running with `DATABASE_URL` pointed at the local Docker Postgres (`lfg-db-1`, db `lfg`) produced a clean, fully successful build. No code change was needed.
- `npm run lint` reports 2 errors / 8 warnings, all in `design_handoff_vote_grid_redesign/designs/support.js` — a design-handoff artifact, out of scope. Both files changed by this plan lint clean (`npx eslint` on them: "No issues found"). Logged in `deferred-items.md`.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The `disabled`/`onChange`/`GridOption`/`VoteState` public contract is unchanged, so Plan 05-03 (vote-form reconciliation) and both participant pages continue to typecheck against AvailabilityGrid without a contract break.
- Remaining Phase 5 plans are visual reconciliation (pixel targets) — the one structural change is now landed and green.
- Open human check for end-of-phase: verify mocks 2a–2e visually and confirm a screen reader announces exactly one radiogroup per date (coverage deliverable D6).

## Self-Check: PASSED

- FOUND: src/components/availability-grid.tsx
- FOUND: src/components/availability-grid.test.tsx
- FOUND commit: cbf4085 (Task 1)
- FOUND commit: 8f4370b (Task 2)
- `npm test -- availability-grid`: 9 passed / 9
- `npx eslint` on both changed files: No issues found
- `npm run build`: succeeds (with DATABASE_URL set for local page-data collection)

---
*Phase: 05-vote-grid-redesign-matrix-1c*
*Completed: 2026-07-02*

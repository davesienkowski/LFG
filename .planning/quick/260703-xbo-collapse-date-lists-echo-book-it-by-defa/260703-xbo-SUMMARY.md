---
task: 260703-xbo
title: Collapse candidate-date lists on the echo + Book-it by default (admin page UX)
status: complete
completed: 2026-07-04
requirements: [XBO-01, XBO-02, XBO-03, XBO-04]
commits:
  - 7ae2f88  # feat: reorder book-it after results + collapse candidate-date echo
  - e6e79a7  # feat: collapse book-it to suggested date on all breakpoints
  - 3b2d87e  # feat: hide zero-vote dates in mobile results cards behind toggle
  - 8ddefdc  # fix: retarget closed-poll picker-absence assertion to <legend>
key-files:
  modified:
    - src/app/a/[adminUrlId]/page.tsx
    - src/components/book-it-control.tsx
    - src/components/book-it-control.test.tsx
    - src/components/results-grid.tsx
    - src/components/results-grid.test.tsx
    - src/app/a/[adminUrlId]/page.test.ts
metrics:
  tasks: 3
  files: 6
  tests: 240 passed (23 files)
---

# Quick Task 260703-xbo: Collapse date lists (echo + Book-it) by default Summary

Four presentation-only admin-page UX tweaks, all shipped exactly as locked: Book-it
moved below Results, the candidate-date echo collapsed into a native `<details>`,
the Book-it picker collapsed to its suggested date on every breakpoint, and mobile
results cards now hide zero-vote dates behind a "Show all dates (+N)" toggle. No
server action, query, data-flow, `computeResults`, three-token, or migration change.

## What changed

### XBO-01 + XBO-02 — page.tsx (commit 7ae2f88)
- **Reorder (pure move):** the entire `{isClosed ? (finalized Card) : (open picker)}`
  Book-it block (with its leading comment) now sits immediately after the Results
  `<Card>` and before the "Share your poll" `<div>`, as a direct `<main>` child.
  Both ternary branches and all internals moved verbatim. Final `<main>` order:
  header → candidate-date echo → Results Card → Book-it → Share/Invite.
- **Collapse the echo:** the whole `{multiMonth ? … : …}` chip block is wrapped in a
  single native `<details className="group …">` closed by default (no `open`), with a
  tappable `<summary>` (`min-h-11`, marker hidden) reading `Candidate dates ({options.length})`
  preceded by a chevron that rotates via `group-open:rotate-90`. Added the file's
  first `lucide-react` import (`ChevronRight`). No client JS, no `useState` — native
  disclosure gives collapsed-by-default + click/Enter expand + keyboard + SR semantics.
  Month-grouping, `CandidateChip`, short-label + full-date `title`/`aria-label` unchanged.

### XBO-03 — book-it-control.tsx + test (commit e6e79a7)
- Suggested-date summary div dropped its `sm:hidden` token → `cn("flex flex-wrap
  items-center gap-2", showAllDates && "hidden")`, so it is the default collapsed
  view on desktop AND mobile.
- Radio-grid wrapper ternary `showAllDates ? "grid" : "hidden sm:grid"` →
  `showAllDates ? "grid" : "hidden"` — hidden on ALL breakpoints until "Change date".
- Stale mobile-only comments updated to say "all breakpoints".
- Preserved every load-bearing invariant: radios ALWAYS in the DOM (display toggle
  only → `name="winningOptionId"` + `defaultChecked` preselect submits while collapsed),
  the `preselectedId`/`preselectedIsBest` derivation, the per-radio + summary "Suggested"
  badge, the two-step confirm disclosure, `type="button"` "Change date", ≥44px targets.
- Added a token-based (`classList.contains`, not substring) test proving the collapsed
  grid has `hidden` and NOT `sm:grid`, the summary lacks `sm:hidden`, and "Change date"
  drops `hidden` without remounting the radios or losing the best preselection.

### XBO-04 — results-grid.tsx + test (commit 3b2d87e)
- Added `showZeroVote` `useState` (pure in-memory display toggle).
- Partitioned `displayOptions` into `votedOptions` (`yes>0 || ifneedbe>0`) and
  `zeroVoteOptions` (exact De Morgan complement) — reusing `resultByOption` verbatim,
  no re-computation/re-rank. Best day always has `yes>0` → always in `votedOptions`.
- Factored the per-date card into a single `renderDateCard` helper (voted and
  zero-vote cards render identically) with `data-testid="result-date-card"`; the
  default-open gate is now partition-independent: `open={isBest && opt.id === displayOptions[0]?.id}`
  (preserves WFM-03 co-best-first-only and WFM-01/02 no-best-none).
- Mobile `<ul>` render policy: default cards = `hasVoted ? votedOptions : displayOptions`;
  a `<button type="button" aria-expanded>` "Show all dates (+N)" / "Show fewer" toggle
  (`min-h-11`) renders ONLY when `hasVoted && zeroVoteOptions.length > 0`, revealing the
  zero-vote cards below. Edge XBO-04-empty: when no date has any vote, ALL cards render
  and NO lone toggle appears.
- Desktop table, desktop-only filter, best-day summary, scroll-fade, sticky header,
  best-first ordering, and all tallies (including opt-3's `0 yes · 0 if-need-be` column)
  unchanged.
- Updated the two DOM-shape mobile tests (default = 2 voted cards; 2 details, first
  best open) and added three new tests: toggle reveal/collapse idempotent round-trip,
  no toggle when all dates voted, and edge XBO-04-empty (all cards + no toggle when none voted).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Retargeted a closed-poll assertion in page.test.ts (commit 8ddefdc)**
- **Found during:** final full-suite gate after Task 1.
- **Issue:** `src/app/a/[adminUrlId]/page.test.ts` asserted `expect(html).not.toContain("Candidate dates")`
  on a closed poll as a proxy for the Book-it picker (whose `<legend>` reads "Candidate dates")
  being absent. Task 1's new echo `<summary>Candidate dates (N)</summary>` renders on every
  poll, so the substring now legitimately appears on closed polls too — the assertion was
  testing the wrong thing.
- **Fix:** retargeted the assertion to `not.toContain("<legend")` (only BookItControl emits a
  `<legend>` on this page); the adjacent `not.toContain("Book this date")` already proves picker
  absence. Presentation-only; no behavior change.
- **Files modified:** src/app/a/[adminUrlId]/page.test.ts
- **Commit:** 8ddefdc

## Verification

- `DATABASE_URL=… npm test` — **240 passed (23 files)**, 0 failed.
- `DATABASE_URL=… npm run build` — green (RSC/type-check compiles the page reorder,
  `<details>` echo wrap, book-it collapse, and results-grid partition/toggle).
- Four atomic commits (three feature tasks + one test-alignment fix). No migration. No deploy.

## Notes for orchestrator

- No deploy performed (per constraints). The orchestrator will screenshot desktop + mobile
  and deploy after.
- Manual visual checks worth capturing: (1) admin desktop — Book-it sits below Results,
  echo collapsed with a "Candidate dates (N)" toggle, Book-it shows suggested date + "Change date";
  (2) admin mobile — results cards show only voted dates with a "Show all dates (+N)" toggle
  revealing zero-vote dates.

## Self-Check: PASSED

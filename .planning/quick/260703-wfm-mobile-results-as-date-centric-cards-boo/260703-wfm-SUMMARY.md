---
task: quick-260703-wfm
status: complete
completed: 2026-07-03
commits:
  - c4f41ba  # feat: mobile date-centric results cards on admin page
  - 73a852d  # feat: collapse Book-it mobile picker to suggested date + Change date
  - c670e8c  # feat: bump admin echo chip label text-xs to text-sm
files_modified:
  - src/components/results-grid.tsx
  - src/components/results-grid.test.tsx
  - src/app/a/[adminUrlId]/page.test.ts
  - src/components/book-it-control.tsx
  - src/components/book-it-control.test.tsx
  - src/app/a/[adminUrlId]/page.tsx
tests: 236 passed (23 files)
build: green
---

# Quick Task 260703-wfm: Mobile results as date-centric cards + Book-it collapse — Summary

Reworked the admin page (`/a/[adminUrlId]`) MOBILE (<640px) layout into a date-first surface: the
17-column participants×dates results table is replaced on phones by a best-first list of date cards,
and the long Book-it radio picker collapses to the suggested date behind a "Change date" toggle.
Desktop (`sm:`+) rendering is byte-identical except the two locked all-breakpoint polish deltas. No
server action / query / `computeResults` / three-token / data-flow change; no migration; no deploy.

## What changed

### Task 1 — ResultsGrid mobile date-cards (c4f41ba)
- `formatDateWithTimeShort` added to the format-date import; new module helper `optionLabelShort(opt)`.
- Desktop table wrapper made `hidden sm:block`; filter block made `hidden sm:flex` (participant-row
  filter is desktop-only by locked design). Table internals, sticky classes, scroll-fade, `displayOptions`
  usage, the React-19 derived-`visible` filter logic, the best-day summary, and the zero-participants
  early return are all untouched.
- New `<ul data-testid="results-cards-mobile" className="... sm:hidden">` sibling AFTER the table,
  mapping `displayOptions` (SAME best-first order) and reusing `resultByOption` tallies verbatim — no
  re-ranking, no `computeResults`. Each `<li>`: `<BestDayBadge>` when best + `optionLabelShort`, a
  `{yes} available · {ifneedbe} if-need-be` tally (word "available", distinct from the desktop "yes"
  header), and a native `<details>` over ALL `participants` (unfiltered) with icon+label state chips
  routed through `normalizeVoteState`. No email ever rendered.
- **Edge WFM-03:** `open` gated on `isBest && index === 0` — under a co-best TIE both cards are badged
  but only the FIRST opens; with no best, none opens.
- **Edge WFM-01/02:** the shared zero-participants early return fires before the mobile `<ul>`; chips
  route missing/unrecognized votes through `normalizeVoteState` → "Not available", never blank/throw.
- Tests: scoped table-oriented assertions to `within(getByRole("table"))` (mobile cards double-render
  "Best" and all names in jsdom, where Tailwind visibility is inert); added a 5-test mobile describe
  block (best-first + badge, unfiltered icon+label chips, first-best-only open, co-best-one-open,
  no-best-none-open); re-scoped the page.test.ts Jordan assertion to the sliced `<table>` HTML plus a
  positive full-HTML presence check (mobile card lists him). Canary-email negative assertion preserved.

### Task 2 — BookItControl mobile collapse-to-suggested (73a852d)
- Added `cn` import + `const [showAllDates, setShowAllDates] = useState(false)` and
  `preselectedOption` / `preselectedIsBest` derivations.
- Mobile-only summary row (`sm:hidden`, hidden once expanded) rendered only when `preselectedOption`
  exists (empty-options guard, edge WFM-04): condensed suggested date + the "Suggested" badge (only when
  `preselectedIsBest`) + a `type="button"` "Change date" button (`min-h-11`) that only calls
  `setShowAllDates(true)`.
- Radio-grid wrapper className changed to `cn("grid ... gap-2.5", showAllDates ? "grid" : "hidden sm:grid")`
  — **display toggle only, radios NEVER unmount**, so `winningOptionId` submits while collapsed on mobile
  and the uncontrolled `defaultChecked` preselection survives the re-expand re-render (edge WFM-05). Row
  gap `gap-2 → gap-2.5` (locked polish). Radio `<input>` markup unchanged. Two-step confirm untouched.
- Tests: "Suggested" assertion switched to `getAllByText(...).length > 0` (badge now on both surfaces);
  added radios-always-in-DOM (name/checked/type) and Change-date-reveal-without-remount (WFM-05) tests.

### Task 3 — Echo chip text polish + final gate (c670e8c)
- `CandidateChip` (page.tsx) `<li>` className `text-xs → text-sm`; full date preserved in
  `title`/`aria-label`. Only change to page.tsx (locked all-breakpoint polish, edge WFM-06).

## Deviations from Plan

None — plan executed exactly as written.

## Load-bearing invariants preserved
- ResultsGrid: table internals / filter / scroll-fade / sticky / best-first order / empty-state early
  return / aria-live all unchanged (only added the `sm:hidden` card branch + made the filter desktop-only).
- BookItControl: radio semantics + two-step confirm + preselect + Suggested badge intact; collapse is
  `display:none` only (radios always in DOM).
- New cards/toggles use icon+text (never color-only), native `<details>` / `type=button` (keyboard + SR
  operable), and ≥44px tap targets (`min-h-11`).
- T-wfm-01 (email leak): mobile cards render `p.name` only; page.test.ts canary-email assertion passes.
- T-wfm-02 (tampering): Book-it collapse is display-only; radios stay mounted so `winningOptionId`
  cannot be silently dropped/altered.

## Desktop deltas (authorized, edge WFM-06)
The ONLY desktop-visible changes are the two locked polish items — Book-it radio row gap `gap-2 → gap-2.5`
and CandidateChip echo label `text-xs → text-sm` (both apply at all breakpoints by design). Everything
else desktop (results table, Book-it radio appearance, filter, sticky/scroll-fade) is byte-identical:
`hidden sm:block` / `hidden sm:flex` / `hidden sm:grid` all resolve to the original display at `sm`+.

## Verification
- `DATABASE_URL=... npm test` → **236 passed (23 files)**. results-grid.test.tsx 19 → 24; book-it-control
  4 → 6; page.test.ts 11 (Jordan assertion re-scoped, canary-email preserved).
- `DATABASE_URL=... npm run build` → **green** (Next.js 16.2.9, compiled + TypeScript + static gen OK).

## Follow-up (orchestrator)
Orchestrator will screenshot mobile (390px) + deploy. No deploy performed here; ROADMAP.md not updated
per task constraints.

## Self-Check: PASSED
- src/components/results-grid.tsx — FOUND (mobile `results-cards-mobile` branch present)
- src/components/book-it-control.tsx — FOUND (`showAllDates` collapse present)
- src/app/a/[adminUrlId]/page.tsx — FOUND (echo chip `text-sm`)
- Commits c4f41ba, 73a852d, c670e8c — all present in `git log`.

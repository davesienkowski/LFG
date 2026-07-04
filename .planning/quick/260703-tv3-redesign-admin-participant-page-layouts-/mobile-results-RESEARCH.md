# Mobile Admin Page Research: Results Matrix, Date Echo, Book-it Picker

**Researched:** 2026-07-03
**Scope:** Mobile-only (≤640px / iPhone-width 390px) follow-up to `260703-tv3-RESEARCH.md`
(which covered desktop widening). No code changes — findings only.

## Grounding: current state (post-tv3 desktop redesign)

Read directly from source (`src/components/results-grid.tsx`, `src/app/a/[adminUrlId]/page.tsx`,
`src/components/book-it-control.tsx`):

- **ResultsGrid** (lines 348-453) is **one `<table>` at every breakpoint** — no mobile
  card fallback exists yet. It already has: sticky-left participant column (`sticky left-0 z-10`),
  sticky-top header row (`sticky top-0 z-20/30`, added in tv3 task 3), a Lea Verou-style
  CSS scroll-fade (`SCROLL_FADE_STYLE`), best-day-first column ordering, per-date tallies in
  the header (`{yes} yes · {ifneedbe} if-need-be`), and — **already built** — a "Best day so
  far" summary sentence above the table (lines 233-255) that reads from the same `isBest`
  predicate as the header badge. This is the progressive-disclosure lead-in Q2 asks about;
  it exists but the detailed table below it is not yet compacted for mobile.
- **Candidate-date echo** (`page.tsx` lines 132-155) is `grid grid-cols-2 sm:grid-cols-4 ...`
  of small pill chips (`text-xs`, `px-2.5 py-0.5`), short label + full date in `title`/`aria-label`.
  Already better than the 2-col flex-wrap the original tv3 research flagged, but each chip
  is inert (no tap target concerns — it's not interactive) and `text-xs` (12px) is
  borderline small for a primary-content list.
- **Book-it picker** (`book-it-control.tsx` lines 66-101) is a radio `<label>` list,
  `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2` — **on mobile
  (`<640px`) this is `grid-cols-1`: one full-width row per date.** Each row is already
  `min-h-11` (44px) with `gap-2` (8px) between rows — this already meets Fitts's-law tap
  target guidance. The remaining problem is pure length: 17 rows × ~52px + 8px gaps ≈
  1,020px of vertical scroll before the "Book this date" button.

## Q1 — Mobile pattern for the results matrix: which of (a)/(b)/(c)/(d)?

**Recommendation: (a), but scoped — date-centric cards, ranked best-first, each collapsed
to a one-line tally with an optional per-card expand for the name list. Not a full
participant-by-participant re-render.**

Evidence:

- **NN/g is explicit that tables beat cards for *comparison* tasks** — "tables excel at
  comparison because adjacent data points are visible simultaneously," while cards impose
  "eye movement and short-term memory burden" [CITED: nngroup.com/articles/data-tables/].
  This argues against naively converting the grid to 17×N participant cards (option b) —
  that trades one illegible layout for a differently-illegible one; a person's own row
  would only be one card among many, and the organizer would have to hold every date in
  their head to find the best one.
- **NN/g's mobile-tables guidance separately says: filter/toggle *before* forcing the full
  table into view, and don't make users scan raw data if the app can pre-compute the
  answer** — "let users refine exactly which data set is needed before seeing data" and
  "give users control of the view of data as they are seeing it" [CITED:
  nngroup.com/articles/mobile-tables/]. This app already precomputes tallies and a best-day
  flag server-side (`computeResults`), so the mobile view should surface that computed
  answer directly instead of asking the user to eyeball a heatmap.
- **This exact "surface the answer, don't make people decode a grid" pattern is the
  differentiator competitors are converging on.** LettuceMeet and When2Meet both render a
  colour-intensity heatmap and leave interpretation to the viewer — "you look at the colors
  and identify the darkest region yourself" — whereas the newer "WhenItWorks"-style tools
  "explicitly label the best available slot, so you don't have to do any visual analysis"
  [CITED: usecarly.com/blog/lettucemeet-alternatives — comparison article, MEDIUM
  confidence, not hands-on tested]. Doodle's own results view highlights the winning
  slot with a bold border/count badge rather than requiring the viewer to scan every cell
  [CITED: help.doodle.com — carried over from prior research]. This app's `isBest`
  highlighting already does the desktop-table version of this; the date-centric mobile
  card is the natural extension of the same idea, not a new concept.
- Ruling out the others: **(c) horizontal-scroll-with-affordance** was explicitly called
  "least preferred" and only "advisable if... data is limited to a logical number of
  columns" [CITED: medium.com/design-bootcamp — "Designing user-friendly data tables for
  mobile devices"]; 17 columns on a 390px screen is not a logical number — even with the
  existing sticky column + scroll-fade, the organizer sees ~1.5 columns per screen, which
  is the exact problem statement. **(d) transposing** (dates-as-rows on mobile,
  dates-as-columns on desktop) was already flagged in the prior desktop research as "the
  most bug-prone" option requiring two independent render paths for the same data — that
  verdict still holds and is reinforced by NN/g not mentioning transposition anywhere in
  its mobile-table guidance as a recommended technique.

**Concrete mobile card shape** (below `sm:`):
```
┌─────────────────────────────────────┐
│ ★ Best   Sat, Jul 12                 │   <- rank badge + short date (reuse formatDateWithTimeShort)
│ 4 available · 1 if-need-be            │   <- reuse the SAME resultByOption tally already computed
│ [▾ Who's available]                   │   <- disclosure toggle, collapsed by default
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ Sat, Jul 19                           │
│ 3 available · 2 if-need-be            │
│ [▾ Who's available]                   │
└─────────────────────────────────────┘
```
Cards render in the SAME `displayOptions` best-first order the table already uses (no new
ranking logic — reuse `resultByOption`, `bestOptions`/`restOptions` verbatim). Expanding a
card reveals the same three-state chip list (`STATE_META` icon + label) currently rendered
per-cell in the table body, just grouped by participant name under that one date instead of
by date across a row. This preserves every existing data source and accessibility affordance
(icon + text label, never colour-only) — it's a re-layout, not new computation.

## Q2 — Progressive disclosure: lead with a summary, collapse detail?

**Yes — and the "Best day so far" summary sentence already at the top of `ResultsGrid`
(lines 233-255) is exactly this pattern; it should become visually primary on mobile, not
just a caption above a scrolling table.** NN/g's mobile-table guidance frames this as "let
users refine exactly which data set is needed before seeing data" — i.e., a summary line
plus opt-in detail, not two separate features
[CITED: nngroup.com/articles/mobile-tables/]. NN/g's video guidance on "Tables of Contents
on Mobile" and "Card View vs. List View" reinforces accordion-style disclosure for grouped
data as the standard mobile answer once a table would otherwise force excess scrolling
[CITED: nngroup.com/videos/mobile-table-of-contents/, nngroup.com/videos/card-view-vs-list-view/].

Concretely for this app: keep the existing best-day sentence/list unchanged (it is already
correct), then render the per-date cards described in Q1 directly below it — each date's
per-participant breakdown is the "collapsed detail" (accordion `<details>`/disclosure
button), defaulting closed for every date except optionally the single best-day card
(open by default, since that's the answer the organizer came for).

## Q3 — Tailwind dual-layout technique + accessibility caveats

Reuse the exact pattern `AvailabilityGrid` already established in this codebase (desktop
matrix `hidden sm:block`, mobile stacked segments `sm:hidden`) — this is a proven, existing
convention, not a new one to introduce for `ResultsGrid`:

```tsx
{/* Desktop/tablet: existing table, unchanged internals */}
<div className="hidden sm:block ..." aria-hidden={false}>
  <table>{/* current table markup verbatim */}</table>
</div>

{/* Mobile: date-centric cards, SAME data, SAME displayOptions order */}
<div className="sm:hidden flex flex-col gap-3">
  {displayOptions.map((opt) => <ResultDateCard key={opt.id} ... />)}
</div>
```

**Accessibility caveats (load-bearing — this app already has a documented invariant that
color is never the only signal, and an aria-live filter announcement to preserve):**

1. **Do not duplicate content into the accessibility tree twice.** `hidden`/`sm:hidden` in
   Tailwind compile to `display: none`, which already removes the hidden branch from the
   accessibility tree in all mainstream browsers/AT (unlike `visibility:hidden`, `display:
   none` has no separate a11y-tree entry) — so plain `hidden sm:block` / `sm:hidden` is
   sufficient; **no additional `aria-hidden` is needed on the two branches** as long as
   Tailwind's compiled `display:none` is what's actually applied (verified general CSS
   a11y behavior; Tailwind's own screen-reader docs confirm `sr-only` is the *different*
   technique reserved for content that should stay in the a11y tree while visually
   hidden — the opposite of this case) [CITED: tailwindcss.com/docs/screen-readers].
   Do **not** use `sr-only`/`not-sr-only` here — that utility is for visually-hidden-but-
   AT-visible content (e.g. table captions), not for swapping two fully-visible layouts.
2. **The `aria-live` filter announcement (`results-grid.tsx` line 334-336) and the filter
   `<select>` controls must stay OUTSIDE both the table and the card branches** — a single
   shared control above both, exactly as today, so switching breakpoints never
   double-announces or orphans the live region in the hidden branch.
3. **Keep the semantic `<table>` for the desktop branch** (do not also convert desktop to
   cards) — NN/g's stance is that tables remain the better comparison tool at
   desktop widths where the horizontal-scroll problem doesn't exist; only mobile needs a
   different layout for the same data.
4. **The per-date expand/disclosure** (Q1/Q2) should be a real `<button aria-expanded>` or
   native `<details>/<summary>`, not a `div onClick`, so it's keyboard- and
   screen-reader-operable without extra ARIA wiring.

## Q4 — Long date list display (echo + Book-it picker)

**Top echo (non-interactive, ~17 items):** current `grid-cols-2 sm:grid-cols-4` chip grid
is directionally correct — grids of short compact chips read better on mobile than either
a single scrolling column (too tall, 17 rows) or one wrapped paragraph of long labels (the
pre-tv3 state). One concrete refinement: **bump `text-xs` → `text-sm`** for the chip label —
12px body text is below the comfortable reading threshold for a primary content list (not a
caption); this is a copy/paste-safe one-line change, not a structural one. Month-grouping
(already implemented, lines 134-148) should stay — it's the correct technique per the prior
research (removes the repeated month token from every chip).

**Book-it picker (must remain single-select):** this is the one place a plain chip grid is
wrong, because the control needs one obviously-selected state visible without scrolling.
Two viable mobile patterns, in order of recommendation:

1. **Recommended — collapsed-by-default with the pre-selected/best date always visible,
   full list behind a "Choose a different date" disclosure.** This directly reuses the Q2
   progressive-disclosure principle: most organizers will book the suggested best day, so
   showing 17 full-width rows before they even see the confirm button is unnecessary
   friction for the common case. Render: a single summary row/card showing the
   pre-selected date (`Suggested: Sat, Jul 12` — reusing the existing `Suggested` badge)
   with a "Change date" button; tapping it reveals the existing `grid-cols-1` radio list
   in place. Keeps the exact same `name="winningOptionId"`/`defaultChecked`/44px targets —
   pure disclosure wrapper, no change to the underlying radios.
2. **Fallback if disclosure is deferred — keep the current full `grid-cols-1` radio list**,
   which already satisfies Fitts's-law sizing (see Q5) — it is not *wrong*, just long. If
   time only allows one change this cycle, Q1 (results matrix) is the higher-value fix;
   the Book-it list, while tall, is at least each-row-tappable and correctly sized today.

Do **not** switch the Book-it control to a native `<select>` dropdown on mobile only —
that would require two parallel implementations of the same form field (one branch feeding
`winningOptionId` via `<select>`, one via radios) purely for a cosmetic win, and native
`<select>` popovers hide the "Suggested" badge/emerald highlighting this app deliberately
surfaces per-option.

## Q5 — Native/polished mobile touches

- **Tap target sizing is already correct where it matters**: Book-it rows are `min-h-11`
  (44px) with `gap-2` (8px) between rows — this meets Apple HIG's 44×44pt minimum and sits
  above WCAG 2.2's AA-level 24×24px minimum (SC 2.5.8, Oct 2023) with room to spare for the
  stricter AAA 44px guidance [CITED: smashingmagazine.com/2023/04/accessible-tap-target-
  sizes-rage-taps-clicks/]. Apply the same `min-h-11` treatment to any new disclosure
  buttons/toggles introduced for Q1/Q4 (the per-date "Who's available" expand button, the
  Book-it "Change date" button) — don't let a new small toggle regress this.
  Consider bumping row gap from `gap-2` (8px) to `gap-2.5`/`gap-3` (10-12px) on the Book-it
  list specifically — accessibility guidance recommends ≥10px between adjacent touch
  targets so a resting/tremoring finger has "dead space" between rows, rather than 8px
  which is close but slightly under that specific recommendation
  [CITED: same Smashing Magazine cheatsheet].
- **Sticky section context**: the sticky-top header row on `ResultsGrid` (already built in
  tv3 task 3) only applies to the desktop `<table>` branch; it has no equivalent need on
  the mobile card branch (cards don't need a pinned header — each card is self-labeled with
  its own date). No new sticky mobile chrome is needed for Q1.
- **Safe-area insets**: not currently relevant — this app has no fixed/floating bottom
  bars or notch-adjacent fixed headers today. Flag for later only if a future iteration
  adds a persistent bottom action bar (e.g. a floating "Book this date" CTA) — that would
  need `padding-bottom: env(safe-area-inset-bottom)` (or Tailwind's `pb-[env(safe-area-
  inset-bottom)]`) to avoid the iOS home-indicator overlapping the button. Not applicable
  to the changes proposed here.
- **Avoid tiny text**: covered in Q4 (bump echo chip text from `text-xs` to `text-sm`);
  apply the same floor to any new mobile card copy (tally lines, disclosure labels) — this
  app's existing body-text convention elsewhere is `text-base`/`text-sm`, never `text-xs`
  for primary content (the codebase already reserves `text-xs` for the "Best"/"Suggested"/
  "Keep private" pill badges, which is an appropriate use — badges, not primary reading
  content).

## Recommended direction for THIS app (synthesis)

Build **exactly one new mobile-only component pattern** for the admin page: a **date-
centric, best-first, collapsed-by-default results card list**, added as a `sm:hidden`
sibling to the existing `ResultsGrid` `<table>` (which stays `hidden sm:block`, internals
untouched) — mirroring the dual-layout convention `AvailabilityGrid` already uses elsewhere
in this codebase. Concretely, in priority order:

1. **ResultsGrid mobile cards (highest value)** — date-centric cards per Q1, reusing
   `displayOptions`/`resultByOption` verbatim; per-card disclosure for the participant
   list per Q2; existing best-day summary sentence stays as the lead-in, now visually
   primary on mobile.
2. **Book-it picker disclosure** — collapse to "Suggested: [date] · Change date" with the
   full radio list behind a toggle, per Q4 #1; keep every existing radio/form attribute
   unchanged.
3. **Echo chip text bump** (`text-xs` → `text-sm`) and Book-it row gap bump (`gap-2` →
   `gap-2.5`) — low-cost polish, per Q4/Q5.

This order matches "highest information-density-per-mobile-screen" payoff first (the
17-column table is the objectively worst current mobile experience) while reusing 100% of
already-computed data and existing component conventions (no new ranking logic, no new
libraries, no change to `AvailabilityGrid`, `computeResults`, or any Server Action).

## Sources

- [NN/g — Mobile Tables](https://www.nngroup.com/articles/mobile-tables/) — MEDIUM/HIGH,
  WebFetch-summarized directly from the article
- [NN/g — Data Tables: Four Major User Tasks](https://www.nngroup.com/articles/data-tables/) — HIGH
- [NN/g — Tables of Contents on Mobile (video)](https://www.nngroup.com/videos/mobile-table-of-contents/) — MEDIUM (title/summary only, not watched)
- [NN/g — Card View vs. List View (video)](https://www.nngroup.com/videos/card-view-vs-list-view/) — MEDIUM
- [Design Bootcamp (Medium) — Designing User-Friendly Data Tables for Mobile Devices](https://medium.com/design-bootcamp/designing-user-friendly-data-tables-for-mobile-devices-c470c82403ad) — MEDIUM, single-author blog, cross-checked against NN/g
- [usecarly.com — LettuceMeet alternatives comparison](https://www.usecarly.com/blog/lettucemeet-alternatives/) — LOW/MEDIUM, comparison-site article, not hands-on tested
- [help.doodle.com — Group Poll](https://help.doodle.com/en/collections/9572011-group-poll) — carried from prior research, MEDIUM
- [Smashing Magazine — Accessible Tap Target Sizes Cheatsheet](https://www.smashingmagazine.com/2023/04/accessible-tap-target-sizes-rage-taps-clicks/) — HIGH
- [Tailwind CSS — Screen Readers docs](https://tailwindcss.com/docs/screen-readers) — HIGH, official docs
- [Rallly blog — Mobile Poll UI Refresh](https://rallly.co/blog/mobile-ui-update) — MEDIUM, official blog, but covers the VOTING grid not the results view; used only to confirm Rallly did not adopt cards/transposition for its grid, consistent with keeping the desktop table pattern
- Codebase read: `src/components/results-grid.tsx`, `src/app/a/[adminUrlId]/page.tsx`, `src/components/book-it-control.tsx`, `src/components/availability-grid.tsx` (dual-layout precedent), `.planning/quick/260703-tv3-redesign-admin-participant-page-layouts-/260703-tv3-RESEARCH.md` and `260703-tv3-SUMMARY.md` (prior desktop-focused research + what was actually built)

## Confidence

- Codebase-grounded findings (current mobile behavior, existing sticky/scroll-fade/best-day
  logic): HIGH — read directly from source.
- NN/g table/card comparison guidance: HIGH — official UX research org, WebFetch-verified
  directly from the source articles.
- Competitor mobile behavior (Doodle, Rallly, LettuceMeet, When2meet, Crab.fit, Cal.com):
  MEDIUM — based on WebSearch/comparison-article summaries and one official vendor blog
  post, not hands-on interactive testing on a physical device this session; directionally
  reliable for "what pattern to copy," not for pixel-level specifics.
- Tap-target sizing and accessibility (display:none vs sr-only) guidance: HIGH —
  cross-referenced against official Tailwind docs and an established accessibility
  reference (Smashing Magazine cheatsheet, itself citing WCAG 2.2 SC 2.5.8).

# Redesign Research: Participant Voting Page + Admin Page (Desktop Layout, Long Date Lists)

**Researched:** 2026-07-03
**Scope:** Quick task — layout/UX research only, no code changes.

## Current state (grounding, from codebase read)

- Both pages are `<main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-8">` — a single ~672px column, centered, regardless of viewport width. This is the core problem: on a 1440px+ screen there's ~700px of empty gutter on each side.
- `AvailabilityGrid` (`src/components/availability-grid.tsx`) already has a real desktop/mobile split (`hidden sm:block` matrix vs `sm:hidden` stacked segments) — but the desktop "matrix" is still just N full-width rows stacked vertically inside the narrow column. With 17 dates that's 17 rows × ~60px = a page over 1000px tall of nothing but rows, at a width that never uses the screen's horizontal space.
- `ResultsGrid` (`src/components/results-grid.tsx`) already implements several correct patterns: sticky first column (`sticky left-0 z-10 bg-background`), a scroll-edge fade affordance (CSS-only, `SCROLL_FADE_STYLE`), best-day-first column ordering, and a date/status filter — this component is architecturally closer to best practice than the surrounding page shell. **The bottleneck isn't ResultsGrid's internals, it's that its parent `<main>` caps it at 672px**, so the horizontal-scroll table is scrolling inside a column that's already too narrow to show more than ~2 date columns before scrolling starts.
- `formatDateWithTime` / `formatDateOnly` always render the long form: `"Saturday, July 12"` / `"Saturday, July 12 at 2:00 PM"`. This is used in every list context (candidate-date chips, grid row labels, results headers) — there's no condensed variant (`Sat, Jul 12`) available anywhere in the codebase today.
- The candidate-date echo on the admin page (`<ul className="flex flex-wrap gap-2">` of pill chips) is the ONE part of the current design that already does something close to "right" — wrapping chips instead of a vertical list. It just uses the full-length date string, so each chip is wide and few fit per row.

## Q1 — What do the best group-scheduling tools do, especially with many dates?

- **Rallly**: current build (Next.js + TailwindCSS v4 + Radix UI, per its own repo) treats the poll as an **availability grid where dates are compact column headers** and options are entered as short chips/segments, not full sentences — organizer and participant views share the same grid component, with participants painting cells rather than reading long rows. On mobile it switches from a horizontal date-columns grid to a stacked, swipeable one-day-at-a-time view rather than shrinking cells to illegibility. [CITED: rallly.co, github.com/lukevella/rallly — general product description, verified via search, not hands-on tested this session]
- **When2meet**: dense grid, dates as columns, times as rows, heatmap-style shading for overlap — powerful on desktop but explicitly cited by multiple sources as poor on mobile ("constant zooming, tiny cells") because it never adapted its layout by breakpoint — it's the canonical "what not to copy for mobile" example. [CITED: meetergo.com, usecarly.com comparison articles]
- **LettuceMeet**: took the When2Meet drag-to-paint model but added a genuinely responsive mobile layout — cited repeatedly as the concrete "mobile-friendly When2Meet" reference. [CITED: usecarly.com, compsmag.com]
- **Doodle Group Poll**: results view is "a grid of names, time slots, and ticks" with the winning slot visually highlighted (bold border/count badge) — i.e., **participants-as-rows, dates-as-columns, with the winning column visually distinguished**, which is exactly the shape `ResultsGrid` already implements (best-day column pinned first + emerald highlight). [CITED: help.doodle.com]
- **Takeaway worth copying:** every serious competitor treats "dates" as the terse axis (short labels, chip/column form) and reserves prose-length labels for a single focused context (e.g. a detail tooltip), never for a repeated list of 17 rows.

## Q2 — Responsive patterns for a wide "entities × dates" table

Established, current best practice (not novel — cross-referenced across CSS-Tricks, Cruip, Tailkits):

1. **Sticky first column + sticky header, horizontal scroll for the rest.** `position: sticky; left: 0` on the first `<th>`/`<td>`, `position: sticky; top: 0` on the header row, `overflow-x-auto` on the wrapper, with a `z-index` high enough that the sticky column paints over scrolling body cells. **LFG's `ResultsGrid` already does the sticky-column half of this correctly** (`sticky left-0 z-10 bg-background`) — it's currently missing `sticky top-0` on `<thead>`, which matters once the table gets tall (17 date columns is fine height-wise since dates are columns here, but worth adding for participant lists that scroll vertically inside a bounded box).
2. **Scroll-edge affordance is mandatory, not optional**, once a table can scroll horizontally — a plain `overflow-x-auto` with no visual cue is a well-documented usability failure (users don't discover there's more). LFG already solved this with the Lea Verou-style CSS gradient fade — keep it, and reuse it verbatim on the new wider layout.
3. **"Table-to-cards" breakpoint fallback** is the standard mobile answer for genuinely dense tables: `block md:table` / `md:table-row` / `md:table-cell` swaps a `<table>` into stacked label:value cards below `md`. LFG's own `AvailabilityGrid` already uses this exact philosophy (two full alternate layouts gated by `sm:`), so extending the same pattern to `ResultsGrid` for mobile (currently it's one horizontally-scrolling table at all breakpoints) is consistent with existing conventions, not a new one.
4. Do **not** transpose the whole table by breakpoint (dates-as-rows on mobile, dates-as-columns on desktop) — that requires two independent render paths for the same data and is the most bug-prone of the three options; sticky-column-with-scroll is simpler and is what Doodle/Rallly/most modern data-grid UIs use as the default.

Sources: [CSS-Tricks — sticky header + sticky column](https://css-tricks.com/a-table-with-both-a-sticky-header-and-a-sticky-first-column/), [Cruip — Tailwind sticky column table](https://cruip.com/create-a-table-with-a-sticky-column-using-tailwind-css/), [Tailkits — responsive tables guide](https://tailkits.com/blog/tailwind-responsive-tables/).

## Q3 — Compacting a long list of dates (17+)

Concrete, actionable options, in order of recommended priority for this app:

1. **Condense the date format everywhere it repeats.** Add a `formatDateShort` alongside the existing `formatDateOnly`/`formatDateWithTime` in `src/lib/format-date.ts`: `"Sat, Jul 12"` instead of `"Saturday, July 12"`, and `"Sat, Jul 12 · 2:00 PM"` instead of `"Saturday, July 12 at 2:00 PM"`. This alone roughly halves the visual width of every row/chip/column-header. Keep the long form available for the one place a full sentence reads naturally (e.g. `PollSummary` intro text, or a `title=` tooltip on hover/focus for a11y).
2. **Group by month with subheadings** when the candidate set spans more than one month — a plain `<h3>July 2026</h3>` divider above the relevant chips/rows removes the month from every individual label (so each date becomes just `"Sat 12"` under its month heading), which is the density technique multi-month range pickers use to avoid repeating the month name N times.
3. **Multi-column responsive grid for date chips**, not a single wrapped `flex-wrap` line: `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2`. This turns 17 dates into ~4-5 short rows instead of a ragged wrapped paragraph or a 17-row list, and scales with viewport width instead of ignoring it (today's `flex flex-wrap` technically wraps but a wide chip full of the long date string still only fits 2-3 per row on desktop).
4. **Collapsing/grouping weekends visually** (e.g., a subtle color or border distinguishing Sat/Sun chips from weekdays) is a nice-to-have differentiator for a D&D scheduling use case where weekend sessions are the common case — low cost, not load-bearing, worth doing if time allows but not a structural change.
5. Do NOT reduce information density by *removing* dates from view (e.g. pagination/"show more") for the entry form — participants need to see and vote on all dates in one pass; compact formatting + grid columns is the correct lever, not hiding data.

## Q4 — Desktop "organizer dashboard" layout pattern

- A **two-column layout with a narrower "controls" rail and a wider "results" hero** is the standard shape for admin/organizer dashboards once there's enough screen width to support it (this mirrors booking-tool admin views broadly, e.g. Cal.com's booking management screens, and general SaaS dashboard convention of nav/settings-rail + primary-content). Recommended breakpoint: collapse to single column below `lg` (1024px), split at `lg:` and up.
- **Concrete structure for LFG's admin page:**
  - Below `lg`: current single-column stack, but change `max-w-2xl` → `max-w-3xl` for the mobile/tablet single column (a bit more breathing room even before the split) — mobile behavior otherwise unchanged.
  - `lg:` and up: `lg:grid lg:grid-cols-[minmax(320px,380px)_1fr] lg:gap-8`, left column = title + candidate-date chips + Share links + Invite-by-email (the "setup/control" cluster, which is naturally narrower content: cards, links, a form), right column = Results (`ResultsGrid`, the wide table that most wants horizontal room) + Book-it control below it. Overall page shell moves from `max-w-2xl` (672px) to something like `max-w-6xl` or `max-w-7xl` (1152–1280px) so the two-column split has real room to breathe, with the results table able to show meaningfully more than 2 date columns before scrolling.
  - This keeps `ResultsGrid`'s existing sticky-column/scroll-fade logic completely untouched — it just gets a wider box to live in.
- **Section rhythm**: keep the existing `flex flex-col gap-8` vertical rhythm inside each column; increase inter-column gap to `gap-8`/`gap-10` at `lg+` so the two columns read as distinct zones, not a single blurred grid.
- A **sticky action bar** (e.g. pinning "Copy participant link" / "Book it" while scrolling a long results table) is a nice desktop polish touch for the admin page specifically, since Book-it is the terminal action or organizers may want the participant link handy while scanning results — worth considering as a `lg:sticky lg:top-6` treatment on the left rail rather than a full floating toolbar (lower complexity, no new dependency).

## Q5 — Modern styling touches (no new dependencies)

- **Card grouping over bare sections**: the admin page already wraps Share/Invite blocks in `<Card>` — extend that consistently to the Results block and the Book-it block (currently plain `<div>` wrappers) so all major sections read as distinct cards with consistent `p-6` padding, matching the existing shadcn/ui `Card` primitive already in use. No new component needed.
- **Consistent spacing scale**: the codebase already standardizes on Tailwind's default scale (`gap-2`, `gap-3`, `gap-4`, `gap-8`, `p-6`) — keep using these tokens rather than introducing arbitrary values; the redesign should reuse `gap-8` for major section separation and `gap-2`/`gap-3` for intra-component spacing, consistent with current conventions.
- **Section headers**: current `text-2xl font-semibold leading-snug` per section (`Share your poll`, `Results`, `Book it`) is already reasonable — carry this forward unchanged for visual consistency, just make sure new two-column zones don't visually detach headers from their content (each column's own `h2` stays inside that column's `flex flex-col gap-4`, not a shared banner).
- **Chip/pill visual language** (`rounded-full border bg-muted px-3 py-1 text-sm`) used for candidate dates and status badges is already a good, cheap shadcn/ui-flavored pattern — reuse the same pill styling for the month-group chips in Q3 rather than inventing a new visual style.
- **Max-width tokens**: Tailwind idiomatic content widths are `max-w-2xl` (672px, current — too narrow), `max-w-4xl` (896px), `max-w-6xl` (1152px), `max-w-7xl` (1280px). For a data-forward admin dashboard `max-w-6xl`/`max-w-7xl` is standard (comparable to most SaaS dashboard shells); for the participant form (still fundamentally a single form, not a dashboard) a more modest widen to `max-w-4xl` is enough to give the compacted date grid (Q3) 3-4 columns of room without turning a form into a sprawling dashboard.

## Recommended direction for THIS app

- **Participant page**: keep it a single, centered column (it's a form, not a dashboard) but widen the shell from `max-w-2xl` to `max-w-4xl`, and change `AvailabilityGrid`'s desktop matrix from N stacked full-width rows to a **responsive multi-column card/row layout** using condensed date labels (Q3 #1) — e.g. instead of one row per date at full width, render short date+3-button clusters in a `grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-3` so 17 dates fill ~9 rows across 2 columns instead of 17 full-width rows. Month-grouping (Q3 #2) applies if the candidate set spans multiple months. Mobile (`<640px`) stays exactly as-is (the existing stacked-segments layout already works well and shouldn't change).
- **Admin page**: adopt the two-column dashboard shell (Q4) at `lg:` and up — controls rail (title, date chips, share/invite) on the left, Results + Book-it as the wide hero on the right — widening the overall shell to `max-w-6xl`/`max-w-7xl`. Condense the candidate-date echo chips to a responsive grid with short-format dates (Q3 #1/#3). Wrap Results and Book-it in `<Card>` for visual consistency with Share/Invite (Q5). Leave `ResultsGrid`'s internal sticky-column/scroll-fade/filter logic untouched — it already follows current best practice; it just needs a wider container.

## Concrete layout changes checklist

**Participant page (`/p/[participantUrlId]`) + `AvailabilityGrid`:**
- [ ] Widen `<main>` from `max-w-2xl` to `max-w-4xl`.
- [ ] Add a condensed date formatter (`formatDateShort` / `formatDateWithTimeShort`) in `src/lib/format-date.ts`; use it for grid row labels (keep full format available for a11y `aria-label`s / tooltips if desired).
- [ ] Change the desktop matrix (`hidden sm:block` branch) from a single-column stack of rows to a responsive 2-column grid of date rows at `lg:` and up (`grid-cols-1 lg:grid-cols-2`), each cell still the existing label + 3-button radiogroup.
- [ ] If candidate dates span multiple months, add month subheadings above the relevant chunk of rows.
- [ ] Leave the `<640px` mobile stacked-segments layout unchanged.

**Admin page (`/a/[adminUrlId]`):**
- [ ] Widen `<main>` from `max-w-2xl` to `max-w-6xl` (or `max-w-7xl`), single column below `lg`, two-column grid (`lg:grid-cols-[minmax(320px,380px)_1fr]`) at `lg:` and up.
- [ ] Left column: title/status pill, candidate-date echo (as a condensed multi-column chip grid, short date format, month-grouped if needed), Share links cards, Invite-by-email.
- [ ] Right column: Results (`ResultsGrid`, untouched internals) + Book-it, each wrapped in `<Card>` for visual parity with the left column's cards.
- [ ] Add `sticky top-0` to `ResultsGrid`'s `<thead>` row alongside its existing sticky-left column (currently only the column is sticky, not the header row).
- [ ] Optional polish: `lg:sticky lg:top-6` on the left rail so share links/invite stay reachable while scrolling a long results table.

## Sources

- [Rallly — official site](https://rallly.co/) / [Rallly GitHub](https://github.com/lukevella/rallly) — availability grid + Tailwind v4/Radix stack description
- [Doodle Help Center — Group Poll](https://help.doodle.com/en/collections/9572011-group-poll) — results grid + winning-slot highlight behavior
- [meetergo.com — When2Meet analysis](https://meetergo.com/en/magazine/when2meet) and [usecarly.com — LettuceMeet alternatives](https://www.usecarly.com/blog/lettucemeet-alternatives/) — mobile responsiveness comparison across When2meet/LettuceMeet
- [CSS-Tricks — sticky header + sticky first column table](https://css-tricks.com/a-table-with-both-a-sticky-header-and-a-sticky-first-column/)
- [Cruip — Tailwind CSS sticky column table](https://cruip.com/create-a-table-with-a-sticky-column-using-tailwind-css/)
- [Tailkits — building responsive tables with Tailwind CSS](https://tailkits.com/blog/tailwind-responsive-tables/)
- Codebase read: `src/app/p/[participantUrlId]/page.tsx`, `src/app/a/[adminUrlId]/page.tsx`, `src/components/availability-grid.tsx`, `src/components/results-grid.tsx`, `src/lib/format-date.ts`

## Confidence

- Codebase-grounded findings (current layout, existing sticky/scroll-fade implementation, date formatter behavior): HIGH — read directly from source.
- Competitor product behavior (Rallly, Doodle, When2meet, LettuceMeet): MEDIUM — based on WebSearch summaries of product docs/comparison articles, not hands-on interactive testing this session; directionally reliable for "what pattern to copy," not for pixel-level specifics.
- Tailwind responsive-table technique recommendations: HIGH — well-established, cross-referenced across multiple independent sources, and consistent with patterns already present in this codebase.

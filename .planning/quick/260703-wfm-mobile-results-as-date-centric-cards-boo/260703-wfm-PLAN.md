---
phase: quick-260703-wfm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/results-grid.tsx
  - src/components/results-grid.test.tsx
  - src/app/a/[adminUrlId]/page.test.ts
  - src/components/book-it-control.tsx
  - src/components/book-it-control.test.tsx
  - src/app/a/[adminUrlId]/page.tsx
autonomous: true
requirements: [quick-260703-wfm]

must_haves:
  truths:
    - "On a phone (<640px) the admin Results section shows a best-first list of date cards instead of the horizontally-scrolling participants×dates table"
    - "Each mobile date card shows a Best badge (best day only), the short date label, a '{yes} available · {ifneedbe} if-need-be' tally, and an expandable per-participant list with icon+label state chips"
    - "EXACTLY ONE card is open by default even when multiple dates TIE for best (open is gated on index===0, NOT isBest alone); every other card is collapsed; when no date is best no card is open (edge WFM-03)"
    - "Zero participants renders NEITHER the desktop table NOR the mobile cards — the existing early return fires before any card is computed; mobile chips route through normalizeVoteState so a missing/unrecognized vote renders 'Not available', never blank/throw (edge WFM-01/02)"
    - "On a phone the Book-it control collapses to the suggested date + a 'Change date' button; tapping it reveals the full radio list"
    - "The winning option still submits even while the Book-it list is visually collapsed (radios never leave the DOM); re-expanding never resets the preselection (uncontrolled defaultChecked survives the display-toggle re-render)"
    - "The ONLY desktop (>=640px) visible deltas are the two LOCKED polish items — Book-it radio row gap gap-2→gap-2.5 and CandidateChip echo label text-xs→text-sm (both apply at ALL breakpoints by design); every other desktop rendering (results table, Book-it radio appearance, filter, sticky/scroll-fade) is byte-identical"
    - "Full test suite (DB-backed) and production build stay green"
  artifacts:
    - path: "src/components/results-grid.tsx"
      provides: "sm:hidden mobile date-card list sibling to the hidden sm:block desktop table"
      contains: "results-cards-mobile"
    - path: "src/components/book-it-control.tsx"
      provides: "mobile collapse-to-suggested disclosure over the always-rendered radios"
      contains: "showAllDates"
    - path: "src/app/a/[adminUrlId]/page.tsx"
      provides: "CandidateChip echo text-xs -> text-sm polish"
  key_links:
    - from: "src/components/results-grid.tsx mobile cards"
      to: "displayOptions + resultByOption"
      via: "reuse of the already-computed best-first order and tallies (no re-ranking, no computeResults)"
    - from: "src/components/book-it-control.tsx collapsed list"
      to: "radio inputs name=winningOptionId"
      via: "display:none wrapper toggle (hidden sm:grid), never conditional unmount"
---

<objective>
Improve the admin page (`/a/[adminUrlId]`) MOBILE layout (≤640px) per the locked design and
`mobile-results-RESEARCH.md` "Recommended direction". Three presentation/layout changes plus one
small client-state disclosure:

1. ResultsGrid: add a `sm:hidden` date-centric, best-first card list as a sibling to the existing
   table (which becomes `hidden sm:block`, internals untouched). Cards reuse the already-computed
   `displayOptions` order and `resultByOption` tallies verbatim — no new ranking, no `computeResults`.
2. BookItControl: collapse the mobile radio list to the suggested date + a "Change date" toggle;
   the radios always stay in the DOM (display toggle only) so `winningOptionId` still submits.
3. page.tsx CandidateChip: bump the echo chip label `text-xs` → `text-sm`.

Purpose: the 17-column participants×dates table is the objectively worst current mobile experience;
this surfaces the pre-computed answer date-first and collapses the long Book-it picker.

Output: updated components + tests, full suite + build green. DESKTOP (`sm:`+) visually unchanged
EXCEPT the two locked polish deltas (Book-it row gap, echo chip text — see edge WFM-06). No server
action / query / data-flow / computeResults / three-token change. No migration, no deploy (the
orchestrator screenshots mobile + deploys after).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/quick/260703-tv3-redesign-admin-participant-page-layouts-/mobile-results-RESEARCH.md
@.claude/CLAUDE.md
@src/components/results-grid.tsx
@src/components/results-grid.test.tsx
@src/app/a/[adminUrlId]/page.test.ts
@src/components/book-it-control.tsx
@src/components/book-it-control.test.tsx
@src/app/a/[adminUrlId]/page.tsx
@src/lib/vote-state.ts
@src/lib/format-date.ts
@src/components/availability-grid.tsx
</context>

<key_facts>
- Dual-layout precedent already in this codebase: `AvailabilityGrid` uses `hidden sm:block`
  (desktop, `data-testid="matrix-desktop"`) + `sm:hidden` (mobile, `data-testid="segments-mobile"`).
  Mirror that convention for ResultsGrid — do not invent a new one.
- jsdom does NOT apply Tailwind CSS, so `hidden`/`sm:hidden`/`hidden sm:grid` are INERT in tests:
  BOTH branches render as visible in the DOM. Every assertion must therefore assert on the
  presence/structure of a branch (scoped by `within(...)` / `data-testid`), NEVER on media-query
  visibility. This is exactly why several existing tests must be scoped to `within(getByRole("table"))`.
- `cn` = `twMerge(clsx(...))` (src/lib/utils.ts). For a display toggle,
  `cn("grid ...", showAll ? "grid" : "hidden sm:grid")` resolves to `hidden` at base and `grid` at
  `sm` when collapsed (mobile hidden, desktop shown), and `grid` everywhere when expanded.
- Card tally text uses the word **"available"** (`{yes} available · {ifneedbe} if-need-be`), which is
  intentionally distinct from the desktop table header caption **"yes"** (`{yes} yes · {ifneedbe}
  if-need-be`), so `getByText("... yes · ...")` keeps matching only the table.
- `page.test.ts` is a DB-backed FULL SSR render (`renderToStaticMarkup`) of the whole admin page —
  it renders ResultsGrid AND BookItControl. The unfiltered mobile cards will surface participant
  names the current test asserts absent; that one assertion must be re-scoped (Task 1).
</key_facts>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: ResultsGrid mobile date-cards (highest value) + tests</name>
  <files>src/components/results-grid.tsx, src/components/results-grid.test.tsx, src/app/a/[adminUrlId]/page.test.ts</files>
  <behavior>
    Component (results-grid.tsx):
    - `formatDateWithTimeShort` added to the existing `@/lib/format-date` import; a module helper
      `optionLabelShort(opt: GridOption)` returns `formatDateWithTimeShort(opt.date, opt.startTime ? opt.startTime.slice(0,5) : null)` (condensed sibling of `optionLabel`).
    - Desktop table made desktop-only: `hidden sm:block` prepended to the scroll-container `<div>`
      (currently `max-h-[70vh] overflow-x-auto overflow-y-auto rounded-xl border` with `style={SCROLL_FADE_STYLE}`).
      Table markup, sticky classes, scroll-fade, `displayOptions` usage, and the React-19
      derived-`visible` filter logic are byte-for-byte unchanged.
    - Filter block made desktop-only: the wrapper `<div className="flex flex-col gap-3">` enclosing
      the two `<select>`s, the descriptor chip, and the `aria-live` region becomes
      `hidden sm:flex flex-col gap-3`. The "Best day so far" summary block and the zero-participants
      early return are LEFT UNTOUCHED (summary stays visible on both breakpoints).
    - New `<ul data-testid="results-cards-mobile" className="flex flex-col gap-3 sm:hidden">` added as
      a sibling immediately AFTER the table wrapper, still inside the outer `flex flex-col gap-4`.
      Maps `displayOptions` (SAME best-first order). Per `opt` at `index`: `r = resultByOption.get(opt.id)`,
      `isBest = r?.isBest ?? false`. Renders an `<li>` (`rounded-xl border p-4`, +`bg-emerald-50` when best)
      with (a) `<BestDayBadge />` when best + `optionLabelShort(opt)` in `text-base font-semibold`;
      (b) `<p className="text-sm text-muted-foreground">` = `{r?.yes ?? 0} available · {r?.ifneedbe ?? 0} if-need-be`
      (middot U+00B7, word "available"); (c) `<details open={isBest && index === 0}>` with
      `<summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold">Who's available</summary>`
      and an inner `<ul className="mt-2 flex flex-col gap-2">` over ALL `participants` (props order,
      NOT the filtered `visible`): each `<li>` shows `p.name` (`text-sm`) + a chip from
      `normalizeVoteState(p.votes[opt.id])` → `STATE_META[state]` = `<span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold whitespace-nowrap", meta.className)}>` with `<meta.Icon aria-hidden className="size-4" />` + `meta.label`. NO email is ever rendered.
    - EDGE WFM-03: `open` is gated on `isBest && index === 0` (NOT `isBest` alone) so that with co-best
      TIES only the FIRST best card opens; with no best, nothing opens. Do NOT open every best card.
    - EDGE WFM-01/02: the zero-participants early return (unchanged) means the mobile `<ul>` is never
      reached for empty input. Chips route missing/unrecognized votes through `normalizeVoteState`
      (→ "Not available"), mirroring the table body — never blank, never throw.

    Tests (results-grid.test.tsx) — the desktop table is no longer the only render surface, so scope
    the following existing assertions to `within(screen.getByRole("table"))`:
    - "renders the 'Best' badge only on the strict yes-leader column": `getAllByText("Best")` → within table (length 1).
    - "renders 'Best' on BOTH co-leading columns": `getAllByText("Best")` → within table (length 2).
    - "renders 'Best' AND its supporting tally together...": `getByText("Best")` → within table.
    - co-best column-order test: its final `getAllByText("Best")` → within table (length 2). (The `within(headers[N])` lines already scope and stay.)
    - zero-match test: `queryByText("Alex")` → within table (null).
    - client-filter describe block ("defaults...", "hides non-matching rows", "filters by status standalone", "tracks the FINAL selection", "'Clear filter' resets"): every Alex/Sam/Jordan `getByText`/`queryByText` → within table.
    Leave unchanged: assertions already scoped `within(table)`, the "{yes} yes · {ifneedbe} if-need-be"
    tally-format test, "renders NO 'Best' badge" / "No clear best day yet" / empty-state / fetch tests,
    the descriptor "{n} of {total} participants" assertions.
    ADD a describe block "ResultsGrid mobile date-cards" (`const mobile = screen.getByTestId("results-cards-mobile")`):
    - best-first + best badge: `mobile.querySelectorAll(":scope > li")` length 3; first card textContent
      contains "Best" and matches /Jul 12/; `within(mobile).getAllByText("Best")` length 1;
      `within(mobile).getByText("2 available · 1 if-need-be")` present.
    - per-participant icon+label chips: `within(mobile)` finds Alex, Sam AND Jordan (present regardless
      of the desktop filter); for each of ["Available","If-need-be","Not available"],
      `within(mobile).getAllByText(label)` non-empty and each chip has an `svg` icon.
    - default-open first best only: `mobile.querySelectorAll("details")` length 3; `[0].open===true`, `[1].open===false`, `[2].open===false`.
    - EDGE WFM-03 co-best: render a fixture where TWO dates tie for best (reuse the shape from
      "renders co-best (tied) days..."); assert within the mobile container `getAllByText("Best")`
      length 2 (both best cards badged) BUT `querySelectorAll("details")[0].open===true` and
      `[1].open===false` (only the FIRST best card open).
    - EDGE WFM-01/02 no best → nothing open: render the no-yes-vote participant shape (as in
      "No clear best day yet"); every `<details>` in the mobile container has `.open===false`.

    Test (page.test.ts) — "renders the Results section..." test: the mobile date-cards are unfiltered
    by design, so "Jordan Vale" now appears in the SSR HTML (If-need-be chip on the best-day card).
    Replace `expect(html).not.toContain("Jordan Vale")` with a table-scoped negative plus a positive
    mobile assertion: `const tableHtml = html.slice(html.indexOf("<table"), html.indexOf("</table>") + 8);`
    then `expect(tableHtml).not.toContain("Jordan Vale");` (desktop table still default-filters him) and
    `expect(html).toContain("Jordan Vale");` (present in the unfiltered mobile date-card). Keep the
    canary-email `not.toContain("alex-canary@example.com")` assertion — mobile cards render names only.
  </behavior>
  <action>
Implement the ResultsGrid mobile date-card branch exactly as described in `<behavior>`: reuse
`displayOptions` (best-first) and `resultByOption` verbatim — NO new ranking, NO `computeResults`, NO
server action, NO new state, and do NOT touch the derived-`visible` desktop filter logic (preserve the
React-19 no-desync invariant documented at the top of the file). The mobile list reads `participants`
directly (unfiltered), because the locked design makes the participant-row filter desktop-only.
Preserve every existing table invariant (sticky column/header, scroll-fade, best-first order,
empty-state early return, aria-live). Disclosures are native `<details>`/`<summary>` (keyboard + SR
operable); the summary is `min-h-11`; primary card text is `text-sm`/`text-base`, never `text-xs`.
Gate `open` on `index === 0 && isBest` (edge WFM-03) so co-best ties open exactly one card.
Then update results-grid.test.tsx and page.test.ts per `<behavior>` — scope table-oriented assertions to
`within(getByRole("table"))`, add the mobile-card assertions scoped to the `results-cards-mobile`
testid (including the co-best-one-open and no-best-none-open edge tests), and re-scope the page-test
Jordan assertion. Commit atomically:
`feat(quick-260703-wfm): mobile date-centric results cards on admin page`.
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test</automated>
  </verify>
  <done>Full DB-backed suite green. ResultsGrid renders a `hidden sm:block` table AND a `sm:hidden`
  `results-cards-mobile` list (best-first, per-card `<details>`, first best open even under ties,
  icon+label chips via normalizeVoteState, all participants, no email). Desktop table/filter markup
  unchanged. page.test.ts Jordan assertion re-scoped; canary-email assertion still passing.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: BookItControl mobile collapse-to-suggested + tests</name>
  <files>src/components/book-it-control.tsx, src/components/book-it-control.test.tsx</files>
  <behavior>
    Component (book-it-control.tsx):
    - `import { cn } from "@/lib/utils";` added; `const [showAllDates, setShowAllDates] = useState(false);`.
    - `const preselectedOption = options.find((o) => o.id === preselectedId);` and
      `const preselectedIsBest = preselectedOption ? bestIds.has(preselectedOption.id) : false;`.
    - Inside `<fieldset>`, immediately after `<legend>` and before the radio grid `<div>`, a mobile-only
      summary row rendered only when `preselectedOption` exists (guards the empty-options edge, WFM-04):
      `<div className={cn("flex flex-wrap items-center gap-2 sm:hidden", showAllDates && "hidden")}>` with
      `<span className="text-base font-semibold">` = `formatDateWithTimeShort(preselectedOption.date, preselectedOption.startTime ? preselectedOption.startTime.slice(0,5) : null)`; the existing "Suggested"
      badge (`inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800`) ONLY when `preselectedIsBest` (parity with the radio list —
      no badge when nothing is best); and
      `<Button type="button" variant="outline" className="min-h-11" onClick={() => setShowAllDates(true)}>Change date</Button>`.
    - Radio grid wrapper `<div>` className changed from the literal
      `"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2"` to
      `cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5", showAllDates ? "grid" : "hidden sm:grid")`
      (row gap bumped to `gap-2.5`; mobile visibility toggled). The radio `<input name="winningOptionId" value defaultChecked disabled>` markup inside is UNCHANGED and always rendered.
    - The two-step confirm disclosure (`!showConfirm` reveal `type="button"` / amber panel `type="submit"` confirm / "Keep poll open") and the desktop radio appearance are unchanged.

    Tests (book-it-control.test.tsx):
    - "pre-checks the best option and badges it 'Suggested'": `getByText("Suggested")` now matches twice
      (radio badge + mobile summary badge) → change to `expect(screen.getAllByText("Suggested").length).toBeGreaterThan(0);`. Radio value/checked assertions unchanged.
    - "falls back ... no option is best": `queryByText("Suggested")` stays null (neither surface badges) — no change.
    - ADD "keeps the radios in the DOM while collapsed (winningOptionId still submits)": render opt-b best;
      `getAllByRole("radio")` length 2, every radio `.name === "winningOptionId"`, `radios[1].checked === true`
      in the default collapsed state; `getByRole("button", { name: "Change date" })` has `type` "button".
    - ADD "'Change date' reveals the list without remounting the radios or losing the preselection"
      (edge WFM-05 idempotency): click "Change date"; `getAllByRole("radio")` still length 2 and
      `radios[1].checked === true` (display toggle, not unmount — preselection survives re-render);
      booking still two-step (`queryByRole` confirm null, `getByRole "Book this date"` present).
    - Leave the two existing two-step-confirm tests unchanged (the new "Change date" name is distinct).
  </behavior>
  <action>
Implement the BookItControl mobile collapse exactly as in `<behavior>`. LOAD-BEARING: the collapse is a
`display` toggle on the radio-grid wrapper ONLY — never conditionally unmount the radios — so
`name="winningOptionId"`, `value`, and the best/first `defaultChecked` preselection still submit while
the list is visually collapsed on mobile, and re-expanding (a re-render) never resets the uncontrolled
selection. The "Change date" button is `type="button"` and only calls `setShowAllDates(true)` (never
submits; repeated taps are idempotent — one-way reveal by design, no re-collapse control). Preserve
every existing invariant: the "Suggested" badge, the two-step confirm (`type=button` reveal /
`type=submit` confirm), the desktop radio grid appearance, and the best/first preselection fallback.
Then update the tests per `<behavior>`. Remember jsdom renders both branches (Tailwind classes inert) —
assert on presence/structure, not media-query visibility. Commit atomically:
`feat(quick-260703-wfm): collapse Book-it mobile picker to suggested date + Change date`.
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test</automated>
  </verify>
  <done>Full DB-backed suite green. BookItControl renders a `sm:hidden` suggested-summary row + a
  `type="button"` "Change date" toggle; the radios are always present (`name="winningOptionId"`,
  preselected checked) whether collapsed or expanded; two-step confirm + desktop appearance unchanged;
  row gap is `gap-2.5`.</done>
</task>

<task type="auto">
  <name>Task 3: Echo chip text polish + final build/suite gate</name>
  <files>src/app/a/[adminUrlId]/page.tsx</files>
  <action>
In `CandidateChip` (page.tsx), change the `<li>` className token `text-xs` → `text-sm`, keeping every
other class and leaving the full date in `title`/`aria-label` untouched. This is the only change to
page.tsx (presentation-only; note it is an intentional ALL-breakpoint delta per edge WFM-06, not a
regression). Then run the final gates: `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test` (full suite green) AND
`DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm run build` (green). No migration,
no deploy. Commit atomically: `feat(quick-260703-wfm): bump admin echo chip label text-xs to text-sm`.
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test && DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm run build</automated>
  </verify>
  <done>CandidateChip label is `text-sm`. Full DB-backed test suite AND production build both green.</done>
</task>

</tasks>

<edge_resolutions>
Edge-probe family run against this plan's NEW requirements (WFM-01..07). 22 deterministic rows +
manual prohibition-probe. Resolutions (source = the six files in `<context>`):

- **WFM-03 adjacency/ordering (co-best default-open)** — REAL, folded in. `open` gated on
  `index === 0 && isBest`, so multiple co-best cards each show a Best badge but only the FIRST opens.
  New mobile test asserts 2 badges / 1 open. Ordering among co-best is `displayOptions` (stable
  chronological, per results.ts / results-grid.tsx line 159-168) — the single ordering source.
- **WFM-01/02 empty (zero / single / missing vote)** — REAL, folded in. Zero participants → shared
  early return (results-grid.tsx line 144) fires before cards compute → no table, no cards (page.test.ts
  empty test + a new mobile no-best test back this). Single option → single card. Missing/unrecognized
  vote → `normalizeVoteState` → "Not available" chip (vote-state.ts line 48-50), never blank/throw.
- **WFM-01 adjacency (two layouts coexist in the DOM)** — REAL, handled by test scoping + distinct
  tally wording ("available" vs "yes"); full-suite green is the backstop for any residual collision.
- **WFM-02 ordering (participant list order in disclosure)** — participants render in props order
  (getResultsForPoll order), matching the table body row order. Stable.
- **WFM-02/07 encoding (name/label byte-vs-grapheme)** — DISMISS: no new length/equality logic;
  names and labels render verbatim as text exactly like the existing table `<th>{p.name}</th>` and the
  existing chip labels. No normalization introduced.
- **WFM-04 empty (options empty) / adjacency (co-best preselect)** — guarded by `preselectedOption ?`
  conditional; preselection reuses the unchanged existing `preselectedId` logic (book-it-control.tsx
  line 50-58). No new crash surface vs today.
- **WFM-05 idempotency/concurrency (re-expand / repeat taps / pending submit)** — REAL (idempotency),
  folded into test (f): re-render via display toggle preserves uncontrolled `defaultChecked` selection;
  `setShowAllDates(true)` is idempotent; no async race (client boolean, mirrors existing `showConfirm`).
- **WFM-06 unclassified (must-NOT: "desktop unchanged")** — REAL prohibition-probe finding, folded in.
  Two LOCKED polish items DO change desktop at all breakpoints: Book-it radio row gap `gap-2→gap-2.5`
  and CandidateChip `text-xs→text-sm`. These are the ONLY authorized desktop-visible deltas; documented
  so the post-execution desktop screenshot check does not flag them as regressions. Everything else
  desktop (table/sticky/scroll-fade/filter at `sm:`, Book-it radio appearance) is byte-identical:
  `hidden sm:block`/`hidden sm:flex`/`hidden sm:grid` all resolve to the ORIGINAL display at `sm`+.
- **Prohibition — email leak via mobile cards** — DISMISS/covered: `ResultsParticipant` carries no
  email field (results.ts line 16-20); cards render `p.name` only; page.test.ts canary assertion is the
  backstop (T-wfm-01).
- **Prohibition — losing the desktop aria-live on mobile** — accepted: the participant-row filter is
  desktop-only by locked design; the mobile card surface has no filter interaction to announce and is
  fully keyboard/SR operable via native `<details>`. Desktop keeps its aria-live unchanged.
</edge_resolutions>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| DB rows → admin SSR HTML | participant names/votes render on the admin page; participant EMAILs must never cross into HTML (SPEC Prohibition #1) |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-wfm-01 | Information Disclosure | ResultsGrid mobile date-cards | mitigate | Cards render `p.name` + `normalizeVoteState(p.votes[opt.id])` ONLY — no email prop reaches the component; the page.test.ts canary-email `not.toContain("alex-canary@example.com")` assertion stays and must pass. |
| T-wfm-02 | Tampering | Book-it collapse | mitigate | Collapse is a `display` toggle only; radios stay mounted so `winningOptionId` cannot be silently dropped/altered by the disclosure. Verified by the "radios always in DOM / preselected checked" test. |
| T-wfm-SC | Tampering | npm/pip/cargo installs | accept | No packages installed — pure presentation + one client-state hook using existing deps (react, `cn`, lucide, existing lib helpers). |
</threat_model>

<verification>
- `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test` → full suite green
  (results-grid.test.tsx, book-it-control.test.tsx, page.test.ts, results.test.ts).
- `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm run build` → green.
- Desktop (`sm:`+) unchanged EXCEPT the two locked deltas (Book-it row gap gap-2→gap-2.5, echo chip
  text-xs→text-sm — edge WFM-06). No change to table/sticky/scroll-fade/filter logic; radio markup untouched.
- No server action / query / `computeResults` / three-token / data-flow change; no migration; no deploy.
</verification>

<success_criteria>
- Mobile ResultsGrid = `sm:hidden` best-first date-card list (reusing `displayOptions`/`resultByOption`)
  sibling to the `hidden sm:block` table; per-card native `<details>` (first best open, exactly one even
  under ties), icon+label per-participant chips via `normalizeVoteState`, `min-h-11` summary, `text-sm`+
  body copy.
- Mobile BookItControl = suggested-date summary + `type="button"` "Change date" toggle; radios always
  mounted (`winningOptionId` submits collapsed; preselection survives re-expand); two-step confirm +
  desktop appearance preserved; row gap `gap-2.5`.
- CandidateChip echo label `text-sm`.
- All edge-probe findings (WFM-01..07) resolved or dismissed with source-backed reasons.
- Full DB-backed suite + production build green; 3 atomic commits.
</success_criteria>

<output>
Create `.planning/quick/260703-wfm-mobile-results-as-date-centric-cards-boo/260703-wfm-SUMMARY.md` when done.
</output>

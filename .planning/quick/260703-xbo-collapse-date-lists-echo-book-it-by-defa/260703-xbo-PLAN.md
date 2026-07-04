---
phase: quick-260703-xbo
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/a/[adminUrlId]/page.tsx
  - src/components/book-it-control.tsx
  - src/components/book-it-control.test.tsx
  - src/components/results-grid.tsx
  - src/components/results-grid.test.tsx
autonomous: true
requirements: [XBO-01, XBO-02, XBO-03, XBO-04]

must_haves:
  truths:
    - "Admin page renders Book-it immediately after Results and before the Share/Invite section (XBO-01)."
    - "The candidate-date echo is collapsed by default (native <details>, no `open`), expands on click/Enter, and shows the same month-grouped/short-label chips inside (XBO-02)."
    - "Book-it shows only the suggested date + 'Change date' by default on desktop AND mobile; the full radio list is hidden on all breakpoints until 'Change date' is clicked (XBO-03)."
    - "Booking works while collapsed — radios stay in the DOM, winningOptionId still submits the preselected date, and the two-step confirm disclosure is intact (XBO-03)."
    - "Mobile results cards show only dates with votes by default; zero-vote dates appear only after tapping 'Show all dates (+N)'; no toggle renders when every date has votes (XBO-04)."
    - "The best day is never hidden behind the mobile toggle (best requires yes>0, so it is always a voted date) (XBO-04)."
    - "When participants exist but NO date has any vote (all zero-vote), all cards render and NO toggle renders — the mobile list is never empty-with-a-lone-toggle (edge XBO-04-empty)."
  artifacts:
    - path: "src/app/a/[adminUrlId]/page.tsx"
      provides: "Book-it moved after Results + candidate-date echo wrapped in a collapsed <details>"
      contains: "<details"
    - path: "src/components/book-it-control.tsx"
      provides: "Collapse-to-suggested on ALL breakpoints (radio grid hidden until 'Change date')"
      contains: "showAllDates ? \"grid\" : \"hidden\""
    - path: "src/components/results-grid.tsx"
      provides: "Mobile zero-vote-date toggle (Show all dates)"
      contains: "aria-expanded"
    - path: "src/components/book-it-control.test.tsx"
      provides: "Collapse-on-all-breakpoints assertions (green)"
    - path: "src/components/results-grid.test.tsx"
      provides: "Zero-vote-toggle assertions (green)"
  key_links:
    - from: "src/components/book-it-control.tsx"
      to: "closePoll form submit"
      via: "radios always in DOM (display toggle only)"
      pattern: "name=\"winningOptionId\""
    - from: "src/app/a/[adminUrlId]/page.tsx"
      to: "candidate-date echo"
      via: "native <details>/<summary> (keyboard + SR free)"
      pattern: "<summary"
    - from: "src/components/results-grid.tsx"
      to: "zero-vote mobile cards"
      via: "button aria-expanded toggle over a showZeroVote useState"
      pattern: "aria-expanded"
---

<objective>
Four presentation-only admin-page UX tweaks (desktop + mobile), implemented exactly as locked. No server action, query, data-flow, computeResults, or three-token change.

- **XBO-01** — Reorder Book-it after Results (page.tsx): move the ENTIRE `{isClosed ? (...) : (...)}` Book-it block to sit immediately after the Results `<Card>` and before the "Share your poll" `<div>`. Pure move.
- **XBO-02** — Collapse the candidate-date echo by default (page.tsx): wrap the `{multiMonth ? (...) : (...)}` chip block in a native `<details>` closed by default, with a tappable `<summary>` reading `Candidate dates ({options.length})`.
- **XBO-03** — Book-it collapsed by default on ALL breakpoints (book-it-control.tsx): the suggested-date summary shows on desktop too; the full radio list is hidden on every breakpoint until "Change date". Every load-bearing invariant preserved.
- **XBO-04** — Hide zero-vote dates in the MOBILE results cards behind a "Show all dates (+N)" toggle (results-grid.tsx). Desktop table keeps all columns.

Purpose: reduce vertical noise on the admin page and put the decision-relevant surfaces (results, then booking) first, without touching any data path or a11y guarantee.
Output: edits to page.tsx, book-it-control.tsx (+ test), results-grid.tsx (+ test); three atomic commits; full suite + build green. No migration, no deploy (orchestrator screenshots + deploys after).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/a/[adminUrlId]/page.tsx
@src/components/book-it-control.tsx
@src/components/book-it-control.test.tsx
@src/components/results-grid.tsx
@src/components/results-grid.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Reorder Book-it after Results + collapse the candidate-date echo (page.tsx)</name>
  <files>src/app/a/[adminUrlId]/page.tsx</files>
  <action>
Two edits to the admin RSC, presentation only. Do not touch any query, action, branch, or the Book-it block's internals.

**XBO-01 — reorder (pure move):** Cut the ENTIRE Book-it region — its leading comment block (currently ~lines 262-265, the "Book it (FNL-01/02/03)…" comment) PLUS the whole `{isClosed ? ( ...finalized Card... ) : ( ...open <div> + BookItControl... )}` expression (currently ~lines 266-297) — and paste it so it sits IMMEDIATELY AFTER the Results `</Card>` (the ResultsGrid card that closes ~line 167) and IMMEDIATELY BEFORE the "Share your poll" `<div className="flex flex-col gap-4">` (currently ~line 169). The moved block must remain a DIRECT child of `<main>` (a sibling of the Results Card and the Share `<div>`) — do NOT nest it inside either. Both ternary branches move together as one expression. Final section order inside `<main>`: header → candidate-date echo → Results `<Card>` → Book-it block → "Share your poll" + invite. Change nothing inside either branch (finalized Card copy, BookItControl props, the double-wrapping comment TV3-10 all stay verbatim).

**XBO-02 — collapse the echo (native <details>, RSC, no client JS):** Add `import { ChevronRight } from "lucide-react";` with the other imports (this file currently has no lucide import — add one). Wrap the ENTIRE candidate-date echo — the whole `{multiMonth ? ( ...month-grouped sections... ) : ( ...flat <ul>... )}` block (currently ~lines 132-155, keep its leading comment) — inside a SINGLE native `<details>` element that is CLOSED by default (do NOT add the `open` attribute; do NOT create a second `<details>` per ternary branch). Give the `<details>` `className="group flex flex-col gap-2"`. As the first child add a `<summary>` styled as a tappable toggle row: `className="flex min-h-11 cursor-pointer select-none list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden"`. Inside the summary put a rotating chevron `<ChevronRight aria-hidden className="size-4 shrink-0 transition-transform group-open:rotate-90" />` then the label text `Candidate dates ({options.length})`. Place the existing `{multiMonth ? (...) : (...)}` chip block AFTER the `<summary>`, unchanged (month-grouping, `CandidateChip`, short-visible-label + full-date `title`/`aria-label` all stay exactly as they are). Native `<details>` gives collapsed-by-default, click/Enter expand, keyboard focus, and SR disclosure semantics for free — no `useState`, no `"use client"`. Breakpoint-agnostic (desktop + mobile).

Preserve everything else byte-for-byte: `groupByMonth`, `CandidateChip`, the Results Card, all Share/Admin/Subscribe/Invite cards, `emailConfigured`/`showInvite`, and every timezone-safe formatter call.
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm run build</automated>
    Structure checks: `grep -n "ChevronRight\|<details\|<summary\|Candidate dates (" src/app/a/[adminUrlId]/page.tsx` (all present; exactly one `<details>` / one `<summary>` in the echo). Order check: `grep -n "Book it\|Poll finalized\|Share your poll" src/app/a/[adminUrlId]/page.tsx` — the Book-it lines precede the "Share your poll" heading. Confirm the moved block is a sibling of the Results Card and Share `<div>` (indented one level under `<main>`, not inside another element).
  </verify>
  <done>`npm run build` green (RSC compiles the reordered/wrapped JSX). Book-it renders after Results and before Share/Invite as a direct `<main>` child with both ternary branches intact; the candidate-date echo is a single native `<details>` (no `open`) with a `Candidate dates ({options.length})` `<summary>`; no query/action/branch/formatter changed. Full suite stays green (final gate). Commit atomically: `feat(260703-xbo): reorder book-it after results + collapse candidate-date echo`.</done>
</task>

<task type="auto">
  <name>Task 2: Book-it collapses to suggested date on all breakpoints (book-it-control.tsx + test)</name>
  <files>src/components/book-it-control.tsx, src/components/book-it-control.test.tsx</files>
  <action>
**XBO-03 — component (book-it-control.tsx):** Two className changes plus comment cleanup. Preserve EVERY load-bearing invariant.

1. Suggested-date summary div (currently ~lines 84-88): REMOVE the `sm:hidden` token so it renders on desktop too. Its className becomes `cn("flex flex-wrap items-center gap-2", showAllDates && "hidden")` — keep `showAllDates && "hidden"` so it disappears once expanded. This is now the default collapsed view on every breakpoint. Keep the `preselectedOption ?` guard, the short-label span, the conditional "Suggested" badge, and the `type="button"` "Change date" button (`className="min-h-11"`, `onClick={() => setShowAllDates(true)}`) exactly as they are.
2. Radio grid wrapper (currently ~lines 119-123): change the ternary `showAllDates ? "grid" : "hidden sm:grid"` → `showAllDates ? "grid" : "hidden"` so the full radio list is hidden on ALL breakpoints until "Change date". Leave the base class string `"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2.5"` unchanged.
3. Update the now-stale comments (the `showAllDates` state comment ~lines 51-54, the "MOBILE-ONLY suggested-date summary (sm:hidden)" comment ~lines 78-82, and the "submits while collapsed on mobile" note ~line 118) to say the picker collapses to the suggested date on ALL breakpoints, not mobile-only.

State-matrix guarantee (edge XBO-03-adjacency): collapsed (`showAllDates===false`) → summary shows, grid `hidden`; expanded (`showAllDates===true`) → summary `hidden`, grid shows. Exactly one is visible; never both, never neither.

PRESERVE (do not alter): radios ALWAYS in the DOM (display toggle only — `winningOptionId`/`defaultChecked` preselect keeps submitting while collapsed so "Book this date" books the suggested date without expanding); `name="winningOptionId"`, `value`, `defaultChecked={opt.id === preselectedId}`, the per-radio "Suggested" badge; the `preselectedId`/`preselectedIsBest` derivation (co-best tie → first-best; no best → first candidate); the two-step confirm disclosure ("Book this date" `type="button"` reveals the amber panel, "Confirm and close poll" `type="submit"` is the ONLY control that fires `closePoll`, "Keep poll open" collapses with no side effect); "Change date" stays `type="button"`; tap targets ≥44px (`min-h-11`/`h-11`).

**XBO-03 — test (book-it-control.test.tsx):** The existing four describe blocks should still pass unchanged (jsdom does not apply Tailwind, so `hidden`/`sm:*` classes never hide elements — radios, "Change date", and both "Suggested" badges stay queryable exactly as today; do not weaken any existing behavioral assertion). ADD one test that ENCODES the all-breakpoints contract via `classList.contains` TOKEN checks (NOT substring — `sm:grid-cols-2` contains the substring "sm:grid", so only exact-token `classList.contains("sm:grid")` is reliable):
- Render with a best option preselected. Locate the radio-grid wrapper via the first radio: `screen.getAllByRole("radio")[0].closest("label")?.parentElement` (radio → `<label>` → grid `<div>`).
- Assert the collapsed wrapper `classList.contains("hidden") === true` and `classList.contains("sm:grid") === false` (hidden on ALL breakpoints, no `sm:` auto-reveal).
- Assert the suggested-date summary container (`screen.getByText("Change date").closest("div")`) has `classList.contains("sm:hidden") === false` (shows on desktop too).
- `fireEvent.click(screen.getByRole("button", { name: "Change date" }))`, then assert the wrapper `classList.contains("hidden") === false` (reveal drops `hidden`, appends `grid`), the same 2 radios are still present (no remount), and `radios[1].checked` (best preselection) survives.
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npx vitest run src/components/book-it-control.test.tsx</automated>
  </verify>
  <done>Book-it renders the suggested-date summary + "Change date" as the default collapsed view on all breakpoints; the radio grid ternary is `showAllDates ? "grid" : "hidden"`; stale mobile-only comments updated. All BookItControl tests green including the new collapse-on-all-breakpoints test; radios stay in the DOM with `name="winningOptionId"` preselected while collapsed; two-step confirm untouched. Commit atomically: `feat(260703-xbo): collapse book-it to suggested date on all breakpoints`.</done>
</task>

<task type="auto">
  <name>Task 3: Hide zero-vote dates in mobile results cards behind a toggle (results-grid.tsx + test)</name>
  <files>src/components/results-grid.tsx, src/components/results-grid.test.tsx</files>
  <action>
**XBO-04 — component (results-grid.tsx), MOBILE CARD BRANCH ONLY.** The `hidden sm:block` desktop `<table>`, the desktop-only filter, the best-day summary, `displayOptions`, `resultByOption`, and all computation stay UNCHANGED. Reuse `resultByOption` — no new computation, no re-rank, no `computeResults`.

1. Add `const [showZeroVote, setShowZeroVote] = useState(false);` alongside the existing `useState` declarations (near `announcement`).
2. After `displayOptions` is derived (~line 177), partition it (best-first order preserved within each group): `votedOptions` = options where `(resultByOption.get(o.id)?.yes ?? 0) > 0 || (resultByOption.get(o.id)?.ifneedbe ?? 0) > 0`; `zeroVoteOptions` = the complement (`yes === 0 && ifneedbe === 0`). These predicates are exact complements — every date lands in exactly one group. The best day always has yes votes, so it is ALWAYS in `votedOptions` (never hidden).
3. In the `sm:hidden` mobile `<ul data-testid="results-cards-mobile">` (currently ~lines 474-529): factor the per-date card `<li>` into a single inline render (local helper or shared map body) so voted and zero-vote cards render identically. Add `data-testid="result-date-card"` to each date-card `<li>` so tests count visible cards without matching the participant `<li>`s inside each card's `<details>`. Preserve the card internals exactly: the `isBest` badge, `optionLabelShort`, the `{r?.yes ?? 0} available · {r?.ifneedbe ?? 0} if-need-be` tally, and the "Who's available" `<details>` listing every participant with icon+label chips. For default-open gating, replace the `index === 0` form with the partition-independent equivalent `open={isBest && opt.id === displayOptions[0]?.id}` (displayOptions[0] is always the single leftmost/first-best card; zero-vote cards are never best → never open). Preserves EDGE WFM-03 (co-best tie → only the first best opens) and WFM-01/02 (no best → none open).
4. Render logic inside the `<ul>` (edge XBO-04-empty handled — the mobile list is NEVER an empty list with only a toggle):
   - Compute `const hasVoted = votedOptions.length > 0;` and `const showToggle = hasVoted && zeroVoteOptions.length > 0;`.
   - DEFAULT cards to render = `hasVoted ? votedOptions : displayOptions` (when NO date has any vote, show ALL cards — nothing meaningful to collapse toward). Map them → date-card `<li>`s.
   - Render the toggle ONLY when `showToggle`: wrap it in an `<li>` (valid `<ul>` child) containing `<button type="button" aria-expanded={showZeroVote} onClick={() => setShowZeroVote((v) => !v)} className="min-h-11 ...">` reading `` `Show all dates (+${zeroVoteOptions.length})` `` collapsed and `Show fewer` expanded. Give it a visible bordered/`rounded-lg` focus+hover affordance consistent with the file; ≥44px tall (`min-h-11`).
   - When `showToggle && showZeroVote`, map `zeroVoteOptions` → date-card `<li>`s below the voted ones (best-first order preserved).
   - When `zeroVoteOptions.length === 0` (all voted) OR `!hasVoted` (none voted) → render NO toggle. Keep the `<ul>`'s `data-testid="results-cards-mobile"` and `className="flex flex-col gap-3 sm:hidden"`.

Do NOT touch: color-never-only-signal chips, `normalizeVoteState`, the zero-participants early return (fires before this branch), scroll-fade, sticky header, best-first ordering, or the desktop table (which still enumerates all `displayOptions` including zero-vote columns). No fetch / no server action / no derived-state mirror — the toggle is pure in-memory display state (D3-06 preserved; idempotent double-click round-trip; no React 19 concurrency desync).

**XBO-04 — test (results-grid.test.tsx).** In the "ResultsGrid mobile date-cards" describe block, `renderMain()` has `opt-3` as a zero-vote date (yes=0, ifneedbe=0), now hidden by default. Update the assertions that encode the old all-cards DOM, and add toggle + edge coverage. Keep every other test unchanged and verify it still passes (desktop headers/tallies including opt-3's `0 yes · 0 if-need-be`, best-first columns, filter, empty/zero-match, co-best WFM-03, no-best WFM-01/02, "lists EVERY participant" — all rely on `within(mobile)` descendant queries or `querySelectorAll("details")` which count only rendered cards, so opt-1 + opt-2 satisfy them).
- UPDATE "renders a best-first date-card per option" → DEFAULT shows only VOTED dates: `within(mobile).getAllByTestId("result-date-card")` length 2 (opt-1, opt-2); opt-1 first + badged "Best" + `/Jul 12/`; `within(mobile).getAllByText("Best")` length 1; `within(mobile).getByText("2 available · 1 if-need-be")` present; opt-3 hidden (`within(mobile).queryByText(/Jul 20/)` is null).
- UPDATE "opens ONLY the first best card by default (exactly one)" → default `mobile.querySelectorAll("details")` length is now 2; `details[0].open === true` (opt-1), `details[1].open === false` (opt-2).
- ADD "hides zero-vote dates behind a 'Show all dates' toggle": toggle = `within(mobile).getByRole("button", { name: /Show all dates \(\+1\)/ })`; assert `type="button"`, `aria-expanded === "false"`, `classList.contains("min-h-11")`; opt-3 hidden (2 cards; `queryByText(/Jul 20/)` null). `fireEvent.click(toggle)` → 3 cards; opt-3 visible (`getByText(/Jul 20/)` and `getByText("0 available · 0 if-need-be")` present); toggle `aria-expanded === "true"`, name `/Show fewer/`. Click again → back to 2 cards, `aria-expanded === "false"`, name `/Show all dates/`.
- ADD "renders NO toggle when every date has votes": options where all dates have ≥1 yes or ifneedbe (two options, both participants `yes` on both) → `within(mobile).queryByRole("button", { name: /Show all dates/ })` null; `getAllByTestId("result-date-card")` length equals the option count.
- ADD "renders ALL cards and NO toggle when no date has any vote (edge XBO-04-empty)": two options, every participant votes `no` on both (yes=0, ifneedbe=0 on all) → `within(mobile).getAllByTestId("result-date-card")` length equals the option count (nothing hidden) AND `within(mobile).queryByRole("button", { name: /Show all dates/ })` is null (no lone toggle over an empty list).
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npx vitest run src/components/results-grid.test.tsx</automated>
  </verify>
  <done>Mobile results cards show only voted dates by default; a `<button type="button" aria-expanded>` "Show all dates (+N)" toggle (min-h-11) reveals zero-vote cards below the voted ones; no toggle when all dates have votes OR when no date has any vote (all cards shown, list never empty). Best day never hidden. `resultByOption`/`displayOptions`/best-first order reused verbatim; desktop table + filter + best-day summary unchanged. All ResultsGrid tests green (updated + new). Commit atomically: `feat(260703-xbo): hide zero-vote dates in mobile results cards behind toggle`.</done>
</task>

</tasks>

<edge_cases>
Edge-probe family run against XBO-01..04 (`edge-probe.cjs` + manual prohibition-probe). Dispositions:

| Finding | Category | Disposition |
|---------|----------|-------------|
| XBO-01 pure-move drops a branch / nests wrongly | unclassified (must-NOT) | MITIGATED — plan pins "move whole ternary + comment intact, stays a direct `<main>` child"; verifier greps order + sibling placement. |
| XBO-02 accidental `open` / duplicated `<details>` per branch | unclassified (must-NOT) | MITIGATED — plan pins "closed by default (no `open`), ONE `<details>` wrapping the whole `{multiMonth ? …}`"; verifier greps exactly one `<summary>`. |
| XBO-02 empty options → "Candidate dates (0)" | empty | DISMISSED — a created poll always has ≥1 candidate date; even at 0 the render is an inert valid `<details>`, no regression. |
| XBO-03 collapsed↔expanded overlap/gap | adjacency | DISMISSED — state matrix proven exclusive (summary iff `!showAllDates`, grid iff `showAllDates`); documented + test-locked. |
| XBO-03 empty/single/null options | empty | DISMISSED — unreachable on an open poll; existing `preselectedOption ?` guard already handles it without crash; radio order unchanged. |
| XBO-03 order stability | ordering | DISMISSED — display-only change; radio order stays source/chronological; co-best preselection unchanged. |
| XBO-04 partition overlap/gap | adjacency | DISMISSED — predicates are exact De Morgan complements; every date in exactly one group; verified best is always voted. |
| XBO-04 order stability | ordering | DISMISSED — best-first order preserved within each partition (stable filter); no re-rank. |
| XBO-04 toggle idempotency | idempotency | MITIGATED — pure `useState` boolean; double-click round-trip test added. |
| XBO-04 concurrency | concurrency | DISMISSED — no I/O, no server action, no derived-state mirror (D3-06 preserved). |
| XBO-04 all-dates-zero-vote → empty list + lone toggle | empty | **MITIGATED (real finding folded in)** — when `votedOptions` is empty, render ALL cards and NO toggle (`showToggle = hasVoted && zeroVoteOptions.length > 0`); new test locks it. |
| Prohibition: best day silently hidden by the toggle | prohibition | MITIGATED — best requires yes>0 → always in `votedOptions`; must_have + logic guarantee it. |
</edge_cases>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| organizer browser → admin RSC | Existing; unchanged. No new inputs, params, or actions introduced. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-xbo-01 | Tampering | BookItControl finalize | accept | Presentation-only; the two-step confirm invariant is explicitly preserved (only `type="submit"` "Confirm and close poll" fires `closePoll`; radios stay in DOM so `winningOptionId` submits the preselected date). No new submit path. |
| T-xbo-02 | Information disclosure | ResultsGrid / admin page | accept | No new data crosses the client boundary; the mobile card partition and the `<details>` echo are pure display toggles over already-delivered props. Component still accepts no email/token prop. |
| T-xbo-SC | Tampering | package installs | accept | No package-manager installs. `ChevronRight` comes from the already-present `lucide-react` dependency. |
</threat_model>

<verification>
Run the full gate before the final commit (memory: DB-backed vitest needs `DATABASE_URL` exported; build env-validates the var's presence):

- `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test` — full suite green (no regressions; BookItControl + ResultsGrid updates included).
- `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm run build` — green (RSC/type-check compiles page.tsx reorder + `<details>` wrap).
- Three atomic commits (one per task). No migration. NO deploy — the orchestrator screenshots desktop + mobile and deploys after.
</verification>

<success_criteria>
- XBO-01: Book-it block renders immediately after Results and before the Share/Invite section, as a direct `<main>` child; block internals byte-identical (pure move).
- XBO-02: candidate-date echo is a single native `<details>` closed by default with a `Candidate dates ({options.length})` `<summary>`; expands on click/Enter; chips (month-grouping + short-label/full-aria) unchanged; no client JS; desktop + mobile.
- XBO-03: Book-it collapses to the suggested date + "Change date" on ALL breakpoints; radio grid hidden until expanded; radios always in DOM, `winningOptionId` preselected submits while collapsed; two-step confirm + Suggested badge + ≥44px targets preserved.
- XBO-04: mobile cards hide zero-vote dates behind a `<button aria-expanded>` "Show all dates (+N)" toggle (min-h-11); no toggle when all dates have votes OR when no date has any vote; best day never hidden; desktop table/filter/best-day summary + all ordering/tallies unchanged.
- Full `npm test` + `npm run build` green; no data/action/query/three-token/migration change; three atomic commits; no deploy.
</success_criteria>

<output>
Create `.planning/quick/260703-xbo-collapse-date-lists-echo-book-it-by-defa/260703-xbo-SUMMARY.md` when done.
</output>

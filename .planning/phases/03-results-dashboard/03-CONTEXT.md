# Phase 3: Results Dashboard - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn the votes already stored in Phase 2 into an organizer-facing results view on the admin page (`/a/[adminUrlId]`): a participants-as-rows × dates-as-columns grid of three-state cells, per-date yes/if-need-be tallies, best-day highlight, and a client-side sort/filter by status for a chosen date. Read-only over existing write-side data — no schema change, no participant-facing results, no email/finalize.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `03-SPEC.md` for full requirements, boundaries, acceptance criteria, Edge Coverage (20/20 resolved), and Prohibitions (2 must-NOTs).

Downstream agents MUST read `03-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `getResultsForPoll` — admin-only read of participants + their votes for the poll.
- A pure `computeResults` helper — per-date tallies + best-day ranking.
- `ResultsGrid` presentational component (participants × dates, three-state cells, per-date tallies).
- `BestDayBadge` / best-day highlight with the lexicographic ranking (yes ↓, if-need-be ↓, date ↑).
- Client-side sort/filter island (by status, for a chosen date).
- Mounting all on the admin page (`/a/[adminUrlId]`).
- Empty/degenerate states (no participants, zero-vote date, all-zero-yes, filter-matches-none).

**Out of scope (from SPEC.md):**
- Any results view on the participant page — admin-only surface (three-token model).
- Emailing / exporting / sharing results — Phase 4+.
- Finalizing / "Book it" / closing the poll — Phase 4 (FNL-*).
- Displaying participant email addresses — Phase 4 notification field only.
- Real-time / live-updating results — a page load reflects current votes.
- Percentages, charts, weighted scoring — exact integer counts only.
- Schema changes / migrations — `votes_poll_id_idx` already exists.

</spec_lock>

<decisions>
## Implementation Decisions

`--auto` mode — decisions auto-selected (recommended defaults) from SPEC + codebase scouting. Requirements are locked by SPEC.md; these are HOW-to-implement choices only.

### Data fetch & aggregation
- **D3-01:** Fetch the whole poll's results in **one admin-only read** — `getResultsForPoll(pollId)` returning participants ordered by `created_at` asc, each with a `Record<optionId, state>` of their votes (single query filtered by `poll_id`, using the existing `votes_poll_id_idx`; participant-safe columns only — **no `email`, no `edit_token`, no `admin_url_id`** per SPEC Prohibitions). Because every cell already requires all vote rows, there is **no second query** for tallies.
- **D3-02:** Compute per-date tallies (yes count, if-need-be count) and the best-day ranking in a **pure `computeResults(participants, options)` helper** (plain TypeScript, no DB). Ranking key is lexicographic **yes ↓, if-need-be ↓, date ↑**; **all** dates tied on `(yes, ifneedbe)` are flagged `isBest`; no date is `isBest` when the max yes count is 0. Rationale: the subtle tie-break belongs in a unit-testable pure function, not SQL — it is the single highest-risk correctness surface in this phase. (A SQL `GROUP BY` aggregation is the scaling alternative; deferred — unnecessary and less testable at D&D-group scale.)
- **D3-03:** Gap-fill / fallback: a missing `(participant, option)` vote, or an unrecognized `state` literal, resolves to `"no"` / `STATE_META[state] ?? STATE_META.no` at render — never throws (closes Phase 2 REVIEW #4; SPEC AC-3).

### Grid layout & rendering
- **D3-04:** Render a **semantic HTML `<table>`** — one `<tr>` per participant with the name as `<th scope="row">`, dates as `<th scope="col">` column headers carrying the formatted date + tally + best-day badge. Wrap in an `overflow-x-auto` container for mobile horizontal scroll. Rationale: a table is the correct accessible structure for a 2-D grid (screen readers announce row/column headers); avoids re-inventing grid semantics with divs.
- **D3-05:** Cells reuse the `AvailabilityGrid` **`STATE_META`** vocabulary (icon + text label per state) for visual consistency and the "color is never the only signal" invariant. Date columns render via `formatDateWithTime` on the `'YYYY-MM-DD'` string (never `new Date()`; D-11/P3), in `getOptionsForPoll` chronological order.

### Sort/filter interaction (DASH-05)
- **D3-06:** The grid is a **`"use client"` island** over server-fetched, server-aggregated data (the admin RSC fetches + runs `computeResults`, passes plain props down). A compact control = a **date selector** (the poll's dates) + a **status selector** (Available / If-need-be / Not available). Applying **filters** participant rows to those holding that status on that date (non-matching rows hidden), with a visible active-filter chip, a result count, and a **Clear** affordance; zero matches shows an explicit "No participants match" message (SPEC AC-6). Filter-hide chosen over sort-to-top because the organizer's real question is "who is available on date X". All client-side — no network round-trip.

### Best-day highlight
- **D3-07:** `BestDayBadge` = a small **"Best" pill** on winning date column header(s) plus an **emerald ring/tint** on that column, reusing the `STATE_META.yes` emerald palette. All co-leaders (tied on yes then if-need-be) get the badge; none when no date has ≥1 yes. The **"Best" text label** carries the signal so the highlight is not color-only (accessibility).

### Claude's Discretion
- Exact Tailwind class lists, whether `ResultsGrid` is one component or a grid + filter split, sticky-first-column implementation detail, and the exact badge copy — left to planner/executor, provided D3-01..07, the SPEC acceptance criteria, and the SPEC prohibitions hold.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements (read first)
- `.planning/phases/03-results-dashboard/03-SPEC.md` — Locked requirements, boundaries, acceptance criteria, Edge Coverage (20/20), Prohibitions (must-NOT email / must-NOT leak tokens). **MUST read before planning.**

### Phase scope & requirements
- `.planning/ROADMAP.md` §"Phase 3: Results Dashboard" — goal, 5 success criteria, plan hints (03-01 aggregation+grid+badge, 03-02 sort/filter).
- `.planning/REQUIREMENTS.md` — DASH-01..DASH-05 requirement text.

### Data model & platform constraints
- `.planning/research/ARCHITECTURE.md` — data model, three-token strategy, server-action/RSC patterns.
- `.planning/research/PITFALLS.md` — neon-http transaction limits, timezone footgun, Vercel Hobby function limits.
- `src/lib/db/schema.ts` — `participants` / `votes` tables; `votes_poll_id_idx` (the index Phase 3 aggregates through); `votes.state` is text (no DB CHECK).

### Reusable code
- `src/lib/db/queries.ts` — `getPollByAdminUrlId`, `getOptionsForPoll` (extend with a results read; keep participant-safe column discipline).
- `src/components/availability-grid.tsx` — `STATE_META` three-state icon+label vocabulary to reuse in read-only cells.
- `src/lib/format-date.ts` — `formatDateWithTime` (timezone-safe string formatting).
- `src/app/a/[adminUrlId]/page.tsx` — the admin RSC where the grid mounts.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getPollByAdminUrlId(adminUrlId)` (`src/lib/db/queries.ts`): already resolves the poll for the admin surface + 404s on miss — the results read hangs off `poll.id`.
- `getOptionsForPoll(pollId)`: chronological option order (date asc, NULLS FIRST) — reuse verbatim for column order.
- `STATE_META` (`availability-grid.tsx`): `{ yes, ifneedbe, no } → { label, Icon, className }`; the exact three-state visual language to reuse read-only.
- `formatDateWithTime` (`src/lib/format-date.ts`): renders `'YYYY-MM-DD'` + optional `'HH:MM'` without `new Date()`.
- shadcn `Card` / `Button` (`src/components/ui/`) for layout/controls.

### Established Patterns
- **RSC admin read → client island**: the admin page is an async RSC; interactive pieces are `"use client"` islands fed plain props (mirrors Phase 2's `AvailabilityGrid` inside the server page).
- **Participant-safe column selection**: queries select only the columns a surface needs; `admin_url_id` / `edit_token` / `email` never flow into rendered payloads (P2 + Phase 3 prohibitions).
- **Timezone-safe dates**: `date` columns are `'YYYY-MM-DD'` strings end-to-end; format via helpers, never `new Date()` (D-11/P3).
- **Dual-driver client** (`src/lib/db/index.ts`): reuse as-is; no interactive/callback transactions (neon-http) — irrelevant here (reads only).
- **Tests**: colocated `*.test.ts(x)` (vitest); DB-backed tests need `DATABASE_URL` exported (local docker `lfg-db-1` on :5432). Pure `computeResults` gets plain unit tests (no DB).

### Integration Points
- `src/lib/db/queries.ts` — add the results read helper(s).
- New `src/lib/` pure aggregation helper (`computeResults`) + colocated unit test.
- New `src/components/results-grid.tsx` (+ `BestDayBadge`) — client island.
- `src/app/a/[adminUrlId]/page.tsx` — fetch results, run `computeResults`, render the grid below the existing poll header (share links stay).

</code_context>

<specifics>
## Specific Ideas

- Reuse Phase 2's exact three-state look (emerald check / amber help-circle / muted x) so the organizer's results read matches what participants saw.
- Best-day emerald tint should echo the "Available" color — the winning day is literally "the most-available day".

</specifics>

<deferred>
## Deferred Ideas

- **SQL `GROUP BY` aggregation** (`getResultsAggregation`) — a scaling alternative to in-memory `computeResults`; revisit only if poll size ever outgrows a single cheap read (not at D&D-group scale).
- **Live-updating results** (websockets/polling) — out of scope; a page load/refresh reflects current votes.
- **CSV export / share results** — future; belongs with Phase 4 email or a later phase.
- **Percentages / charts / weighted scoring** — out of scope; this phase shows exact integer counts.
- **Participant-facing results view** — intentionally excluded (admin-only; three-token model).

None of the above are needed for the 5 locked requirements — discussion stayed within phase scope.

</deferred>

---

*Phase: 3-results-dashboard*
*Context gathered: 2026-07-01*

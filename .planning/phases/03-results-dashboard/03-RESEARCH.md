# Phase 3: Results Dashboard - Research

**Researched:** 2026-07-01
**Domain:** Read-only aggregation over existing Postgres/Drizzle data + RSC-to-client-island rendering (Next.js 16 App Router)
**Confidence:** HIGH

## Summary

This phase adds zero new runtime dependencies and zero schema changes — it is entirely new application code over data Phase 2 already writes. The three things a planner needs nailed down are: (1) the exact shape of a `getResultsForPoll` query that joins `participants` + `votes` while respecting the participant-safe column discipline already established in `queries.ts`, (2) the precise `computeResults` tie-break algorithm with its edge cases spelled out as testable code, not prose, and (3) one concrete blocker — `STATE_META` in `availability-grid.tsx` is **not exported** — that CONTEXT.md's D3-05 ("reuse `STATE_META`") depends on and the plan must account for.

**Primary recommendation:** One Drizzle `leftJoin` query (participants → votes, filtered by `participants.pollId`) returning flat rows, grouped in TS into `{ participant, votes: Record<optionId,state> }[]`; a pure `computeResults(participants, options)` function (no DB, no I/O) that both counts tallies and selects best-day winners in a single pass; extract `STATE_META` + a `normalizeVoteState` helper out of `availability-grid.tsx` into a shared module so both the write-side grid and the new read-side grid use one source of truth for the three-state vocabulary and the unrecognized-state fallback.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Results data fetch (participants + votes) | API / Backend (RSC data access, `queries.ts`) | Database | Admin RSC calls a `queries.ts` helper directly (no separate API route) — consistent with Phase 1/2 pattern of Server Components calling Drizzle directly. |
| Tally + best-day computation | API / Backend (pure TS helper, runs during RSC render) | — | Locked by D3-02: pure function, not SQL `GROUP BY` — testable in isolation, no DB round-trip. |
| Results grid rendering (table, cells, badges) | Browser / Client (hydrated island) over SSR'd markup | Frontend Server (SSR) | RSC renders the initial table server-side (fast first paint, no waterfall); the filter island hydrates client-side over the same data (D3-06). |
| Sort/filter interaction | Browser / Client | — | Explicitly "no network round-trip" (D3-06) — must be pure client-side state over props already delivered by the RSC. |
| Three-state vocabulary (icon+label) | Shared (imported by both tiers) | — | `STATE_META` must be usable by both the write-side `AvailabilityGrid` (client) and the read-side `ResultsGrid` (client island) — belongs in a tier-agnostic shared module, not trapped inside one component file. |

## User Constraints (from CONTEXT.md)

<user_constraints>
### Locked Decisions

- **D3-01:** Fetch the whole poll's results in one admin-only read — `getResultsForPoll(pollId)` returning participants ordered by `created_at` asc, each with a `Record<optionId, state>` of their votes (single query filtered by `poll_id`, using the existing `votes_poll_id_idx`; participant-safe columns only — **no `email`, no `edit_token`, no `admin_url_id`** per SPEC Prohibitions). Because every cell already requires all vote rows, there is **no second query** for tallies.
- **D3-02:** Compute per-date tallies (yes count, if-need-be count) and the best-day ranking in a **pure `computeResults(participants, options)` helper** (plain TypeScript, no DB). Ranking key is lexicographic **yes ↓, if-need-be ↓, date ↑**; **all** dates tied on `(yes, ifneedbe)` are flagged `isBest`; no date is `isBest` when the max yes count is 0.
- **D3-03:** Gap-fill / fallback: a missing `(participant, option)` vote, or an unrecognized `state` literal, resolves to `"no"` / `STATE_META[state] ?? STATE_META.no` at render — never throws (closes Phase 2 REVIEW #4; SPEC AC-3).
- **D3-04:** Render a **semantic HTML `<table>`** — one `<tr>` per participant with the name as `<th scope="row">`, dates as `<th scope="col">` column headers carrying the formatted date + tally + best-day badge. Wrap in an `overflow-x-auto` container for mobile horizontal scroll.
- **D3-05:** Cells reuse the `AvailabilityGrid` **`STATE_META`** vocabulary (icon + text label per state). Date columns render via `formatDateWithTime` on the `'YYYY-MM-DD'` string, in `getOptionsForPoll` chronological order.
- **D3-06:** The grid is a **`"use client"` island** over server-fetched, server-aggregated data (the admin RSC fetches + runs `computeResults`, passes plain props down). Control = a date selector + a status selector. Filters participant rows to those holding that status on that date; visible active-filter chip, result count, **Clear** affordance; zero matches shows "No participants match" (SPEC AC-6). All client-side.
- **D3-07:** `BestDayBadge` = a "Best" pill on winning date column header(s) plus an emerald ring/tint, reusing `STATE_META.yes` emerald palette. All co-leaders get the badge; none when no date has ≥1 yes. Text label carries the signal (not color-only).

### Claude's Discretion

Exact Tailwind class lists, whether `ResultsGrid` is one component or a grid + filter split, sticky-first-column implementation detail, and the exact badge copy — left to planner/executor, provided D3-01..07, the SPEC acceptance criteria, and the SPEC prohibitions hold.

### Deferred Ideas (OUT OF SCOPE)

- SQL `GROUP BY` aggregation (`getResultsAggregation`) — scaling alternative to in-memory `computeResults`; deferred, not needed at D&D-group scale.
- Live-updating results (websockets/polling).
- CSV export / share results.
- Percentages / charts / weighted scoring.
- Participant-facing results view.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Results grid: participants as rows, dates as columns | `getResultsForPoll` query shape (below) + `<table>` pattern in D3-04; empty-state handled at page level when `participants.length === 0` |
| DASH-02 | Each cell distinguishes 3-state availability by icon+label | Shared `STATE_META` extraction + `normalizeVoteState` gap-fill helper (below) |
| DASH-03 | Per-date yes/if-need-be tallies | `computeResults` single-pass tally (below) — counted in the same loop as best-day selection, no separate SQL `GROUP BY` per D3-02 |
| DASH-04 | Best-day highlight, lexicographic tie-break | `computeResults` best-day algorithm with edge cases worked through (below) |
| DASH-05 | Client-side sort/filter by status for a date | Client-island pattern notes (RSC→client boundary, prop serialization) below |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- Next.js 16.2.9 App Router; React 19.2.7; TypeScript 6.0.3 — RSC-first, Server Actions for writes (this phase is read-only, no Server Action needed).
- Drizzle ORM 0.45.2 with the dual-driver client (`src/lib/db/index.ts`) — **no interactive/callback transactions** on the neon-http branch; irrelevant here since this phase is reads only.
- `date` columns are `'YYYY-MM-DD'` strings end-to-end; **never** `new Date()` on a date-only value — use `formatDateWithTime` / `formatDateOnly` (D-11/P3).
- Zod validates all Server Action / form-boundary inputs — not applicable to this phase (no new mutation boundary; `computeResults` is a pure internal function, not a public boundary needing runtime validation).
- shadcn/ui components are code-copied (`src/components/ui/`), not npm packages — reuse `Card`/`Button`; no new shadcn components required for a semantic `<table>` (SPEC/D3-04 wants plain HTML `<table>`, not a shadcn DataGrid).
- Tests are colocated `*.test.ts(x)` (vitest 3.2.6); DB-backed tests require `DATABASE_URL` exported (local docker `lfg-db-1` on `:5432`); JSDOM environment via `@testing-library/react` for component tests.
- GSD workflow enforcement: file edits happen inside `/gsd-execute-phase`, not ad hoc.

## Standard Stack

No new packages this phase — 100% reuse of the existing stack. No `## Package Legitimacy Audit` is required (no `npm install` this phase).

### Core (reused, not new)
| Library | Version | Purpose | Why Standard (already in this repo) |
|---------|---------|---------|--------------------------------------|
| drizzle-orm | 0.45.2 | Query the `participants`/`votes` join | Already the project's sole ORM (`src/lib/db/queries.ts`) |
| lucide-react | ^1.22.0 | `Check`/`CircleHelp`/`X` icons for `STATE_META` | Already used by `AvailabilityGrid` |
| next | 16.2.9 | RSC admin page + client island | Already the framework |

**Installation:** None — no `npm install` required for this phase.

## Architecture Patterns

### System Architecture Diagram

```
Admin RSC (page.tsx, server)
   │
   │ 1. getPollByAdminUrlId(adminUrlId) ──► notFound() on miss (existing)
   │ 2. getOptionsForPoll(poll.id)      ──► chronological option[] (existing)
   │ 3. getResultsForPoll(poll.id)      ──► NEW: participants[] + Record<optionId,state> per participant
   │      (LEFT JOIN participants → votes, filtered by participants.pollId,
   │       ordered by participants.createdAt asc; participant-safe columns only)
   │
   ▼
computeResults(participants, options)   ── NEW pure function, runs server-side during RSC render
   │   (single pass: per-option yes/ifneedbe tallies + best-day isBest flags)
   ▼
plain serializable props { options, participants, tallies, bestOptionIds }
   │
   ▼
<ResultsGrid ...props />  ── NEW "use client" island
   │   renders semantic <table> immediately from props (D3-04/05/07)
   │   holds local useState for { selectedDate, selectedStatus } (D3-06)
   │   filters the already-rendered participant rows client-side — no fetch
   ▼
Browser (organizer sees grid + tallies + best-day badge + filter control)
```

### Recommended Project Structure

```
src/
├── lib/
│   ├── db/
│   │   └── queries.ts          # add getResultsForPoll(pollId) here (extends existing file)
│   ├── vote-state.ts           # NEW: shared STATE_META, VoteState, normalizeVoteState (extracted)
│   └── compute-results.ts      # NEW: pure computeResults(participants, options)
├── components/
│   ├── availability-grid.tsx   # existing — update to import STATE_META from lib/vote-state.ts
│   ├── results-grid.tsx        # NEW: "use client" table + filter island
│   └── best-day-badge.tsx      # NEW (or inlined in results-grid.tsx per "Claude's Discretion")
└── app/a/[adminUrlId]/page.tsx # existing — add getResultsForPoll + computeResults + <ResultsGrid />
```

### Pattern 1: `getResultsForPoll` — one LEFT JOIN, grouped in TS

**What:** A single Drizzle query joining `participants` to `votes`, filtered by poll, grouped into a nested shape in application code (Drizzle does not auto-nest joined rows — that grouping step is manual, same as any relational join library without a `with:` relational-query API in play here; `queries.ts` uses the plain query builder throughout, not `db.query.*`, so staying consistent means grouping flat rows manually).

**When to use:** Exactly this phase's one read.

**Example (consistent with existing `queries.ts` conventions — `eq`/`asc`/`and` from `drizzle-orm`, participant-safe column list, colocated JSDoc explaining the security invariant like the existing helpers do):**

```typescript
// src/lib/db/queries.ts — add below getVotesForParticipant
import { and } from "drizzle-orm"; // add to existing eq/asc/sql import

/**
 * Admin-only results read (DASH-01..04). Returns every participant for the
 * poll (ordered by createdAt asc — submission order) with a
 * Record<optionId, state> of their votes. Selects participant-safe columns
 * only: id/name/createdAt — NEVER email/editToken/adminUrlId (SPEC
 * Prohibitions). A participant with zero vote rows still appears with an
 * empty votes record; computeResults/ResultsGrid gap-fill missing entries to
 * "no" (D3-03).
 *
 * Single query: LEFT JOIN so participants with no votes yet still appear.
 * The join condition includes votes.pollId (redundant with participants.pollId,
 * both denormalized to the same poll) so the planner can use votes_poll_id_idx
 * as an access path in addition to votes_participant_id_idx.
 */
export async function getResultsForPoll(pollId: string) {
  const rows = await db
    .select({
      participantId: participants.id,
      participantName: participants.name,
      participantCreatedAt: participants.createdAt,
      optionId: votes.optionId,
      state: votes.state,
    })
    .from(participants)
    .leftJoin(
      votes,
      and(eq(votes.participantId, participants.id), eq(votes.pollId, pollId)),
    )
    .where(eq(participants.pollId, pollId))
    .orderBy(asc(participants.createdAt));

  const byParticipant = new Map<
    string,
    { id: string; name: string; votes: Record<string, string> }
  >();
  for (const r of rows) {
    let p = byParticipant.get(r.participantId);
    if (!p) {
      p = { id: r.participantId, name: r.participantName, votes: {} };
      byParticipant.set(r.participantId, p);
    }
    if (r.optionId && r.state) p.votes[r.optionId] = r.state;
  }
  return [...byParticipant.values()]; // Map preserves insertion order = createdAt asc
}
```

**Why this satisfies D3-01:** one SQL round-trip, no N+1, no `email`/`editToken`/`adminUrlId` in the select list, participants with zero votes still appear (LEFT JOIN, not INNER), ordering is `createdAt asc` at the SQL level so the `Map` insertion order is already correct without a second in-memory sort.

### Pattern 2: `computeResults` — single-pass tally + best-day selection

**What:** A pure function (no DB, no `async`) that takes the `getResultsForPoll` output plus the chronological `options` array and returns per-option tallies and best-day flags in one pass.

**When to use:** Called once, server-side, in the admin RSC after both queries resolve; the return value is passed as plain serializable props to the `"use client"` `ResultsGrid`.

**Example:**

```typescript
// src/lib/compute-results.ts
import { normalizeVoteState } from "@/lib/vote-state";

export type ResultsParticipant = {
  id: string;
  name: string;
  votes: Record<string, string>; // optionId -> raw state string (possibly unrecognized)
};

export type OptionResult = {
  optionId: string;
  yes: number;
  ifneedbe: number;
  isBest: boolean;
};

export function computeResults(
  participants: ResultsParticipant[],
  options: { id: string }[], // must already be in chronological order (getOptionsForPoll)
): OptionResult[] {
  const tallies = options.map((opt) => {
    let yes = 0;
    let ifneedbe = 0;
    for (const p of participants) {
      const state = normalizeVoteState(p.votes[opt.id]); // gap-fill + unrecognized-state fallback (D3-03)
      if (state === "yes") yes++;
      else if (state === "ifneedbe") ifneedbe++;
    }
    return { optionId: opt.id, yes, ifneedbe };
  });

  // Best-day selection (D3-02 / SPEC DASH-04). Chronological order is already
  // the array order (from getOptionsForPoll) — no extra sort needed; "date asc"
  // in the ranking key only matters for DISPLAY, never for which options are
  // flagged isBest (SPEC: "chronological order only orders display / breaks
  // ties for a single label, never hides a genuine co-leader").
  const maxYes = tallies.reduce((m, t) => Math.max(m, t.yes), 0);
  const bestIds = new Set<string>();
  if (maxYes > 0) {
    const yesLeaders = tallies.filter((t) => t.yes === maxYes);
    const maxIfNeedBe = yesLeaders.reduce((m, t) => Math.max(m, t.ifneedbe), 0);
    for (const t of yesLeaders) {
      if (t.ifneedbe === maxIfNeedBe) bestIds.add(t.optionId);
    }
  }

  return tallies.map((t) => ({ ...t, isBest: bestIds.has(t.optionId) }));
}
```

**Edge cases from SPEC Edge Coverage, and how this code satisfies them:**

| SPEC edge | How `computeResults` handles it |
|---|---|
| All-zero-yes → no highlight (AC-5) | `maxYes === 0` → `bestIds` stays empty → every `isBest: false`. |
| Two+ dates tied on `(yes, ifneedbe)` → all highlighted (AC-5) | `yesLeaders.filter(...)` keeps every tied option, not just the first — `bestIds` gets all of them. |
| Zero participants | `tallies` are all `{yes:0, ifneedbe:0}` (loop body never executes); `maxYes` reduces to `0` on an empty-safe base case (`.reduce((m,t)=>...,0)` starting value handles the empty-tallies-per-option case fine since `options` is still non-empty — only `participants` is empty). No throw. The **empty-participants message** ("No responses yet") is a page/component-level concern (SPEC AC-1), not `computeResults`'s job — render it conditionally in `page.tsx`/`ResultsGrid` when `participants.length === 0`, independent of whether `computeResults` still runs. |
| Zero-vote date (some participants, but none voted on this date) | Same as all-zero-yes for that one option: it's simply never a `yesLeader` unless every date has 0 yes, in which case the all-zero-yes rule applies globally. |
| Unrecognized `state` literal (no DB CHECK constraint on `votes.state`) | `normalizeVoteState` (shared with cell rendering) maps anything not in `{yes, ifneedbe, no}` to `"no"` before counting — never throws, never miscounts (closes Phase 2 REVIEW #4). |
| Filter-matches-none (DASH-05, not `computeResults`'s concern) | Handled entirely inside the client island's local filter state — `computeResults` output is unaffected by the filter; the filter operates on the already-computed grid rows. |

### Pattern 3: Shared `STATE_META` + `normalizeVoteState` extraction (blocker for D3-05)

**What goes wrong today:** `STATE_META` is declared as a **module-private `const`** in `src/components/availability-grid.tsx` (line 37) — it is never `export`ed. Only `VoteState` (type) and `GridOption` (type) are exported from that file. D3-05 says the results grid must "reuse the `AvailabilityGrid` `STATE_META`" — as written today, `results-grid.tsx` **cannot** `import { STATE_META } from "@/components/availability-grid"` because it doesn't exist as an export.

**Two options, recommend the second:**
1. Minimal: add `export` to the existing `STATE_META` const in `availability-grid.tsx`, import it from `results-grid.tsx`. Fastest, but couples the read-only results component to a client-interaction file that also carries `CYCLE`, `cycleCell`, `setAll` — unrelated concerns for a read-only grid.
2. **Recommended:** extract `STATE_META`, the `VoteState` type, and a new `normalizeVoteState(state: string | undefined): VoteState` helper into `src/lib/vote-state.ts` (plain TS, not `"use client"` — `lucide-react` icon components are safe to import from a shared module regardless of client/server boundary since Next.js resolves them per the importing file's boundary). `availability-grid.tsx` then imports `STATE_META`/`VoteState` from there instead of declaring its own copy (delete the duplicate), and `results-grid.tsx` does the same. This gives `computeResults` (`src/lib/compute-results.ts`, a pure non-component module) a clean import of `normalizeVoteState` without pulling in a `"use client"` component file, and is the single source of truth for the P2 REVIEW #4 fallback logic (`STATE_META[state] ?? STATE_META.no`) instead of two separate ad hoc implementations (one for counting, one for cell display) drifting apart.

```typescript
// src/lib/vote-state.ts
import { Check, CircleHelp, X } from "lucide-react";

export type VoteState = "yes" | "ifneedbe" | "no";

export const STATE_META: Record<
  VoteState,
  { label: string; className: string; Icon: typeof Check }
> = {
  yes: { label: "Available", Icon: Check, className: "bg-emerald-50 text-emerald-700 border-emerald-300" },
  ifneedbe: { label: "If-need-be", Icon: CircleHelp, className: "bg-amber-50 text-amber-700 border-amber-300" },
  no: { label: "Not available", Icon: X, className: "bg-muted text-muted-foreground border-border" },
};

/** Gap-fill + unrecognized-literal fallback (D3-03 / SPEC AC-3, closes P2 REVIEW #4). */
export function normalizeVoteState(state: string | undefined): VoteState {
  return state === "yes" || state === "ifneedbe" ? state : "no";
}
```

This is a plan-affecting finding, not just discretion: whichever option is chosen, it must be an explicit task in the plan (file move + two import-site updates + verifying `availability-grid.test.tsx` still passes unchanged), not an incidental side-detail of building `ResultsGrid`.

### Pattern 4: RSC → client-island prop serialization (D3-06)

**What:** Next.js 16 App Router serializes props crossing the Server→Client boundary as JSON under the hood (React Server Components "flight" protocol). Plain objects/arrays/strings/numbers/booleans are safe; class instances, `Date` objects, functions, and `Map`/`Set` are **not** directly serializable as props into a `"use client"` component.

**Relevant to this phase:**
- `getResultsForPoll` above returns a plain array of `{id, name, votes: Record<string,string>}` objects — already serializable. Good.
- `participants.createdAt` is a `timestamp` column — Drizzle returns it as a JS `Date` object for `timestamp` columns (unlike the `date` columns, which use `mode: "string"`). **Do not pass `participantCreatedAt`/`createdAt` as a prop to `ResultsGrid`** unless it's first converted to a string (`.toISOString()`) or simply omitted — it's only needed for the `ORDER BY` in SQL, not for rendering (the grid already receives participants pre-sorted). Confirm the query `select`s it only if actually used downstream; if unused after sorting, drop it from the returned shape entirely to sidestep the serialization question.
- `computeResults`'s `OptionResult[]` output (plain objects, string ids, number counts, boolean `isBest`) is serialization-safe as-is.
- The existing codebase already proves this pattern works: `AvailabilityGrid` is fed a serializable `GridOption[]` + `Record<optionId, VoteState>` from a Server Component today (`src/app/p/[participantUrlId]/page.tsx`), and the vote submission flow round-trips through form-encoded JSON, not raw props — Phase 3's pattern is even simpler (fully server-computed props, no client mutation to sync back).

### Anti-Patterns to Avoid
- **Re-fetching on filter change:** D3-06 is explicit — the filter/sort must operate on already-rendered props, zero network round-trips. Don't wire the date/status selector to a Server Action or `router.refresh()`.
- **Sorting in `computeResults` for display:** `computeResults` should not reorder `options` — it trusts the caller's chronological order (from `getOptionsForPoll`) and returns results in the same order. Reordering for "put the best day first" belongs in presentation, not the pure aggregation function, since the SPEC's ranking key exists only to pick winners, not to reorder columns (DASH-01/04 don't ask for column reordering).
- **Duplicating the `STATE_META[state] ?? no` fallback logic in two places** (once for tallying, once for cell rendering) — see Pattern 3; use one `normalizeVoteState` helper for both, or the two code paths will silently drift on what counts as "unrecognized."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Three-state icon+label vocabulary | A second copy of the icon/label/className map inside `results-grid.tsx` | Shared `STATE_META` from `src/lib/vote-state.ts` (Pattern 3) | Visual consistency (SPEC intent) and a single place to fix P2 REVIEW #4-style bugs |
| Date formatting | Any new date-formatting helper | `formatDateWithTime` / `formatDateOnly` (`src/lib/format-date.ts`) | Already timezone-safe (D-11/P3); reinventing risks reintroducing the `new Date()` string-parsing footgun documented in that file's header comment |
| Best-day ranking | An SQL `ORDER BY yes_count DESC, ifneedbe_count DESC, date ASC` with a window function | Pure `computeResults` (Pattern 2) | Explicitly locked by D3-02: the tie-break is the highest-risk correctness surface, and it's far easier to unit-test in TypeScript with 4-5 edge-case fixtures than to verify via integration tests against Postgres window-function semantics |
| Client-side table filter state | A form library / URL query-param sync for the filter | Local `useState` in the `ResultsGrid` island | D3-06 explicitly scopes this to client-only, no round-trip; a filter that only needs to survive the current page view doesn't need URL state or external state management |

**Key insight:** Every "don't hand-roll" here resolves to "reuse code this project already has" — this phase adds no new abstractions beyond the two small new pure/query functions the SPEC explicitly calls for.

## Common Pitfalls

### Pitfall 1: `STATE_META` not exported (see Pattern 3)
**What goes wrong:** A task that says "reuse `STATE_META` from `AvailabilityGrid`" fails at import time (`STATE_META` is `undefined` or a TS error) because it was never exported.
**Why it happens:** `availability-grid.tsx` was built in Phase 2 with no anticipation of a second consumer.
**How to avoid:** Explicit plan task to extract to `src/lib/vote-state.ts` (or at minimum add `export`) before `results-grid.tsx` is written.
**Warning signs:** `Module '"@/components/availability-grid"' has no exported member 'STATE_META'` at typecheck/build time.

### Pitfall 2: Passing a `Date` object as an RSC→client prop
**What goes wrong:** `participants.createdAt` (a `timestamp` column) deserializes as a JS `Date` in the query result; passing it as-is into a `"use client"` component prop either serializes lossily or is flagged by Next.js.
**Why it happens:** Unlike `options.date` (deliberately `mode: "string"`), `participants.createdAt` has no such override — it's a genuine `Date` object server-side.
**How to avoid:** Don't select/forward `createdAt` past the sort step; the grid only needs pre-sorted `participants`, not the timestamp value itself. If it's ever needed for display, convert with `.toISOString()` before passing as a prop.
**Warning signs:** Runtime warning/error about non-serializable props, or a hydration mismatch if the Date renders differently server vs. client.

### Pitfall 3: INNER JOIN silently drops zero-vote participants
**What goes wrong:** If `getResultsForPoll` uses an INNER JOIN (or a plain `db.select().from(votes).innerJoin(participants, ...)` starting from `votes`) instead of `participants` LEFT JOIN `votes`, a participant who submitted their name but has zero vote rows (shouldn't happen given `submitResponse` is INSERT-only-with-gap-fill per Phase 2, but is a plausible future/edge state e.g. a partially-failed write) disappears from the grid entirely instead of showing as an all-"no" row.
**Why it happens:** Starting the query `FROM votes` structurally can't represent "a participant with no votes."
**How to avoid:** Always `FROM participants ... LEFT JOIN votes ...` (Pattern 1) so participant rows are the query's backbone, votes are optional.
**Warning signs:** A DB-backed test that seeds a participant with zero votes and asserts they still appear as an all-"Not available" row (this should be an explicit test case per SPEC's "empty" edge coverage for DASH-02: "A participant with zero vote rows → every cell 'Not available' via the same fallback").

### Pitfall 4: `votes.state` has no DB CHECK constraint
**What goes wrong:** Because `votes.state` is `text` validated only by Zod at the write boundary (D2-03, `src/lib/db/schema.ts` comment), a future bug, manual DB edit, or migration gap could leave a row with an unexpected `state` value. Code that does `STATE_META[state]` directly (no fallback) throws or renders `undefined`.
**Why it happens:** No DB-level enum/CHECK — the schema comment explicitly documents this as an intentional tradeoff, not an oversight.
**How to avoid:** `normalizeVoteState` (Pattern 3) is the single point of defense; both `computeResults` (for counting) and `ResultsGrid` (for cell display) must route through it — never index `STATE_META` with a raw DB value directly.
**Warning signs:** SPEC Edge Coverage explicitly lists this as a resolved "encoding" edge for DASH-02 — a plan/test that skips an "unrecognized state literal" test case has a coverage gap.

## Code Examples

See Patterns 1-4 above (`getResultsForPoll`, `computeResults`, `vote-state.ts`, and the RSC integration point) — all four are copy-adaptable, not illustrative pseudocode, and follow the existing `queries.ts`/`availability-grid.tsx` conventions verified by reading those files directly in this repo.

### Admin page integration point

```typescript
// src/app/a/[adminUrlId]/page.tsx — additive changes only
import { getPollByAdminUrlId, getOptionsForPoll, getResultsForPoll } from "@/lib/db/queries";
import { computeResults } from "@/lib/compute-results";
import { ResultsGrid } from "@/components/results-grid";

// ...inside AdminPage, after `const options = await getOptionsForPoll(poll.id);`
const participants = await getResultsForPoll(poll.id);
const results = computeResults(participants, options);

// ...in JSX, below the existing dates <ul> or replacing it per D3-04:
<ResultsGrid options={options} participants={participants} results={results} />
```

## State of the Art

Not applicable — no external library/API surface is changing; this is pure application-code composition over an already-decided stack. No `## State of the Art` deltas to report.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | Adding `votes.pollId` into the LEFT JOIN condition (redundant with the WHERE on `participants.pollId`) lets Postgres consider `votes_poll_id_idx` as an access path, versus a plan that would otherwise rely on `votes_participant_id_idx` per-participant. | Pattern 1 | Low — at D&D-group scale (5-10 participants × ≤10 dates) either query plan executes in low single-digit milliseconds; this is a defensive-design note, not a performance requirement. If wrong, no functional impact, only a theoretical index-usage nuance. |
| A2 | `Map` insertion order in JS is guaranteed to equal insertion order (used to preserve `createdAt asc` SQL ordering through the manual grouping step in `getResultsForPoll`). | Pattern 1 | None — this is a JS language guarantee (ES2015+ `Map` spec), not a claim needing external verification, included here only for planner clarity. |

**If this table is empty:** N/A — see above; both entries are low-risk / language-guarantee notes, not claims needing user confirmation. No `[ASSUMED]` package or external-fact claims were made in this research (no new packages, no new external services).

## Open Questions

1. **Should `getResultsForPoll` return `createdAt` at all, or omit it from the select list entirely?**
   - What we know: it's only needed to drive `ORDER BY` in SQL; the returned array is already in the correct order without re-exposing the field.
   - What's unclear: whether a future phase (e.g., respondent tracking, v2 `RESP-01`) wants a "last updated" or "submitted at" display — out of this phase's scope either way.
   - Recommendation: omit `participantCreatedAt` from the returned/grouped shape (select it only for the `ORDER BY`, per Pitfall 2) to keep the RSC→client prop payload minimal and avoid the `Date`-serialization question entirely. If a future phase needs it, re-add then.

2. **One component (`results-grid.tsx`) or split grid + filter (`results-grid.tsx` + `results-filter.tsx`)?**
   - What we know: CONTEXT.md explicitly defers this to "Claude's Discretion."
   - What's unclear: nothing blocking — either works; a single component is simplest for ~2 tasks of work, but D3-06's filter state must live in a client component regardless (the table itself could stay presentational/pure and receive `visibleParticipantIds` from a parent island, or the whole table could be the stateful island directly).
   - Recommendation: single `"use client"` `results-grid.tsx` holding both the table and the filter `useState`, given the phase's small surface area (~2 plan waves per ROADMAP hint: "03-01 aggregation+grid+badge, 03-02 sort/filter") — splitting adds a prop-drilling seam with no clear future consumer of the split.

## Environment Availability

Skipped — this phase adds no new external dependency, tool, service, or runtime requirement beyond what Phase 1/2 already established (Postgres via Docker locally / Neon in prod, already verified working). DB-backed tests use the same `DATABASE_URL` / `lfg-db-1` container convention as every existing test file in this repo (confirmed by reading `page.test.ts` and `submit-response.test.ts` directly).

## Validation Architecture

Skipped — `workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`.

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No auth model change this phase; admin access remains the existing unguessable `adminUrlId` token (three-token model, out of this phase's scope per SPEC canon breadcrumb). |
| V3 Session Management | No | No session/cookie change this phase. |
| V4 Access Control | Yes | `getResultsForPoll` is reachable only from the admin RSC (resolved via `getPollByAdminUrlId`, which 404s on an unknown/tampered token — existing pattern, unchanged). The participant page/query must gain **no** new results capability (SPEC Prohibition #2) — verify no import of `getResultsForPoll` appears anywhere under `src/app/p/`. |
| V5 Input Validation | Yes (narrow) | `pollId` passed into `getResultsForPoll` originates server-side from an already-validated `poll.id` (UUID from the DB row, not user input) — no new untrusted input surface is introduced. `normalizeVoteState` (Pattern 3) is the validation boundary for the one genuinely untrusted value here: `votes.state` text with no DB CHECK. |
| V6 Cryptography | No | No token generation/verification in this phase. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| SQL injection via `pollId` in the new query | Tampering | Drizzle parameterizes all `eq()`/`and()` conditions — the query in Pattern 1 never string-interpolates `pollId`; this is canon (already dismissed at SPEC level, reconfirmed here since it's a new query). |
| Information disclosure — `email`/`editToken`/`adminUrlId` leaking into the results payload/HTML | Information Disclosure | `getResultsForPoll`'s explicit select-list (Pattern 1) never selects `participants.email` or `participants.editToken`; `getPollByAdminUrlId` already omits nothing extra since it's the full poll row on the admin-only path (existing, correct) — SPEC Prohibition #1/#2 map directly to this; a test asserting no `email` substring appears in rendered results-grid HTML closes this (mirrors the existing `page.test.ts` pattern that asserts specific strings are/aren't present). |
| Cross-surface capability leak — participant page gaining a results affordance | Elevation of Privilege | New code (`getResultsForPoll`, `computeResults`, `ResultsGrid`) is only ever imported from `src/app/a/[adminUrlId]/page.tsx`; a grep-based check (`grep -r "getResultsForPoll" src/app/p/`) in the plan-checker/verifier step closes this. |

## Sources

### Primary (HIGH confidence — read directly in this repo)
- `src/lib/db/schema.ts` — `participants`/`votes` table definitions, `votes_poll_id_idx`, `votes.state` text-no-CHECK comment
- `src/lib/db/queries.ts` — existing query conventions (`getPollByAdminUrlId`, `getOptionsForPoll`, `getVotesForParticipant`, `getParticipantByEditToken`), participant-safe column discipline
- `src/components/availability-grid.tsx` — `STATE_META` (confirmed NOT exported), `VoteState` (exported), three-state click-cycle UI
- `src/lib/format-date.ts` — `formatDateWithTime`/`formatDateOnly` timezone-safe helpers
- `src/app/a/[adminUrlId]/page.tsx` — current admin RSC structure (mount point for this phase's additions)
- `src/app/a/[adminUrlId]/page.test.ts`, `src/lib/actions/submit-response.test.ts`, `src/lib/actions/update-response.test.ts` — DB-backed test conventions (`DATABASE_URL` requirement, seed helpers, next/navigation + next/headers mocking pattern)
- `.planning/phases/03-results-dashboard/03-SPEC.md` — locked requirements, Edge Coverage (20/20), Prohibitions
- `.planning/phases/03-results-dashboard/03-CONTEXT.md` — locked HOW decisions D3-01..07
- `package.json` — confirms no new dependency is needed (drizzle-orm 0.45.2, lucide-react ^1.22.0, vitest 3.2.6 already present)

### Secondary (MEDIUM confidence)
- None needed — this phase required no external/library research; all findings are direct codebase reads plus reasoning from the locked CONTEXT.md decisions.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages, fully verified by reading `package.json` and existing imports
- Architecture: HIGH — every pattern is a direct extension of an existing, working analog already in the repo (queries.ts helpers, RSC→client-island precedent from Phase 2's `AvailabilityGrid`)
- Pitfalls: HIGH — Pitfall 1 (`STATE_META` not exported) confirmed via direct grep; Pitfalls 2-4 derived from reading the actual schema/column types, not speculation

**Research date:** 2026-07-01
**Valid until:** No expiry driver — this research is entirely internal-codebase-derived, not dependent on any external library's release cadence; stays valid until the referenced files change.

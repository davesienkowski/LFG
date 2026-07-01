# Phase 3: Results Dashboard — Specification

**Created:** 2026-07-01
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

The organizer, viewing the admin page (`/a/[adminUrlId]`), can read every participant's availability in a participants-as-rows × dates-as-columns grid, see per-date yes / if-need-be tallies, and have the best date(s) highlighted — turning the votes already stored in Phase 2 into a readable decision surface.

## Background

Phase 2 stores every participant's availability: the `participants` and `votes` tables exist, and `votes` carries a denormalized `poll_id` with an existing `votes_poll_id_idx` index (`src/lib/db/schema.ts:83-103`) explicitly added so Phase 3 can aggregate by poll with a single index — **no migration is required this phase**. `votes.state` is a text column constrained to `'yes' | 'ifneedbe' | 'no'` by Zod at the write boundary (no DB CHECK).

Today the admin page (`src/app/a/[adminUrlId]/page.tsx`) resolves the poll by admin token, 404s on miss, and renders the title, a flat chronological list of candidate dates, and both share links. It shows **no results** — there is no aggregation query and no grid. Reusable building blocks exist: `getPollByAdminUrlId` / `getOptionsForPoll` (`src/lib/db/queries.ts`), the `formatDateWithTime` timezone-safe date formatter (`src/lib/format-date.ts`, dates are `'YYYY-MM-DD'` strings end-to-end, never `new Date()`), the three-state `STATE_META` icon+label vocabulary in `AvailabilityGrid` (`src/components/availability-grid.tsx`), and shadcn `Card`/`Button`.

The gap: (1) a results aggregation read query, (2) a `ResultsGrid` presentational component, (3) a best-day highlight, (4) a client-side sort/filter affordance, all mounted on the admin page. This is a read-only phase over existing write-side data.

## Requirements

1. **Results grid (participants × dates)**: The admin page renders a grid with one row per participant and one column per candidate date, populated from all of the poll's votes.
   - Current: The admin page shows only a flat date list and share links; no participant data is read or rendered.
   - Target: A `ResultsGrid` on `/a/[adminUrlId]` shows participant rows (by display name) × candidate-date columns (chronological, reusing `getOptionsForPoll` order), each cell showing that participant's state for that date.
   - Acceptance: For a poll with N participants and M options, the grid renders N rows × M date columns; a participant is one row keyed by participant `id` (two participants sharing a display name render as two distinct rows); with zero participants an empty-state message ("No responses yet") renders instead of a broken/empty grid.

2. **Three-state cells**: Each grid cell visually distinguishes the participant's availability state for that date, by icon **and** text label (never color alone).
   - Current: The three-state icon+label vocabulary exists only inside the participant-facing `AvailabilityGrid`; nothing renders read-only result cells.
   - Target: Each cell renders one of Available (check) / If-need-be (help-circle) / Not available (x) with both a lucide icon and a visible text label, reusing the `STATE_META` vocabulary for visual consistency.
   - Acceptance: Each of the three states renders a distinct icon + text label; a `(participant, date)` pair with no stored vote row, or an unrecognized state literal, renders as "Not available" via a `STATE_META[state] ?? no` fallback rather than throwing.

3. **Per-date tallies**: Each date column shows a summary count of yes votes and of if-need-be votes across all participants for that date.
   - Current: No counts are computed or displayed anywhere.
   - Target: Each date column header/footer shows an exact integer count of `yes` and of `ifneedbe` for that date, computed by a Postgres `GROUP BY` aggregation (`getResultsAggregation`) over `votes` filtered by `poll_id`.
   - Acceptance: For a date with a known distribution the displayed yes-count and if-need-be-count exactly match the stored votes; a date with zero votes shows `0` yes and `0` if-need-be; counts are exact integers (no percentages or rounding this phase).

4. **Best-day highlight**: The best date(s) are visually highlighted, ranked by highest yes count, breaking ties by if-need-be count and then chronological order.
   - Current: Nothing computes or highlights a best day.
   - Target: A `BestDayBadge` / cell highlight marks the winning date(s). Ranking key is lexicographic: yes-count descending, then if-need-be-count descending, then date ascending. **All** dates that share the maximal `(yes, if-need-be)` pair are highlighted (chronological order only orders display / breaks ties for a single label, never hides a genuine co-leader).
   - Acceptance: Given votes where one date has the strictly highest yes count, exactly that date is highlighted; given two dates tied on both yes and if-need-be counts, both are highlighted; when no date has ≥1 yes vote, no date is highlighted.

5. **Sort/filter by status for a date**: The organizer can sort or filter the results view by availability status (available / tentative / not available) for a given date.
   - Current: No interactive filtering exists.
   - Target: A client-side control lets the organizer pick a date column and a status; the grid then filters to (or sorts by) participants holding that status for that date, over the already-server-rendered data (no extra network round-trip).
   - Acceptance: Selecting "Available" for a chosen date shows only participants whose state for that date is `yes` (and hides the rest, or sorts them first); the filter can be cleared to restore the full grid; a filter that matches zero participants shows an explicit empty-filtered indication rather than a blank/broken grid; sort is stable (ties preserve underlying participant order).

## Boundaries

**In scope:**
- `getResultsAggregation` — SQL `GROUP BY (option, state)` (or equivalent) read query over `votes` by `poll_id`, returning per-date state counts.
- A per-participant vote fetch for the poll (participant rows × their states) to populate grid cells.
- `ResultsGrid` presentational component (participants × dates, three-state cells, per-date tallies).
- `BestDayBadge` / best-day highlight with the lexicographic ranking above.
- Client-side sort/filter island (by status, for a chosen date).
- Mounting all of the above on the admin page (`/a/[adminUrlId]`).
- Empty/degenerate states (no participants, zero-vote date, all-zero-yes, filter-matches-none).

**Out of scope:**
- Any results view on the **participant** page (`/p/...`) — the dashboard is an admin-only surface; the participant page stays voting-only (three-token model).
- Emailing / exporting / sharing results — Phase 4 (email) and beyond.
- Finalizing / "Book it" / closing the poll — Phase 4 (FNL-*).
- Displaying participant **email addresses** — collected for Phase 4 organizer notifications only; not a Phase 3 display field (see Prohibitions).
- Real-time / live-updating results (websockets, polling) — a page load (or refresh) reflects current votes; live push is not in scope.
- Percentages, charts, or weighted scoring — this phase shows exact integer counts only.
- Schema changes / migrations — the required `votes_poll_id_idx` already exists.

## Constraints

- **No migration**: reuse the existing `votes_poll_id_idx`; do not add or alter schema this phase.
- **Timezone-safe dates**: date columns render via `formatDateWithTime` on the `'YYYY-MM-DD'` string; never `new Date()` on a date-only value (D-11 / P3).
- **Admin-only data path**: the aggregation and per-participant vote reads are reached only through the admin (`adminUrlId`) resolution; the participant-safe query path gains no results capability.
- **Free-tier / serverless**: aggregation is a single indexed `GROUP BY` suitable for Neon HTTP driver within the Vercel Hobby function budget; no N+1 per-cell queries.
- **No new runtime dependencies**: reuse shadcn/ui, lucide-react, and existing helpers.
- **Reuse the three-state vocabulary**: cells use the same icon+label semantics as `AvailabilityGrid` (`STATE_META`) for visual consistency; color is never the only signal.

## Acceptance Criteria

- [ ] `/a/[adminUrlId]` renders a participants-as-rows × dates-as-columns results grid populated from the poll's votes.
- [ ] Each cell shows one of three states with a distinct icon **and** text label (not color alone).
- [ ] A `(participant, date)` with no vote row, or an unrecognized state literal, renders "Not available" via a `STATE_META[state] ?? no` fallback (no throw).
- [ ] Each date column shows exact integer yes and if-need-be counts; a zero-vote date shows `0` / `0`.
- [ ] The best date(s) are highlighted by the lexicographic key (yes ↓, if-need-be ↓, date ↑); tied co-leaders are all highlighted; no highlight when no date has ≥1 yes.
- [ ] The organizer can filter/sort by a status for a chosen date; the filter clears; a zero-match filter shows an explicit empty indication.
- [ ] Zero-participants renders an empty-state message, not a broken grid.
- [ ] No participant email address appears anywhere in the results dashboard output.
- [ ] The participant page/query gains no results aggregation; the results payload carries no `edit_token` or `admin_url_id`.
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build`, and the full vitest suite pass.

## Edge Coverage

**Coverage:** 20/20 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| adjacency | DASH-01 | ✅ covered | Two participants sharing a display name are distinct rows, keyed by participant `id` (AC-1). |
| empty | DASH-01 | ✅ covered | Zero participants → "No responses yet" empty state, not a broken grid (AC-1, AC-7). |
| ordering | DASH-01 | ✅ covered | Participant rows ordered by `participants.createdAt` asc (submission order), stable/deterministic. |
| adjacency | DASH-02 | ✅ covered | A `(participant, date)` with no vote row renders "Not available" (defensive gap-fill) (AC-3). |
| empty | DASH-02 | ✅ covered | A participant with zero vote rows → every cell "Not available" via the same fallback. |
| encoding | DASH-02 | ✅ covered | Unrecognized `votes.state` literal → `STATE_META[state] ?? no` renders "Not available", never throws (also closes Phase 2 REVIEW #4). |
| ordering | DASH-02 | ✅ covered | Cell/column order = chronological option order from `getOptionsForPoll` (date asc, NULLS FIRST). |
| boundary | DASH-03 | ✅ covered | Count at 0 shows "0 yes / 0 if-need-be" (AC-4). |
| adjacency | DASH-03 | ✅ covered | Each column's tally counts only its own date; columns are independent. |
| empty | DASH-03 | ✅ covered | No votes for a date → 0 / 0 (AC-4). |
| ordering | DASH-03 | ✅ covered | Tally is an order-independent count; result identical regardless of row scan order. |
| precision | DASH-03 | ✅ covered | Tallies are exact integer counts — no percentages, no rounding this phase (AC-4). |
| boundary | DASH-04 | ✅ covered | All-zero-yes → no date highlighted (AC-5). |
| adjacency | DASH-04 | ✅ covered | Dates tied on `(yes, if-need-be)` are all highlighted (co-leaders), not collapsed to one (AC-5). |
| empty | DASH-04 | ✅ covered | Zero participants / zero votes → no highlight. |
| ordering | DASH-04 | ✅ covered | Ranking key lexicographic: yes ↓, if-need-be ↓, date ↑; chronological only orders display. |
| precision | DASH-04 | ✅ covered | Ranking compares exact integer counts; no rounding/float. |
| adjacency | DASH-05 | ✅ covered | Filter/sort on equal values is stable (preserves underlying participant order). |
| empty | DASH-05 | ✅ covered | Filter matching zero participants → explicit empty-filtered indication, clearable (AC-6). |
| ordering | DASH-05 | ✅ covered | Sort is stable; ties keep submission order (AC-6). |

## Prohibitions (must-NOT)

**Coverage:** 2/2 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT render any participant **email address** in the results dashboard (collected for Phase 4 notifications only; a screenshot-able admin grid showing emails is an unintended privacy leak). | DASH-01/02 | resolved | verification: test — assert the results query projection and rendered grid contain no `email` field. |
| MUST NOT expose the results aggregation from the participant surface, and MUST NOT carry `edit_token` or `admin_url_id` in the results payload (preserves the three-token model). | DASH-01 | resolved | verification: test — participant query/page gains no aggregation; results RSC selects neither token. |
| _(canon breadcrumb)_ SQL injection on the aggregation | DASH-03 | dismissed | Drizzle parameterizes all queries; canon — owned by /gsd-secure-phase + eslint, not minted here. |
| _(canon breadcrumb)_ Admin/participant access control | DASH-01 | dismissed | Token-based access control is the established three-token model — owned by /gsd-secure-phase, not re-minted here. |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | 5 concrete, testable success criteria from ROADMAP.          |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Admin-only; live-updates, email, finalize, charts excluded.  |
| Constraint Clarity | 0.80  | 0.65 | ✓      | No migration; timezone-safe; single indexed GROUP BY.        |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 10 pass/fail checks incl. edge + prohibition negatives.      |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      |                                                              |

## Interview Log

`--auto` mode — no interactive interview; gray areas auto-resolved from ROADMAP + codebase scouting with the reasoning below.

| Round | Perspective     | Question summary                          | Decision locked (auto)                                                        |
|-------|-----------------|-------------------------------------------|-------------------------------------------------------------------------------|
| 1     | Researcher      | What exists vs. the gap?                   | Schema + `votes_poll_id_idx` exist (no migration); admin page has no grid — build query + grid + highlight + filter. |
| 2     | Simplifier      | Where do results live? render model?       | Admin page only; server-render the grid + a client filter island over already-fetched data (small N). |
| 3     | Boundary Keeper | What's explicitly NOT this phase?          | No participant-side results, no email/export, no finalize, no live-update, no charts, no migration. |
| 4     | Failure Analyst | What breaks the grid / miscounts / leaks?  | Gap-fill + `?? no` state fallback; integer tallies; tied best-days all highlighted; no-yes → no highlight; never render emails/tokens. |

---

*Phase: 03-results-dashboard*
*Spec created: 2026-07-01*
*Next step: /gsd-discuss-phase 3 — implementation decisions (how to build what's specified above)*

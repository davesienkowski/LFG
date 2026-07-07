---
phase: 06-your-polls-dashboard
plan: 01
subsystem: data-layer
tags: [drizzle, postgres, query, organizer, no-leak]
requires: []
provides:
  - "getPollsByOrganizerId(organizerId) — dashboard read query (7 participant-safe columns, open+closed polls)"
affects:
  - "06-03 (/polls page calls getPollsByOrganizerId to render the list)"
tech-stack:
  added: []
  patterns:
    - "single neon-http statement (no interactive transaction); LEFT JOIN winner option + correlated COUNT(*)::int subqueries"
    - "trim-guard returns [] before any query for empty/whitespace token (mirrors create-poll organizer normalization)"
key-files:
  created: []
  modified:
    - src/lib/db/queries.ts
    - src/lib/db/queries.test.ts
decisions:
  - "Counts are correlated COUNT(*)::int subqueries so an empty poll yields 0 (a JS number), never null or a bigint string (MYP-04)."
  - "ORDER BY created_at DESC, id — stable polls.id tiebreaker for equal created_at, mirroring the feed query's EP-FEED-ORDER (MYP-01)."
  - "Exact eq(polls.organizerId, organizerId) predicate — SQL `= $1` never matches a NULL organizer_id, so null-organizer polls are excluded for free (MYP-07 / PROH-1); no separate isNotNull needed."
  - "Select shape is exactly the 7 participant-safe columns — structurally cannot carry participant name/email, edit_token, participant_url_id, or creator_email (PROH-2)."
metrics:
  duration: -
  completed: 2026-07-06
---

# Phase 6 Plan 1: getPollsByOrganizerId Read Query Summary

Added the data-layer read query `getPollsByOrganizerId(organizerId)` — the single source
the `/polls` dashboard (06-03) uses to list every poll owned by one `lfg_organizer` token,
newest-first, with participant-safe columns only. It mirrors the existing
`getFinalizedPollsByOrganizerId` no-leak discipline but adds **open** polls and per-poll
aggregate counts.

> **Note:** This SUMMARY was reconstructed on resume (2026-07-07) — the code shipped in commit
> `b69d51f` (2026-07-06) but the summary artifact was never written. Content is derived from
> `06-01-PLAN.md`, the committed source, and `06-VERIFICATION.md` (which independently verified
> this query, PASSED).

## What was built

- **`src/lib/db/queries.ts`** — exported `async function getPollsByOrganizerId(organizerId: string)`:
  - **MYP-05 trim-guard**: `if (!organizerId || !organizerId.trim()) return []` before any
    `db.select` — an empty/whitespace token is ABSENT, never a wildcard.
  - **One neon-http statement**: `select` from `polls`, `leftJoin(options, eq(options.id,
    polls.winningOptionId))` (winner date/time; null while open), `where(eq(polls.organizerId,
    organizerId))`, `orderBy(desc(polls.createdAt), asc(polls.id))`.
  - **Exactly 7 columns** (PROH-2 / MYP-04): `adminUrlId, title, status, winningDate,
    winningStartTime, optionCount, responseCount`. `adminUrlId` is included (the organizer owns
    those links); no participant name/email, edit_token, participant_url_id, or creator_email.
  - `optionCount` / `responseCount` are `sql<number>` correlated `(select count(*) …)::int`
    subqueries → 0 not null for an empty poll, a JS number not a bigint string.
  - Doc-comment states the no-leak column discipline, the single-statement constraint, that OPEN
    polls are included (unlike the feed query), the null/empty → `[]` behavior, and the ORDER BY
    tiebreaker rationale. Added `desc` to the drizzle-orm import.
- **`src/lib/db/queries.test.ts`** — a `describe("getPollsByOrganizerId", …)` block covering:
  ordering (newest-first), stable tiebreaker (deterministic across repeated calls),
  counts (3 options + 2 participants; and 0/0 empty → number not null), winner columns
  (closed row has winningDate/time, open row null, both returned), isolation (organizer A never
  sees B's adminUrlId — PROH-1), empty organizer (`""` and `"   "` → `[]` with a null-organizer
  poll present — MYP-05), null exclusion (null organizer_id never appears — MYP-07), and a
  non-vacuous no-leak case (result length ≥ 1 AND canary email/name/edit-token/participant_url_id
  absent AND exact 7-key shape — PROH-2). Each case mints its own `generateToken()` organizer to
  isolate rows.

## Verification

- `DATABASE_URL=… npx vitest run src/lib/db/queries.test.ts` → green (24 tests in the commit).
- `npm run build` → the new query type-checks (COUNT casts to number; select shape inferred).
- Independently re-verified in `06-VERIFICATION.md`: MYP-01/04/05/07 and PROH-1/PROH-2 all ✓.

## Requirements covered

MYP-01 (ordering + stable tiebreaker), MYP-04 (7-col shape / 0-not-null counts),
MYP-05 (empty/whitespace → `[]`), MYP-07 (null-organizer exclusion); PROH-1 (no cross-organizer
leak), PROH-2 (no participant identity / third token).

## Deviations from Plan

None — plan executed as written.

## Commits

- `b69d51f` feat(06-01): add getPollsByOrganizerId dashboard read query + DB tests

## Self-Check: PASSED

- `getPollsByOrganizerId` exported in `src/lib/db/queries.ts` (line 347) — confirmed present.
- Commit `b69d51f` present in git log.
- Query + tests independently verified by `06-VERIFICATION.md` (PASSED).

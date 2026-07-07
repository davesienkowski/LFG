---
phase: 03-results-dashboard
reviewed: 2026-07-01T18:36:00Z
depth: standard
files_reviewed: 11
files_reviewed_list:
  - src/lib/vote-state.ts
  - src/lib/results.ts
  - src/lib/results.test.ts
  - src/lib/db/queries.ts
  - src/lib/db/queries.test.ts
  - src/components/results-grid.tsx
  - src/components/results-grid.test.tsx
  - src/components/availability-grid.tsx
  - src/app/a/[adminUrlId]/page.tsx
  - src/app/a/[adminUrlId]/page.test.ts
  - src/lib/actions/create-poll.test.ts
findings:
  critical: 0
  blocker: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-07-01T18:36:00Z
**Depth:** standard
**Files Reviewed:** 11
**Status:** issues_found

## Summary

Phase 3 adds a read-only admin Results Dashboard: a pure aggregation layer
(`computeResults`), an admin-only DB read (`getResultsForPoll`), a shared
three-state vocabulary (`vote-state.ts`), and a client `ResultsGrid` with an
in-memory date/status filter, wired into the admin RSC page.

I reviewed adversarially against the phase's five load-bearing invariants and
**verified each one holds in source** — no blockers:

- **Privacy projection (holds).** `getResultsForPoll` selects only
  `participants.id`, `participants.name`, `votes.optionId`, `votes.state`;
  `createdAt` is used solely in `ORDER BY` and never projected. The returned
  shape has exactly `{ id, name, votes }` (own-keys test at
  queries.test.ts:165-172). No `email`, `edit_token`, or `admin_url_id` reaches
  the payload. The aggregation is reachable **only** from the admin surface:
  grep confirms `getResultsForPoll`/`ResultsGrid` have zero references under
  `src/app/p/` (the participant route's `email` usage is the participant's OWN
  preload, not results). `ResultsGrid` accepts no email/token prop.
- **`computeResults` correctness (holds).** Tallies route every cell through
  `normalizeVoteState` (gap-fill + unrecognized → "no"). Best-day: `maxYes`
  over all options; if `> 0`, all options tied on the maximal `(yes, ifneedbe)`
  pair are flagged `isBest`; all-zero-yes flags none. Chronological order is
  preserved (no re-sort) and used only for display, matching "tied co-leaders →
  all best". No off-by-one or tie-break defect found; all 10 unit cases assert
  exact values.
- **RSC→client boundary (holds).** Props forwarded into `"use client"`
  `ResultsGrid` are fully JSON-serializable: `options` are
  `{id, date:string, startTime:string|null, position:number}` (schema uses
  `date({mode:"string"})`, `time` returns strings), `participants` are
  `{id, name, votes}`, `results` are plain numbers/bools. No `Date` object
  (e.g. `createdAt`) crosses the boundary.
- **React purity (holds).** `visible` is derived purely during render from
  `filter` + props (never mirrored into a second `useState`). Every
  `setAnnouncement` call is outside a state updater (in `announceFilter` /
  `clearFilter`), matching the AvailabilityGrid post-`260701-il0` fix.
- **Timezone-safe dates (holds).** All labels go through `formatDateWithTime`,
  which builds from `Date.UTC(...)` and formats with `timeZone:"UTC"`; no
  `new Date(dateString)` on date-only values anywhere in the reviewed files.

The `votes_participant_option_unique` constraint (schema.ts:99) rules out
double-counting a `(participant, option)` pair, so the last-write-wins map
assignment in `getResultsForPoll` is safe.

Remaining findings are one low-severity accessibility/robustness inconsistency
and two test/code-hygiene notes. None block shipping.

## Warnings

### WR-01: Status filter is interactive with no date selected and emits a misleading screen-reader announcement

**File:** `src/components/results-grid.tsx:169-183` (and `113-124`)
**Issue:** The "Clear filter" button is correctly `disabled={!dateId}`
(line 189), but the Status `<select>` stays fully interactive when no date is
chosen. Changing Status in that state has **no visual effect** (the derived
`visible` list uses the `dateId ? ... : participants` branch, so status is
ignored until a date exists) yet fires `announceFilter(dateId=null, nextStatus)`,
which hits the `if (!nextDateId)` branch and announces
`"Showing all N participants"`. An assistive-tech user who deliberately picks a
status hears an announcement implying no filter is active, with no cue that a
date is required first. This is an inconsistency with the Clear button's own
`!dateId` gating.
**Fix:** Gate the Status control on `dateId` the same way Clear is gated, or
announce the requirement. For example:
```tsx
<select
  id="results-filter-status"
  disabled={!dateId}
  aria-describedby={!dateId ? "results-filter-hint" : undefined}
  ...
>
```
and render a hint (`Choose a date to filter`) when `!dateId`. Alternatively,
have `announceFilter` say `"Choose a date to apply the ${label} filter"` in the
`!nextDateId` branch when the user is changing status.

## Info

### IN-01: Over-broad / partially vacuous no-leak substring assertions

**File:** `src/lib/db/queries.test.ts:158,161-162`
**Issue:** `expect(serialized).not.toContain("email")` is broader than intended:
it would false-fail if any future participant `name` contained the substring
`"email"` (e.g. a display name), turning a privacy test into a flaky one. The
`adminUrlId` / `admin_url_id` assertions (161-162) are effectively vacuous —
those columns are never selected by `getResultsForPoll`, so no value or key can
appear regardless. The genuinely strong guarantees are the canary-email check
(157, non-vacuous) and the structural own-keys check (165-172).
**Fix:** Keep the canary and own-keys assertions; drop or tighten the raw
substring checks (e.g. assert on `Object.keys` recursively, or check the
serialized string does not contain the actual seeded `editToken`/`adminUrlId`
VALUES rather than the literal field-name strings).

### IN-02: Two AvailabilityGrid buttons share an identical handler with no shared source

**File:** `src/components/availability-grid.tsx:106-123`
**Issue:** "Set all Not available" (line 110) and "Clear" (line 119) both call
`onClick={() => setAll("no")}`. This is intentional (clearing resets to the
default "no"), but the identical inline handlers read as a possible copy-paste
duplication and could silently drift if one is later changed.
**Fix:** Extract a named handler (e.g. `const resetAll = () => setAll("no")`)
used by both, or add a one-line comment noting the two actions are deliberately
equivalent, so the equivalence is explicit rather than incidental.

---

_Reviewed: 2026-07-01T18:36:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

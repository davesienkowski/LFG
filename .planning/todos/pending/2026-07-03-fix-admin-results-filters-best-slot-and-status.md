---
created: 2026-07-03T03:15:48.885Z
title: Fix admin results filters (best-slot ranking + standalone status)
area: ui
files:
  - src/components/results-grid.tsx
  - src/lib/results.ts
---

## Problem

The admin results filters don't behave as expected (observed on the live site):

1. **"Best available slot" doesn't rank by results.** The filter should surface/
   rank the best day(s) computed from the actual votes (the group's aggregate
   availability), not just re-list dates. The best-day computation logic lives in
   `src/lib/results.ts`; the filter UI should consume it.
2. **Status filter is gated on a date selection.** You currently can't use the
   status filter unless a date is first selected — that dependency is wrong. Status
   filtering should work standalone (filter the whole grid by Available / Tentative /
   Not available without requiring a specific date first).

## Solution

TBD. Decouple the status filter from date selection so it operates independently,
and wire the "best slot" filter to the real best-day ranking from `results.ts`.
Confirm the intended filter semantics with the user before building (what "filter to
best slot" should actually show). Candidate for Phase 06.

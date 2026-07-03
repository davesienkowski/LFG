---
created: 2026-07-03T03:15:48.885Z
title: Show current results on participant page
area: ui
files:
  - src/app/p/[participantUrlId]/page.tsx
  - src/components/results-grid.tsx
---

## Problem

Participants have no way to see the group's current results. On the participant
voting page (`/p/[participantUrlId]`) they can only mark their own availability;
there's no aggregate/live view of how everyone else has voted. Doodle shows the
group's running tallies while you vote — LFG should offer the same so participants
can see which day(s) are trending.

## Solution

TBD. Surface a read-only current-results view on the participant page (reuse
`ResultsGrid` / the `results.ts` aggregation). Decide the UX: always-visible vs.
reveal-after-you-vote, and whether it appears on the vote page, the thanks page,
or both. Consider privacy expectations (participant links are unguessable but
shared within the group — aggregate results are presumably fine to show). Candidate
for Phase 06.

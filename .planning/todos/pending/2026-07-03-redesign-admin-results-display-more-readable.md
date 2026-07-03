---
created: 2026-07-03T03:15:48.885Z
title: Redesign admin results display for readability
area: ui
files:
  - src/components/results-grid.tsx
  - src/app/a/[adminUrlId]/page.tsx
---

## Problem

On the live admin page (`/a/[adminUrlId]`), the poll-results grid renders too
small and cramped to be readable/usable — surfaced while reviewing the deployed
site on desktop and mobile (https://looking-for-group-eight.vercel.app). The
ResultsGrid is a semantic `<table>` (kept deliberately in Phase 05 — D-09 forbade
a structural rewrite), so this is about sizing/spacing/layout on the admin surface,
not the grid's semantics.

## Solution

TBD. Give results more room on the admin page: larger cells/typography, better
use of horizontal space, and a mobile-legible layout. Likely a presentation-layer
change in `results-grid.tsx` + the admin page shell rather than a data change.
Pairs with the "best day" summary work in the filters todo. Candidate for Phase 06
(results/admin UX polish). Verify against a real multi-participant poll.

---
created: 2026-07-03T03:15:48.885Z
title: Make candidate date lists horizontal/compact
area: ui
files:
  - src/components/book-it-control.tsx
  - src/app/a/[adminUrlId]/page.tsx
---

## Problem

Candidate dates render stacked vertically in two places, wasting a lot of vertical
space (noticeable on both desktop and mobile on the live site):

1. The **"Book it" finalize control** (`book-it-control.tsx`) — the list of dates
   the admin picks the winner from.
2. The **original poll-description / summary area** — where the poll's candidate
   dates are echoed back.

## Solution

TBD. Lay the date lists out horizontally / in a wrapping compact row (e.g. chips or
an inline flex-wrap) instead of one-per-line, so they take far less vertical space
while staying legible and tappable on mobile. Keep tap targets adequate (Fitts's
Law) on touch. Candidate for Phase 06.

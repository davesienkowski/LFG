---
status: testing
phase: 03-results-dashboard
source: [03-VERIFICATION.md]
started: 2026-07-01
updated: 2026-07-01
---

## Current Test

number: 1
name: Results table scroll-edge fade on a narrow viewport
expected: |
  On the admin page `/a/[adminUrlId]` for a poll with enough candidate dates that the
  results table overflows horizontally, viewed on a narrow (mobile-width) viewport: a
  right-edge fade/gradient affordance is visible on the `overflow-x-auto` table container,
  signalling that more date columns (including a possible best-day column) exist off-screen.
  The fade should disappear once the table is scrolled fully to the right end.
awaiting: user response

## Tests

### 1. Results table scroll-edge fade on a narrow viewport
expected: |
  Poll with many dates + a few participants → open `/a/[adminUrlId]` on a narrow viewport.
  The results table's right edge shows a fade/gradient cue when columns overflow off-screen,
  and it resolves when scrolled to the end. (Implemented as `SCROLL_FADE_STYLE` in
  src/components/results-grid.tsx; jsdom cannot evaluate the visual CSS, so it is a human check.)
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

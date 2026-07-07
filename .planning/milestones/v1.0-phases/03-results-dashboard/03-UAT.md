---
status: passed
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
awaiting: resolved

## Tests

### 1. Results table scroll-edge fade on a narrow viewport
expected: |
  Poll with many dates + a few participants → open `/a/[adminUrlId]` on a narrow viewport.
  The results table's right edge shows a fade/gradient cue when columns overflow off-screen,
  and it resolves when scrolled to the end. (Implemented as `SCROLL_FADE_STYLE` in
  src/components/results-grid.tsx; jsdom cannot evaluate the visual CSS, so it is a human check.)
result: pass
verified: |
  2026-07-01 — headless Chromium (Playwright) at 390×844 against a seeded 12-date, 6-participant
  poll on the local dev server. Confirmed: container overflows (scrollWidth 2240 > clientWidth 358);
  4-layer Lea Verou scroll-shadow with background-attachment local,local,scroll,scroll; right-edge
  fade visible at scroll start (best-day column off-screen), and on scrolling to the end the right
  fade clears while the left fade appears, revealing the "Best" column (Sat Sep 12, emerald tint,
  6 yes · 0 if-need-be). Bonus: live DOM had no participant email (no-leak prohibition holds at
  runtime). Screenshots captured (grid-start.png / grid-end.png).

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

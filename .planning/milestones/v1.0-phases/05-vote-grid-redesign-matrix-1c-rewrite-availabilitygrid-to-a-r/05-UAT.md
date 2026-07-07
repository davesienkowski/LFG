---
status: testing
phase: 05-vote-grid-redesign-matrix-1c
source: [05-VERIFICATION.md]
started: 2026-07-02T22:10:07Z
updated: 2026-07-02T22:10:07Z
---

## Current Test

number: 1
name: Screen-reader pass on the vote screen (mocks 2a-2e)
expected: |
  Desktop renders the icon-only matrix with labelled headers; mobile renders stacked icon+text
  segments; a screen reader announces exactly one radiogroup per date (not two, despite both layers
  being in the DOM); closed poll shows read-only chips.
awaiting: user response

## Tests

### 1. Screen-reader pass on the vote screen (mocks 2a-2e)
expected: Desktop renders the icon-only matrix with labelled headers; mobile renders stacked icon+text segments; a screen reader announces exactly one radiogroup per date (not two, despite both layers being in the DOM); closed poll shows read-only chips.
result: [pending]

### 2. Admin dashboard open + finalized (`/a/[adminUrlId]`) vs boards 3d/3e
expected: Best-day tint/badge/tallies, filter+Clear, scroll fade, "Keep private" admin card, and (finalized) Booked pill + Poll-finalized card with Invite/Book-it hidden all match the mocks pixel-for-pixel.
result: [pending]

### 3. Invite chips + Book-it two-step confirm on `/a/[adminUrlId]` vs board 3d
expected: Invite chips show icon+text per state; "Book this date" only reveals the amber panel (never closes); "Confirm and close poll" is the only finalizing control.
result: [pending]

### 4. Mobile sticky/pinned submit or closed banner over a long candidate-date list (vote screen)
expected: Submit button (open) / "Voting is closed" banner (closed) stays pinned/visible at viewport bottom while the date list scrolls, matching mocks 2d/2e; desktop 2a-2c is unaffected.
result: [pending]

### 5. Participant vote / thanks / edit pages vs boards 2a-2c, 3b, 3c
expected: Headings, the amber bearer-credential warning on thanks, and prefilled edit values + "Save changes" match the mocks.
result: [pending]

### 6. Create-poll screen (desktop + narrow) vs boards 3a/3a-m
expected: Title, field order, and the pinned "Create poll" action on mobile match the mock.
result: [pending]

### 7. Multi-month date selection on CalendarDatePicker vs board 3a
expected: Calendar, Default start time + Apply to all, and the sorted selected-list with per-row time + remove behave correctly; dates render on the same calendar day (no off-by-one) across month boundaries.
result: [pending]

### 8. Render the three transactional emails (Mailpit capture) vs boards 3f-3h
expected: Shell, CTAs, event-details block, and the always-present plaintext fallback link match the mocks.
result: [pending]

### 9. Finalization email calendar buttons (Mailpit capture, closed poll)
expected: The two calendar buttons are visibly distinct (blue Google vs neutral Apple/Outlook) with legible white text; when a calendar URL is absent the corresponding button is cleanly omitted.
result: [pending]

## Summary

total: 9
passed: 0
issues: 0
pending: 9
skipped: 0
blocked: 0

## Gaps

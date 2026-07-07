---
phase: 06-your-polls-dashboard
plan: 02
subsystem: ui-components
tags: [react, rsc, presentational, badge, pluralization, subscribe]
requires: []
provides:
  - "PollListItem presentational poll-row component + PollListRow prop type"
  - "SubscribeCard shared booked-dates subscribe card (neutral, MYP-08 copy)"
affects:
  - "06-03 (/polls page composes PollListItem + SubscribeCard)"
  - "06-04 (admin page swaps its inlined subscribe card for SubscribeCard)"
tech-stack:
  added: []
  patterns:
    - "renderToStaticMarkup component tests (node env, no jsdom/DB) for pure RSCs"
    - "numeric === 1 pluralization + guarded formatDateWithTime for null-date fallback"
key-files:
  created:
    - src/components/poll-list-item.tsx
    - src/components/poll-list-item.test.tsx
    - src/components/subscribe-card.tsx
  modified: []
decisions:
  - "PollListItem always renders the response count (open and closed); closed adds the booked date only when winningDate is non-null."
  - "PollListRow is exactly the 7 participant-safe columns — structurally cannot carry name/email/edit-token/participant-URL (PROH-2)."
metrics:
  duration: ~15m
  completed: 2026-07-06
---

# Phase 6 Plan 2: Presentational PollListItem + SubscribeCard Summary

Built the two pure/presentational pieces the `/polls` dashboard composes: `PollListItem`
(title + Open/Booked badge + summary + response count, wrapped in a `next/link` to `/a/<adminUrlId>`)
and `SubscribeCard` (the neutral booked-dates subscribe card carrying the new MYP-08 same-browser
copy), plus a five-case component test file — all encoding the MYP-02 ★ pluralization and
closed-null-winningDate edges in one tested place.

## What was built

- **`src/components/poll-list-item.tsx`** — `PollListItem` server component + exported `PollListRow`
  type (exactly the 7 participant-safe columns). Emerald "Booked" badge for `status === "closed"`
  (mirroring the admin page's exact Tailwind classes), else a neutral "Open" badge. Summary
  pluralizes on a numeric `=== 1` compare: `"1 date"`/`"{n} dates"`, `"1 response"`/`"{n} responses"`,
  `"0 responses"` always renders. A closed poll with a non-null `winningDate` renders the booked
  date via `formatDateWithTime` (start time sliced `HH:MM:SS` → `HH:MM`); a closed poll with a null
  `winningDate` renders the "Booked" badge with no date and does not crash (guarded before the
  formatter call — mirrors EP-FEED-EMPTY).
- **`src/components/poll-list-item.test.tsx`** — five `renderToStaticMarkup` cases (a–e), no DB/jsdom
  needed. The singular case asserts both the presence of `"1 date"`/`"1 response"` AND the absence of
  the plural forms; the null-winningDate case proves the render does not throw and shows `"Booked"`.
- **`src/components/subscribe-card.tsx`** — `SubscribeCard({ base, organizerId })` reproduces the
  admin page's neutral subscribe Card verbatim (every asserted string preserved: heading, "Add this
  once…", group-shareable note, `buildOrganizerFeedUrl` mono URL, `buildOrganizerWebcalUrl`
  "Subscribe in calendar" anchor, `CopyLinkButton`) and adds the MYP-08 line
  "Create your polls from the same browser to keep them all in one calendar." No amber border, no
  "Keep private" badge (neutral severity preserved).

## Verification

- `npx vitest run src/components/poll-list-item.test.tsx` → 5 passed, 0 failed.
- `npx tsc --noEmit` → no errors (both components type-check).
- `npx eslint` on all three files → no issues.
- PROH-2 source-review: the `PollListRow` type declares only `adminUrlId`, `title`, `status`,
  `winningDate`, `winningStartTime`, `optionCount`, `responseCount` — grep for
  `email`/`editToken`/`participantUrlId`/`name`/`creatorEmail` matches only explanatory comments,
  not the type or markup.
- SubscribeCard source-review: no "Keep private" / amber-border class in the markup.

## Deviations from Plan

None — plan executed as written. (One in-flight fix during test authoring: the case-(e) fixture id
originally contained the literal substring "null" (`closednull`), which tripped the
`not.toContain("null")` assertion; renamed to `closed2`. This was a test-fixture correction, not a
component change.)

## Commits

- `bb2e40b` feat(06-02): add presentational PollListItem + PollListRow type
- `ee08758` test(06-02): cover PollListItem badge/pluralization/null-date edges
- `a843736` feat(06-02): add shared SubscribeCard with same-browser copy (MYP-08)

## Self-Check: PASSED

- Files exist: `src/components/poll-list-item.tsx`, `src/components/poll-list-item.test.tsx`,
  `src/components/subscribe-card.tsx` — all present.
- Commits `bb2e40b`, `ee08758`, `a843736` present in git log.

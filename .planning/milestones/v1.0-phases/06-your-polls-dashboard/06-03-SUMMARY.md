---
phase: 06-your-polls-dashboard
plan: 03
subsystem: dashboard
tags: [nextjs, rsc, cookies, dashboard, no-oracle, no-leak]
requires:
  - "getPollsByOrganizerId (06-01)"
  - "PollListItem + PollListRow, SubscribeCard (06-02)"
provides:
  - "/polls 'Your polls' dashboard RSC (cookie → query → list/empty state + subscribe card)"
  - "/polls render tests (list, no-oracle empty, no-leak, dynamic source guard)"
affects:
  - "06-04 (admin page swaps its inlined subscribe card for SubscribeCard; /polls is the sibling surface)"
tech-stack:
  added: []
  patterns:
    - "cookies()-driven dynamic RSC (no dynamic/revalidate export needed in Next 16)"
    - "no-oracle empty state: byte-identical HTML for absent vs unknown cookie, no embedded token"
    - "renderToStaticMarkup DB-backed render tests with a controllable next/headers cookie mock"
key-files:
  created:
    - src/app/polls/page.tsx
    - src/app/polls/page.test.ts
  modified: []
decisions:
  - "base/feed URL is resolved ONLY in the ≥1-poll branch — the empty state never touches headers()/base, guaranteeing PROH-4 (no feed token in the empty state)."
  - "The empty state is fully static markup (no organizerId anywhere), so no-cookie and unknown-organizer renders are byte-identical (MYP-03 no oracle) by construction, not by trimming."
  - "The page issues exactly one poll read (getPollsByOrganizerId) whose 7-column shape structurally excludes participant identity/tokens (PROH-2)."
metrics:
  duration: ~20m
  completed: 2026-07-06
---

# Phase 6 Plan 3: /polls "Your polls" Dashboard Summary

Wired the tested query (06-01) and presentational components (06-02) into `/polls` — the async
default-export RSC reads the httpOnly `lfg_organizer` cookie via `next/headers`, calls
`getPollsByOrganizerId`, and renders either the organizer's owned polls newest-first (a
`PollListItem` per poll with the `SubscribeCard` on top) or an identical no-oracle 200 empty state.
Added a six-case DB-backed render test proving the MYP-01/02 list, the MYP-03 no-oracle empty state,
the PROH-2 no-leak canary, the PROH-4 no-token empty state, and the PROH-3 per-cookie dynamic guard.

## What was built

- **`src/app/polls/page.tsx`** — the dashboard RSC. Reads `cookies().get("lfg_organizer")?.value`,
  normalizes empty/whitespace to `undefined` before the query (mirrors create-poll and the
  `getPollsByOrganizerId` MYP-05 guard), then `const polls = organizerId ? await
  getPollsByOrganizerId(organizerId) : []`. Header row: `<h1>Your polls</h1>` + a persistent
  "Create a poll" `next/link` → `/`. Branch on `polls.length`: **0** → a static empty state
  (`"You haven't created any polls yet"` heading + a "Create a poll" link) that renders NO
  `SubscribeCard` and never resolves `headers()`/base/feed token; **≥1** → resolve `base` via
  `resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"))`, render `<SubscribeCard base
  organizerId />` on top, then map `polls` to `<PollListItem>` rows (keyed by `adminUrlId`).
  No `notFound()`/throw (always 200); no `export const dynamic`/`revalidate` (reading `cookies()`
  already forces a dynamic render in Next 16).
- **`src/app/polls/page.test.ts`** — six `renderToStaticMarkup(await PollsPage())` cases against
  live Postgres, with a module-level `mockCookieValue` controlling the mocked `next/headers` cookie:
  (a) MYP-01/02 populated (two polls: newest-first ordering via `indexOf`, Open + Booked badges,
  `"2 dates"`/booked-date summaries, `"2 responses"`/`"1 response"`, SubscribeCard present);
  (b) MYP-03 no-cookie empty (200, "Create a poll" link, no subscribe card, no `/feed/`);
  (c) MYP-03/PROH-4 no-oracle (no-cookie HTML **byte-identical** to unknown-organizer HTML, neither
  contains `/feed/` nor the token); (d) MYP-03 0↔1 boundary (one poll → exactly one `/a/` row, not
  the empty state); (e) PROH-2 non-vacuous no-leak canary (poll title present; canary name, email,
  edit token, and `/p/<participantUrlId>` all absent); (f) PROH-3 source guard (source reads
  `cookies(`, exports no `force-static`/`export const revalidate`).

## Verification

- `DATABASE_URL=… npx vitest run src/app/polls/page.test.ts` → **6 passed, 0 failed**.
- `npx tsc --noEmit` → no errors.
- `npm run build` → compiles; the route table lists `ƒ /polls` (**Dynamic — server-rendered on
  demand**), confirming per-cookie dynamic rendering (PROH-3 / T-06-05).
- MYP-03/T-06-06 no-oracle: case (c) asserts strict `toBe` equality of the two empty-state HTML
  strings — no status or markup distinguishes absent from unknown.
- PROH-4/T-06-11: case (b)+(c) assert the empty state omits both the SubscribeCard heading and any
  `/feed/` URL; the card renders only in case (a).
- PROH-2/T-06-04: case (e) is non-vacuous (title asserted present) while all participant secrets are
  asserted absent.

## Deviations from Plan

None affecting behavior. One in-flight fix during test authoring:

**1. [Rule 3 - Blocking] Page comment tripped the PROH-3 source guard**
- **Found during:** Task 2 (case (f) source guard).
- **Issue:** An explanatory comment in `page.tsx` contained the literal substring `force-static`,
  which the case-(f) `not.toContain("force-static")` guard flagged (the guard's intent is "no
  static-cache export", but it matches any occurrence of the literal).
- **Fix:** Reworded the comment to "A static-cache export would share one organizer's list…",
  removing the literal token. No code/behavior change.
- **Files modified:** `src/app/polls/page.tsx` (folded into the Task 1 commit via amend).
- **Commit:** `1582210`.

## Commits

- `1582210` feat(06-03): add /polls dashboard RSC (cookie → query → list/empty state)
- `12cafaf` test(06-03): cover /polls list, no-oracle empty, no-leak, dynamic

## Self-Check: PASSED

- Files exist: `src/app/polls/page.tsx`, `src/app/polls/page.test.ts` — both present.
- Commits `1582210`, `12cafaf` present in git log.

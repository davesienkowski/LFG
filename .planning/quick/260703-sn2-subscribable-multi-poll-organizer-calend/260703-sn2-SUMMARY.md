---
phase: 260703-sn2
plan: 01
status: complete
subsystem: calendar-feed
tags: [organizer, ics, webcal, drizzle-migration, cookie, feed-route]
requires:
  - polls table, options table (existing schema)
  - buildIcs / escapeIcsText / foldLine (existing calendar builders)
  - generateToken (nanoid 21-char)
  - resolveBaseUrl / buildAdminUrl (existing url helpers)
provides:
  - polls.organizer_id NULLABLE column + polls_organizer_id_idx (migration 0003)
  - getFinalizedPollsByOrganizerId (participant-safe feed query)
  - buildVcalendar multi-event ICS builder (buildIcs byte-identical)
  - GET /feed/[organizerId]/calendar.ics feed route (200-empty, no oracle)
  - lfg_organizer httpOnly cookie mint/reuse in createPoll
  - buildOrganizerFeedUrl / buildOrganizerWebcalUrl helpers + admin subscribe card
affects:
  - src/lib/db/schema.ts
  - src/lib/db/queries.ts
  - src/lib/calendar/links.ts
  - src/lib/actions/create-poll.ts
  - src/lib/urls.ts
  - src/app/a/[adminUrlId]/page.tsx
tech-stack:
  added: []
  patterns:
    - "Folder-as-final-path-segment route (calendar.ics dir) mirrors event.ics route"
    - "Shared VCALENDAR_HEADER + extracted veventLines composes both single- and multi-event ICS"
    - "Trim-truthiness cookie normalization (empty/whitespace = absent) instead of ?? which accepts ''"
    - "Non-unique index on a shared bearer token (organizer groups many polls)"
key-files:
  created:
    - src/app/feed/[organizerId]/calendar.ics/route.ts
    - src/app/feed/[organizerId]/calendar.ics/route.test.ts
    - src/lib/urls.test.ts
    - drizzle/0003_organic_metal_master.sql
    - drizzle/meta/0003_snapshot.json
  modified:
    - src/lib/db/schema.ts
    - src/lib/db/queries.ts
    - src/lib/db/queries.test.ts
    - src/lib/calendar/links.ts
    - src/lib/calendar/links.test.ts
    - src/lib/actions/create-poll.ts
    - src/lib/actions/create-poll.test.ts
    - src/lib/urls.ts
    - src/app/a/[adminUrlId]/page.tsx
    - src/app/a/[adminUrlId]/page.test.ts
    - drizzle/meta/_journal.json
decisions:
  - "organizer_id is NON-unique text — many polls share one token (that grouping IS the feed)"
  - "buildVcalendar adds X-WR-CALNAME; buildIcs deliberately does NOT, keeping buildIcs byte-identical"
  - "Feed always returns 200 (empty VCALENDAR on unknown/zero-closed) — no 404 oracle"
  - "Empty/whitespace lfg_organizer cookie treated as absent; fresh non-empty token minted (never store '')"
  - "Stable pollId-winningOptionId@lfg UID + polls.id order tiebreaker so clients update, not duplicate"
metrics:
  duration: ~24m
  completed: 2026-07-03
---

# Phase 260703-sn2 Plan 01: Subscribable Multi-Poll Organizer Calendar Feed Summary

Built an account-free subscribable calendar feed: a browser's polls group under one unguessable `lfg_organizer` cookie token, and `GET /feed/{organizerId}/calendar.ics` serves a webcal/iCal VCALENDAR with one VEVENT per finalized poll that auto-updates as new polls close.

## What was built

- **Task 1 (f1044ca)** — `polls.organizer_id` NULLABLE text column + `polls_organizer_id_idx` (migration `0003_organic_metal_master.sql`, generated + applied to local Docker Postgres). `getFinalizedPollsByOrganizerId` returns participant-safe closed-with-winner rows ordered by winning date/time with a stable `polls.id` tiebreaker; `organizerId` added to `getPollWithWinningOption`.
- **Task 2 (886ca99)** — Extracted private `veventLines()` helper; recomposed `buildIcs` from a shared `VCALENDAR_HEADER` + `veventLines` (output **byte-identical**, verified by a full pinned-output guard test); added `buildVcalendar(events, opts)` — one wrapper, N VEVENTs in input order, X-WR-CALNAME, empty-safe, escape-guarded.
- **Task 3 (5c21afb)** — `createPoll` mints/reuses the httpOnly `lfg_organizer` cookie and stores `organizerId`; empty/whitespace cookie normalized to absent (EP-ORG-EMPTY); cookie set only when absent/empty, before redirect.
- **Task 4 (55e5c49)** — `GET /feed/[organizerId]/calendar.ics` route: 200 populated VCALENDAR with stable per-poll UIDs; identical empty 200 for unknown/zero-closed (no oracle); null-date rows filtered (EP-FEED-EMPTY); `Cache-Control: no-store`; no participant/token leak.
- **Task 5 (f6b293b)** — `buildOrganizerFeedUrl`/`buildOrganizerWebcalUrl` helpers; neutral admin subscribe card (feed URL + webcal anchor + copy button) shown only when `organizerId` set, hidden for legacy polls. Final gate: full suite + build green.

## Deviations from Plan

None for Rules 1-4. One minor test-authoring correction inside Task 4: the initial UID assertions in the feed route test were not fold-tolerant — a UID built from two UUIDs exceeds 75 octets and is correctly RFC5545 line-folded (CRLF + space). The ICS output was correct; the test was adjusted to unfold the body (`replace(/\r\n /g, "")`) before matching UIDs and asserting token absence. This was caught and fixed within the same task before its commit (not a code deviation — the builder behaved exactly as designed).

## Migration

- Generated migration file: **`drizzle/0003_organic_metal_master.sql`** (`ALTER TABLE polls ADD COLUMN organizer_id text` + `CREATE INDEX polls_organizer_id_idx`).
- Applied to LOCAL Docker Postgres only.
- **Orchestrator follow-up:** prod Neon `db:migrate` (apply 0003) + `npx vercel@latest deploy --prod --yes` are the orchestrator's job — deliberately NOT performed by this executor.

## Verify results (actual)

- `src/lib/db/queries.test.ts` — 13 passed.
- `src/lib/calendar/links.test.ts` — 24 passed (all prior buildIcs tests unchanged + pinned byte-stability guard + new buildVcalendar block).
- `src/lib/actions/create-poll.test.ts` — 19 passed (pre-existing + MINT/REUSE/SHARED/EP-ORG-EMPTY).
- `src/app/feed/[organizerId]/calendar.ics/route.test.ts` — 4 passed.
- **FULL SUITE:** `DATABASE_URL=… npm test` → **23 files, 211 tests passed**.
- **BUILD:** `DATABASE_URL=… npm run build` → **green** (Compiled successfully, TypeScript passed; `/feed/[organizerId]/calendar.ics` listed as a dynamic route).

## Self-Check: PASSED

- Created files exist: route.ts, route.test.ts, urls.test.ts, 0003_organic_metal_master.sql — all FOUND.
- Commits FOUND: f1044ca, 886ca99, 5c21afb, 55e5c49, f6b293b.

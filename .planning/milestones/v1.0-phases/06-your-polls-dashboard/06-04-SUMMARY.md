---
phase: 06-your-polls-dashboard
plan: 04
subsystem: entry-points
tags: [nextjs, rsc, cookies, entry-points, subscribe]
requires: ["06-02"]
provides:
  - "Admin page entry links (/polls, /) + shared SubscribeCard swap"
  - "Landing page cookie-gated 'Your polls' link"
affects:
  - src/app/a/[adminUrlId]/page.tsx
  - src/app/page.tsx
tech-stack:
  added: []
  patterns:
    - "RSC reads cookies() to force per-cookie dynamic render (no dynamic/revalidate export)"
    - "Shared presentational component as single source of truth for subscribe copy"
key-files:
  created:
    - src/app/page.test.ts
  modified:
    - src/app/a/[adminUrlId]/page.tsx
    - src/app/a/[adminUrlId]/page.test.ts
    - src/app/page.tsx
decisions:
  - "Entry links styled as small muted text links (text-muted-foreground hover:text-foreground hover:underline), navigation not primary buttons"
  - "Admin entry-link row added as its own <nav> at the top of <main>, above the title"
metrics:
  tasks: 3
  files: 4
  duration: ~15m
  completed: 2026-07-06
---

# Phase 6 Plan 4: Entry Points + SubscribeCard Swap Summary

Added the `/polls` discoverability entry points — a "Your polls" + "Create a poll" link row on the admin page (MYP-06) and a cookie-gated "Your polls" link on the landing page (MYP-06) — and swapped the admin page's inlined subscribe card to the shared `<SubscribeCard>` (06-02) so the same-browser guidance (MYP-08) renders from a single tested source on both `/polls` and admin.

## What Was Built

### Task 1 — Admin page entry links + SubscribeCard swap (`src/app/a/[adminUrlId]/page.tsx`)
- Added a `<nav>` row at the top of `<main>` (above the `<h1>` title) with two `next/link`s: "Your polls" → `/polls` and "Create a poll" → `/`. Both are static paths with no token embedded (T-06-09).
- Replaced the ~30-line inline subscribe `<Card>` with `<SubscribeCard base={base} organizerId={poll.organizerId} />`, keeping the `poll.organizerId ? (...) : null` guard so legacy null-organizer polls still render no subscribe card (T-06-12).
- Removed the now-unused `buildOrganizerFeedUrl` / `buildOrganizerWebcalUrl` imports (verified no other references remain in the file). `CopyLinkButton` is still used by the participant/admin link cards, so it was kept.

### Task 2 — Landing page cookie-gated link (`src/app/page.tsx`)
- Converted `Home` from a sync static component to `export default async function Home()`.
- Reads `const cookieStore = await cookies();` and `const hasOrganizer = Boolean(cookieStore.get("lfg_organizer")?.value?.trim());` — empty/whitespace treated as absent (mirrors create-poll / `/polls`).
- Renders a "Your polls" → `/polls` link (small muted nav) only when `hasOrganizer`; renders nothing there otherwise (first-time visitors see no dead link).
- No `export const dynamic` and no `export const revalidate` — reading `cookies()` forces the tiny page dynamic per-cookie, satisfying PROH-3 / T-06-08 by construction.

### Task 3 — Test updates (`src/app/a/[adminUrlId]/page.test.ts`, `src/app/page.test.ts`)
- Admin: added a dedicated `it` asserting `href="/polls"` + "Your polls" + `href="/"` + "Create a poll" (MYP-06). In the WITH-organizerId subscribe test, added an assertion for the same-browser copy ("Create your polls from the same browser", MYP-08) while preserving the feed-URL, "Subscribe to your booked-dates calendar", and single "Keep private" assertions.
- Landing: created `src/app/page.test.ts` with a controllable `mockCookieValue` mock of `next/headers`. Three cases: cookie-set shows the `/polls` link; cookie-absent hides it; whitespace cookie treated as absent (hides it). No DB needed.

## Verification Results

- `DATABASE_URL=... npx vitest run 'src/app/a/[adminUrlId]/page.test.ts' src/app/page.test.ts` — **16 passed, 0 failed**.
- Full suite `DATABASE_URL=... npx vitest run` — **270 passed, 0 failed** (no regressions).
- `tsc --noEmit` — clean (exit 0); admin + landing routes type-check, landing now dynamic.

## Prohibition / Threat Compliance

- **PROH-3 / T-06-08:** `src/app/page.tsx` reads `cookies()` and exports NO `dynamic`/`revalidate` — dynamic render is forced per-cookie; the link is the static `/polls` path. Verified by source review.
- **T-06-09:** both admin entry links and the landing link are static paths (`/polls`, `/`) — no admin/participant/organizer token in any href.
- **T-06-12:** the admin subscribe swap preserves the `poll.organizerId ?` guard; `SubscribeCard` is the neutral card only (no amber / no "Keep private") — asserted by the existing admin subscribe-card test (single "Keep private" count unchanged).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

All created/modified files verified on disk; all three task commits present in git history.

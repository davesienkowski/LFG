---
created: 2026-07-02T18:46:39.253Z
title: Shared subscribable calendar feed of finalized poll dates
area: general
files:
  - src/lib/calendar/links.ts
  - src/lib/db/queries.ts
  - src/app/p/[participantUrlId]/event.ics/route.ts
---

## Problem

Users want a **shared, subscribable calendar** of all finalized poll dates that they add to
their phone's calendar **once** and then see every picked event (past + future), auto-updating
as new polls close — instead of adding each booked date one event at a time (which the current
finalization-email Add-to-Calendar links, shipped in quick task 260702-k1u, already cover for a
single event).

Candidate **Phase 5 / feature**. Queued for planning AFTER the owner reviews the current
Add-to-Calendar feature (quick 260702-k1u — shipped + deployed 2026-07-02).

## Solution

**Recommended approach — app-hosted subscribable iCal feed (NOT the Google Calendar API):**
Add a GET Route Handler that emits a `VCALENDAR` read from Neon (one `VEVENT` per finalized
poll's winning date). Users subscribe once via a `webcal://` URL (iPhone: Settings → Calendar →
Add Subscribed Calendar; Android/Google: Add calendar → From URL) — read-only, auto-updates on
each fetch. Reuses the timezone-safe `.ics` builder already shipped in `src/lib/calendar/links.ts`
(`buildIcs`) — extend it / add a multi-event VCALENDAR builder. Fits the project's core
constraints: $0, no OAuth, no participant accounts, boring/self-hostable tech. **Does NOT need
the Gmail account at all** (the app is the calendar source).

**KEY DESIGN DECISION to resolve at planning time — scoping / privacy:** a single global feed of
ALL finalized polls would leak every group's events. The clean fit for the no-accounts model is a
**per-organizer feed keyed by an unguessable token** (like the existing admin token): each
organizer subscribes to a calendar of THEIR finalized polls. A per-poll-group feed is a possible
later variant. Do NOT ship an unscoped global feed.

**Alternative (heavier — only if events must live inside a real Google Calendar):** Google
Calendar API + a **service account** (GCP project + service-account JSON key stored as a Vercel
secret) writing to one shared calendar exposed via its public/secret iCal address. Still $0 but
adds a Google Cloud dependency + a new secret. Not recommended unless the owner specifically wants
Google-Calendar-managed events (i.e., managed from calendar.google.com rather than served by LFG).

**Notes for planning:**
- Reuse the timezone discipline already established (floating local time when `start_time` set;
  all-day DTEND-exclusive next day when NULL; no invented timezone — D-11/P3).
- Serve only finalized/closed polls in the feed; use participant-safe columns (never expose the
  admin token). Set a sensible `Cache-Control` and `Content-Type: text/calendar`.
- Consider `X-WR-CALNAME` / calendar name so it shows up nicely on the phone.
- Surface the subscribe URL somewhere the organizer sees it (e.g., the finalized admin page).

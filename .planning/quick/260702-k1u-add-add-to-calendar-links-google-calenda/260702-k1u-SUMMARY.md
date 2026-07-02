---
quick_id: 260702-k1u
type: execute
mode: quick
title: Add-to-Calendar links (Google Calendar + hosted .ics) in the finalization email
subsystem: email
tags: [icalendar, ics, google-calendar, email, nextjs-route-handler, timezone-safe]

key-files:
  created:
    - src/lib/calendar/links.ts
    - src/lib/calendar/links.test.ts
    - src/app/p/[participantUrlId]/event.ics/route.ts
    - src/app/p/[participantUrlId]/event.ics/route.test.ts
  modified:
    - src/lib/email/send.ts
    - src/lib/email/send.test.ts
    - src/lib/email/templates.ts
    - src/lib/email/templates.test.ts
    - src/lib/db/queries.ts
    - src/lib/actions/close-poll.ts
    - src/lib/actions/close-poll.test.ts

key-decisions:
  - "3h (180 min) default duration for a timed D&D session event"
  - "All-day event when startTime is NULL (DTEND / Google second date = next day, end-exclusive via Date.UTC)"
  - "Floating local time when startTime is set (no TZID, no Z) — the app stores no timezone (D-11/P3)"
  - ".ics route keyed by participantUrlId; serves a CLOSED poll only; participant-safe columns (no admin_url_id)"
  - "No LOCATION property; title falls back title -> description -> 'LFG event'; DESCRIPTION/details omitted when empty"

patterns-established:
  - "Pure calendar builders mirror format-date.ts: Date.UTC arithmetic only, never new Date(dateString)"
  - "Best-effort calendar generation in a pre-after() try/catch — a builder throw never blocks the redirect nor reverts the close"
  - "Hosted-artifact GET Route Handler returns an identical bare 404 for open/undecided/unknown (no oracle)"

requirements-completed: []

duration: 6min
completed: 2026-07-02
status: complete
---

# Quick Task 260702-k1u: Add-to-Calendar Links Summary

**A finalization email that carries an "Add to Google Calendar" link plus a hosted `/p/{id}/event.ics` link and an attached `event.ics`, backed by pure timezone-safe iCalendar/Google-URL builders and a closed-poll-only Route Handler.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-07-02T14:38:00Z
- **Completed:** 2026-07-02T14:42:00Z
- **Tasks:** 3
- **Files modified/created:** 11 (4 created, 7 modified)

## Accomplishments

- Pure `buildGoogleCalendarUrl` + `buildIcs` builders (`src/lib/calendar/links.ts`): all-day vs floating-timed output, correct midnight/month/year/leap rollover via `Date.UTC`, RFC5545 escaping before code-point-safe line folding, CRLF, DESCRIPTION only when non-empty, never a LOCATION, title fallback chain.
- Attachment-capable `sendEmail` seam: `SendArgs.attachments` threaded into nodemailer directly and mapped to resend's `{ filename, content: Buffer }` shape; the `none` branch is untouched; invite/confirmation sends stay byte-identical.
- Finalization email renders both calendar links (Outlook-safe inline-styled `<a>`), presence-gated per URL, degrading cleanly to nothing when both are absent; never emits an `/a/` admin path.
- Hosted `GET /p/[participantUrlId]/event.ics` serving `text/calendar` for a CLOSED poll only, with an identical bare 404 for open/undecided/unknown polls (no oracle) and `Cache-Control: no-store`; a `buildIcs` throw degrades to 404.
- `closePoll` builds the Google URL + `.ics` link + `event.ics` attachment best-effort in a single pre-`after()` try/catch (CAL-06) and passes them into the finalization render + every dedup-loop `sendEmail` call; the `.ics` content is built once and reused across recipients.

## Task Commits

1. **Task 1: Pure calendar builders (Google URL + iCalendar), TDD** — `4d933ae` (feat) — RED/GREEN in one commit (test file + implementation; the test-first RED state was verified as a module-not-found failure before implementing).
2. **Task 2: Attachment-capable send seam + finalization calendar block** — `4ade86f` (feat)
3. **Task 3: Hosted .ics route + participant-safe query + close-poll wiring** — `41467c0` (feat)

_Docs/metadata commit handled by the orchestrator (per task constraints)._

## Files Created/Modified

- `src/lib/calendar/links.ts` (NEW) — `buildGoogleCalendarUrl`, `buildIcs`, private TZ-safe helpers (`addDaysUtc`, `timedRange`, `escapeIcsText`, `resolveTitle`, code-point `foldLine`, `DEFAULT_DURATION_MIN=180`).
- `src/lib/calendar/links.test.ts` (NEW) — 18 tests across all-day/timed/both-midnight-rollovers/year-boundary/escaping/empty+whitespace-title/empty-description/no-LOCATION/CRLF/floating-no-Z.
- `src/app/p/[participantUrlId]/event.ics/route.ts` (NEW) — closed-poll-only `text/calendar` GET, identical 404 otherwise.
- `src/app/p/[participantUrlId]/event.ics/route.test.ts` (NEW) — DB-backed closed-200 / open-404 / unknown-404.
- `src/lib/email/send.ts` — `SendArgs.attachments` threaded into smtp + resend.
- `src/lib/email/send.test.ts` — smtp/resend attachment threading + none-branch no-op.
- `src/lib/email/templates.ts` — `renderFinalizationEmail` gains `googleCalendarUrl` + `icsUrl`; new `calendarBlock` shell slot.
- `src/lib/email/templates.test.ts` — calendar block render/degrade + extended T-04-02 no-`/a/`-leak.
- `src/lib/db/queries.ts` — NEW `getFinalizedPollByParticipantUrlId` (participant-safe LEFT JOIN, omits admin_url_id).
- `src/lib/actions/close-poll.ts` — best-effort calendar wiring in the pre-`after()` try/catch + attachment through the send loop.
- `src/lib/actions/close-poll.test.ts` — asserts the finalization send carries `calendar.google.com` + a single `event.ics` attachment.

## Decisions Made

None beyond the plan — all five plan `<decisions>` and every folded `<edge_probe_resolutions>` finding implemented as written (3h duration, all-day next-day exclusive DTEND, floating no-zone timed, participant-keyed closed-only route, no LOCATION, DESCRIPTION/details omitted when empty, escape-before-fold at code-point boundaries, CAL-06 pre-`after()` try/catch).

## Deviations from Plan

None - plan executed exactly as written. The Task 1 TDD RED/GREEN produced a single commit (test + implementation together) rather than two, because a green baseline for a not-yet-existing module is a module-not-found failure; RED was verified (`Cannot find module './links'`) before writing `links.ts`, then GREEN confirmed with `npm test -- links` (18 passing) in the same working set.

## Issues Encountered

- `npm test -- send` also matches `send-invites.test.ts`, which needs `DATABASE_URL`; running the verification with `DATABASE_URL` exported resolves it. Not a code issue — a filter-scope artifact.

## Verification

- **Full local suite GREEN with DB-backed tests:** `DATABASE_URL=postgres://postgres:password@localhost:5432/lfg npm test` → **21 files, 173 tests passing** (includes links, send, templates, queries, route, close-poll).
- **Production build GREEN:** `npm run build` compiles, TypeScript passes, and the new `ƒ /p/[participantUrlId]/event.ics` dynamic route is registered.
- **Timezone shape:** covered by unit tests — all-day emits `DTSTART;VALUE=DATE` with next-day `DTEND` (incl. `2026-12-31 -> 20270101`); timed emits floating `DTSTART:YYYYMMDDTHHMMSS` with no `Z`/`TZID`, end = start+180min with midnight rollover.

### Owner check outstanding (Mailpit interactive)

A full interactive Mailpit close was **not run** from here: Mailpit is not currently running (port 1025 closed) and `.env.local` has no SMTP config, so it would require starting Mailpit, setting `EMAIL_PROVIDER=smtp`, and clicking through create → vote → Book it in the UI. Per the plan's allowance this is recorded as an **owner check**:

1. Start Mailpit, set `EMAIL_PROVIDER=smtp` + `SMTP_HOST/SMTP_PORT=1025` + `EMAIL_FROM`.
2. Create a poll, add a participant with an email + a vote, click "Book it".
3. In Mailpit, confirm the finalization message shows an "Add to Google Calendar" link, an "Add to Apple / Outlook Calendar" link, and carries an `event.ics` attachment.
4. Open the hosted `/p/{participantUrlId}/event.ics` link and confirm the browser downloads a `text/calendar` file whose VEVENT date matches the booked date.

The rendered HTML (both links) and the closed-poll `.ics` body are already asserted by `templates.test.ts`, `close-poll.test.ts`, and `route.test.ts`; the owner check is the end-to-end Mailpit visual only.

## No prod deploy

Stopped after local verification per task constraints — no `vercel deploy`.

## Self-Check: PASSED

All 4 created files exist on disk; all 3 task commits (`4d933ae`, `4ade86f`, `41467c0`) present in git history.

---
*Quick task: 260702-k1u*
*Completed: 2026-07-02*

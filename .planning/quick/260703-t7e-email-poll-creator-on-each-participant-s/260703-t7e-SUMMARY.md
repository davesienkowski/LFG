---
task: 260703-t7e
title: Email the poll creator on each participant response (submit + edit)
status: complete
commits:
  - e65400d  # Task 1: persist nullable polls.creator_email (migration 0004)
  - 549547c  # Task 2: getPollAdminNotifyTargets query + creator-notify template
  - 0c8bbab  # Task 3: notify creator on each response (submit + edit)
date: 2026-07-04
migration: drizzle/0004_late_the_santerians.sql   # ALTER TABLE "polls" ADD COLUMN "creator_email" text;
files_created: []
files_modified:
  - src/lib/db/schema.ts
  - drizzle/0004_late_the_santerians.sql          # generated
  - drizzle/meta/0004_snapshot.json               # generated
  - drizzle/meta/_journal.json                    # generated
  - src/lib/actions/create-poll.ts
  - src/lib/actions/create-poll.test.ts
  - src/lib/db/queries.ts
  - src/lib/db/queries.test.ts
  - src/lib/email/templates.ts
  - src/lib/email/templates.test.ts
  - src/lib/actions/submit-response.ts
  - src/lib/actions/submit-response.test.ts
  - src/lib/actions/update-response.ts
  - src/lib/actions/update-response.test.ts
---

# 260703-t7e: Email the poll creator on each participant response

## One-liner

The poll creator's opted-in email is now persisted as a NULLABLE `polls.creator_email`
(migration 0004), and both participant actions fire a SEPARATE best-effort `after()`
notification — on the first submit AND on every edit — naming the participant and
linking the `/a/` admin results view, with the admin token confined to the `after()`
closure (three-token discipline) and the participant's email/token never disclosed (F2).

## What was built

**Task 1 (e65400d) — persist the creator email**
- Added `creatorEmail: text("creator_email")` (NULLABLE) to the `polls` pgTable, next to `organizerId`.
- Generated `drizzle/0004_late_the_santerians.sql` — a single `ALTER TABLE "polls" ADD COLUMN "creator_email" text;` (no NOT NULL, no index), stacked on 0003. Applied to the local Docker Postgres (`lfg-db-1` on :5432). Prod Neon NOT touched.
- `createPoll` now persists `creatorEmail: creatorEmail ?? null` on the poll insert (empty/absent -> NULL). The existing rqc admin-link recovery `after()` send is unchanged.
- Tests assert the address is persisted when supplied and NULL when absent.

**Task 2 (549547c) — notify-targets query + creator-recipient template**
- `getPollAdminNotifyTargets(pollId)` in queries.ts returns `{ adminUrlId, creatorEmail } | null`, selecting ONLY those two columns — the sole server-side path resolving `admin_url_id` for the participant actions.
- `renderParticipantResponseNotification({ title, participantName, adminUrl })` in templates.ts — a creator-recipient template carrying the `/a/` admin URL (deliberate T-04-02 exception, like `renderCreatorAdminLinkEmail`). Heading `New response to <title>`, CTA `View current results`. Signature has NO email/token param (F2).
- DB-backed query tests (present email / null email / unknown poll) + template tests (heading, name, admin URL, CTA + F2 non-vacuous canary).

**Task 3 (0c8bbab) — wire the notifications**
- `submit-response.ts`: after the votes INSERT, alongside the unchanged participant-confirmation block, a SEPARATE best-effort `after()` creator-notify fires when a stored `creator_email` exists.
- `update-response.ts`: the SAME creator-notify added after the name/email refresh; no participant-confirmation added (deliberately stays absent). New imports: `after`, `headers`, `sendEmail`, `renderParticipantResponseNotification`, `getPollAdminNotifyTargets`, `buildAdminUrl` + `resolveBaseUrl`.
- Both capture the base URL in-request BEFORE `after()`, pass `participantName: name` only, ignore the send result, and keep `adminUrlId` inside the `after()` closure. Both sit AFTER the status guard + durable write (F1).
- Tests cover present/absent `creator_email` for both actions; the notify HTML contains `/a/<adminUrlId>` + the participant name.

## Deviations from Plan

None — plan executed exactly as written. Rules 1-4 not triggered.

## Verification

- `DATABASE_URL=... npm test` — **220 passed (23 files)**, 0 failed. New/changed suites: create-poll (19), queries (16), templates (10), submit-response (16), update-response (9).
- `DATABASE_URL=... npm run build` — **green** (Compiled successfully, TypeScript passed, all routes generated).
- Migration: `drizzle/0004_late_the_santerians.sql` — single `ADD COLUMN "creator_email" text` (no NOT NULL, no index), applied to LOCAL Docker Postgres only (column verified present via `\d polls`).
- Three-token leak grep: `getPollByParticipantUrlId` / `getParticipantByEditToken` still select no `adminUrlId`/`creatorEmail`; every `adminUrlId` reference in submit/update-response is assigned from `getPollAdminNotifyTargets` and consumed only inside an `after()` closure — never in a return value or a variable that escapes the action.

## Threat model disposition (all upheld)

- T-t7e-01/02 (admin_url_id + creator_email disclosure) — mitigated: resolved only via `getPollAdminNotifyTargets`, used only inside `after()`; no participant-facing read selects either.
- T-t7e-03 (markup injection) — accepted: `participantName` interpolated exactly as `title` via `renderShell`, no new raw-HTML path.
- T-t7e-04 (best-effort send failure) — mitigated: scheduled via `after()`, result ignored, never affects the redirect (D-02).
- T-t7e-05 (misdirected recipient) — mitigated: `to` is the poll's own stored `creator_email`, read server-side by `poll.id`.
- T-t7e-06 / F2 (over-disclosure) — mitigated: template signature has no email/token param; actions pass `participantName: name` only.

## Known Stubs

None.

## Follow-up (orchestrator)

Prod Neon migrate (0003 + 0004 together) + a single Vercel deploy are the orchestrator's
batched follow-up — this task performed **no prod migrate and no deploy**. Prod is still
at the pre-sn2 deploy; commits through this task (0c8bbab) are on master but not yet on prod.

## Self-Check: PASSED

- All three per-task commits present on master (e65400d, 549547c, 0c8bbab).
- Migration file `drizzle/0004_late_the_santerians.sql` exists and is applied locally.
- Full suite (220) + build both green.

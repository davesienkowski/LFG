---
phase: 07-respondent-tracking-nudges
plan: 02
subsystem: respondent-tracking-backend
tags: [respondent-tracking, nudge, email, admin-only, no-leak]
requires:
  - "07-01: invitations table + sendInvites best-effort invitation recording"
  - "getPollByAdminUrlId, sendEmail seam, renderShell, urls helpers (v1.0)"
provides:
  - "getInvitationTrackingForPoll(pollId): admin-only [{ email, responded }] read"
  - "renderReminderEmail({ title, participantUrl }): participant-link reminder template"
  - "nudgeNonRespondents server action (reuses SendInvitesState/SendInviteResult)"
affects:
  - "07-03 UI plan: Who's-responded card + Nudge control render these three artifacts"
tech-stack:
  added: []
  patterns:
    - "Correlated EXISTS with EXPLICIT literal table qualifiers (single-table FROM makes drizzle omit ${column} qualifiers)"
    - "Server action re-derives poll from admin token + re-queries recipients server-side (never a client list)"
key-files:
  created:
    - src/lib/actions/nudge-non-respondents.ts
    - src/lib/actions/nudge-non-respondents.test.ts
  modified:
    - src/lib/db/queries.ts
    - src/lib/db/queries.test.ts
    - src/lib/email/templates.ts
    - src/lib/email/templates.test.ts
decisions:
  - "Correlated EXISTS written as literal SQL (invitations.* vs p.*) because a single-table main FROM makes drizzle render ${column} interpolations unqualified, collapsing the correlation to `poll_id = poll_id` (always true)."
  - "Nudge reuses SendInvitesState/SendInviteResult by import (no redefinition) so the 07-03 UI mirrors InviteByEmailForm chips verbatim."
metrics:
  duration: ~35m
  tasks: 3
  files: 6
  completed: 2026-07-07
---

# Phase 7 Plan 02: Respondent Tracking & Nudge Backend Summary

Admin-only respondent-tracking read, a participant-link reminder email template, and the security-critical `nudgeNonRespondents` server action — all three UI Prohibition-Probe correctness guards (server-side recompute, closed-poll re-check, admin-token authorization) enforced in the action layer and covered by DB-backed tests.

## What Was Built

### Task 1 — `getInvitationTrackingForPoll` (admin-only responded read)
`src/lib/db/queries.ts`: one row per invitation `{ email, responded }`, ordered by `invited_at` asc with a stable `invitations.id` tiebreaker. `responded` is a correlated `EXISTS` — true iff some participant on the SAME poll has a case-insensitively matching email. Cross-poll isolated (correlated to `invitations.poll_id`), NULL participant emails never match. A new admin-only read that deliberately returns invitation emails but is never called by a participant-facing route (D-09 / getVoterEmailsForPoll discipline).

### Task 2 — `renderReminderEmail` (participant-link reminder)
`src/lib/email/templates.ts`: built from the shared `renderShell`, heading "Reminder: your response is needed", CTA = the participant voting link, label "View the poll & vote". Accepts ONLY a participant URL — a participant-recipient template, so the no-admin-URL discipline (T-04-02 / T-07-04) applies exactly as for `renderInviteEmail`; NOT a creator-recipient admin-URL exception. Subject is owned by the nudge action.

### Task 3 — `nudgeNonRespondents` server action
`src/lib/actions/nudge-non-respondents.ts` ("use server"): re-derives the poll from `adminUrlId` (`notFound()` on miss), refuses a closed poll server-side, re-queries CURRENT non-respondents via `getInvitationTrackingForPoll` (ignores any client-supplied recipient list), then sends best-effort sequential reminders reusing the `sendEmail` seam and returning `SendInviteResult` rows. Writes no new invitation rows. Imports and reuses `SendInvitesState` / `SendInviteResult` from `send-invites.ts`.

## Load-Bearing Correctness Guards (all tested)

| Guard | Where | Test |
|-------|-------|------|
| Poll re-derived from admin token, never a client poll id (T-07-02) | nudge step 1 | (a) unknown token -> notFound + zero sends |
| Recipients re-queried server-side; client recipient/address list ignored (Probe #1) | nudge step 3 | (c) only non-respondents emailed; (d) live re-query; (g) stray fields ignored |
| Closed-poll re-check server-side (Probe #3 / T-07-03) | nudge step 2 | (b) closed poll -> _form error + zero sends even with a recipient field |
| Cross-poll isolation of the responded match (T-07-10) | EXISTS on invitations.poll_id | queries: same-email voter on another poll never flips responded |
| No email leak — tracking read admin-only (T-07-01) | queries.ts | grep confirms only queries/nudge callers |
| Reminder carries participant link only, no /a/ (T-07-04) | renderReminderEmail | templates: no /a/ substring, no admin URL |
| Best-effort batch; nudge writes no invitations | nudge step 6 | (f) rate_limited/failed never suppresses others; (h) count unchanged |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Correlated EXISTS rendered unqualified by drizzle**
- **Found during:** Task 1 (initial test run: all invitations returned `responded=true`).
- **Issue:** Writing the correlation with drizzle `${participants.pollId}` / `${invitations.pollId}` interpolation rendered every column UNQUALIFIED (`where "poll_id" = "poll_id" and lower("email") = lower("email")` — trivially true). Drizzle omits column qualifiers when a query's main FROM has a SINGLE table (here just `invitations`); the working count-subquery precedent in `getPollsByOrganizerId` only qualifies because it has a JOIN (multiple tables).
- **Fix:** Wrote the `EXISTS` with explicit literal qualifiers — `participants p` aliased in the subquery vs. literal `invitations.poll_id` / `invitations.email` for the outer correlation — so the correlation (and cross-poll isolation) is unambiguous regardless of drizzle's qualifier elision. Documented inline.
- **Files modified:** src/lib/db/queries.ts
- **Commit:** b56a058
- **Verified:** cross-poll isolation test now passes (nomatch@example.com stays responded=false despite a same-email voter on another poll).

No other deviations — Tasks 2 and 3 executed as written.

## Verification

- `npm test -- src/lib/db/queries.test.ts src/lib/email/templates.test.ts src/lib/actions/nudge-non-respondents.test.ts` — 49 passed, 0 failed (DB-backed, DATABASE_URL exported to local Docker Postgres).
- `grep -rn getInvitationTrackingForPoll src/` — zero participant-route callers (only queries.ts definition + nudge action + tests).
- `npx eslint` on all six touched files — no issues.
- `npx tsc --noEmit` — no errors project-wide.

## Known Stubs

None. All three artifacts are fully wired and tested; the 07-03 UI plan consumes them.

## Self-Check: PASSED

- FOUND: src/lib/actions/nudge-non-respondents.ts
- FOUND: src/lib/actions/nudge-non-respondents.test.ts
- FOUND (modified): src/lib/db/queries.ts, src/lib/db/queries.test.ts, src/lib/email/templates.ts, src/lib/email/templates.test.ts
- FOUND commit b56a058 (Task 1), 205d591 (Task 2), a805a42 (Task 3)

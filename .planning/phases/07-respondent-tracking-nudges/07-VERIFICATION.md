---
phase: 07-respondent-tracking-nudges
verified: 2026-07-07T22:10:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Prod ship: back up prod Neon (pg18 client, outside repo), apply the 0005 invitations migration to prod, deploy via `npx vercel@latest deploy --prod --yes`, and smoke-check the deployed admin page renders the 'Who's responded' card."
    expected: "Non-empty timestamped backup exists under /home/dave/lfg-db-backups/ before migration; prod information_schema lists `invitations`; production deployment succeeds; admin page returns 200 and renders the card."
    why_human: "Requires live prod credentials, a real backup/migrate/deploy sequence against Neon, and a live smoke-check — not verifiable by static codebase inspection. (07-04 Task 1, not yet executed — no 07-04-SUMMARY.md exists.)"
  - test: "Send a real invite to an inbox-controlled address on the deployed prod app, confirm it shows 'Not yet responded', click 'Nudge non-respondents', and check that the reminder email actually arrives in the inbox (not spam) with a working participant link; vote and confirm the badge flips to 'Responded'."
    expected: "Reminder email ('Reminder: your response is needed') delivers to inbox with a working participant link; responded/not-responded status updates correctly after voting."
    why_human: "Real email deliverability (inbox vs. spam, actual SMTP/Resend delivery) cannot be verified by an agent with no inbox access. (07-04 Task 2, explicitly a `checkpoint:human-verify` blocking task — not yet executed.)"
---

# Phase 7: Respondent Tracking & Nudges Verification Report

**Phase Goal:** The organizer can see who they invited but hasn't voted yet and chase the stragglers with a single click — without retyping the invite. Sending invitations now records each recipient, giving respondent tracking its source of truth (v1.0 sent invites without recording who received them).

**Verified:** 2026-07-07T22:10:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

**Scope note:** Plans 07-01/02/03 (code deliverables) are complete and are the subject of this verification. Plan 07-04 (prod backup → migrate → deploy + human real-inbox nudge check) is a separate, not-yet-executed plan (no `07-04-SUMMARY.md` exists) that requires live infrastructure access and a human inbox — it cannot be verified by static codebase inspection. Both of its tasks are listed under Human Verification below rather than reported as code gaps, per the phase's own plan design (07-04 is explicitly isolated as "a self-serve prod operation... kept separate from autonomous code work").

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Sending invitation emails records each recipient against the poll, so the invited list survives after the send. | VERIFIED | `src/lib/db/schema.ts:159-177` — additive `invitations` table (`poll_id` FK cascade, `email`, `invited_at`), functional unique index `(poll_id, lower(email))`. `src/lib/actions/send-invites.ts:113-133` — best-effort `db.insert(invitations)...onConflictDoNothing()` inside the `if (result.ok)` branch only (never on `rate_limited`/`failed`). Migration `drizzle/0005_easy_madripoor.sql` is additive-only (`CREATE TABLE` + `CREATE UNIQUE INDEX`, no `ALTER`); applied locally and confirmed via `psql \d invitations`. `send-invites.test.ts` RESP-03 group: (a) ok→1 row, (b) rate_limited/failed→0 rows, (c) any-casing re-invite→still 1 row, (d) `SendInviteResult` contract unchanged — all pass. |
| 2 | The admin view shows every invited email with a clear "responded" or "not yet responded" status, matched to the participant who actually voted. | VERIFIED | `src/lib/db/queries.ts:368-385` — `getInvitationTrackingForPoll` returns `{ email, responded }[]` via a correlated `EXISTS` matched case-insensitively (`lower(p.email) = lower(invitations.email)`) and poll-scoped (`p.poll_id = invitations.poll_id`, explicit literal qualifiers to avoid drizzle's single-table qualifier elision bug — documented and tested). `src/components/whos-responded-card.tsx` renders emerald "Responded" / amber "Not yet responded" badges plus the mandatory disambiguating caption ("Only counts people invited by email through this tool.") always paired with the summary stat. Wired into `src/app/a/[adminUrlId]/page.tsx:108,232-237`. `page.test.ts` cases (a)-(d) cover EMPTY / POPULATED-OPEN / POPULATED-CLOSED / NO-LEAK-when-unconfigured, all non-vacuous (real seeded data, real HTML assertions). Cross-poll isolation and no-leak-to-participant-surface independently tested (`page.test.ts` for admin; `p/[participantUrlId]/page.test.ts` non-vacuous canary + structural grep guard). |
| 3 | The organizer can trigger a one-click "nudge" that emails only the non-respondents, each message carrying the participant link. | VERIFIED | `src/lib/actions/nudge-non-respondents.ts` — re-derives poll from admin token (`notFound()` on miss), refuses closed poll server-side, re-queries current non-respondents via `getInvitationTrackingForPoll` (client-supplied lists ignored), sends via `sendEmail` using `renderReminderEmail` (participant URL only, no admin URL). `src/components/nudge-control.tsx` — `useActionState(nudgeNonRespondents)`, hidden-input form submits ONLY `adminUrlId`, disabled + "Everyone's responded — nothing to nudge." at zero non-respondents. `nudge-non-respondents.test.ts` (9 tests): unknown token → notFound + zero sends; closed poll → `_form` error + zero sends; server-side recompute proven (responded invitations excluded, re-query reflects live state, stray client fields ignored); best-effort batch (rate_limited/failed doesn't suppress others); writes zero new invitation rows. |
| 4 | The nudge routes through the existing env-switched `sendEmail()` seam — with no email configured it degrades gracefully (no error, copy-link fallback) exactly like v1.0 invites. | VERIFIED | `nudge-non-respondents.ts:83` calls the same `sendEmail` from `@/lib/email/send` used by `sendInvites`. `src/lib/email/send.ts:72-74` — `PROVIDER === "none"` returns `{ ok: false, error: "Email not configured" }`, never throws. `WhosRespondedCard` only renders `NudgeControl` when `emailConfigured` (server-only `EMAIL_PROVIDER` check, page.tsx:118-122) is true and the poll is open — matching the existing invite-form fallback pattern. `page.test.ts` (d) NO-LEAK test confirms no active nudge control when `EMAIL_PROVIDER` is unset. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema.ts` (invitations table) | Additive table + case-insensitive unique index | VERIFIED | Matches migration and live local DB schema exactly (`\d invitations` confirmed) |
| `drizzle/0005_easy_madripoor.sql` | Additive-only migration | VERIFIED | `CREATE TABLE` + FK + `CREATE UNIQUE INDEX` only; no `ALTER` on existing tables |
| `src/lib/actions/send-invites.ts` (invitation recording) | Best-effort record-on-success | VERIFIED | try/catch around insert, only in `ok` branch, logs failures, never mutates `SendInviteResult` |
| `src/lib/db/queries.ts` (`getInvitationTrackingForPoll`) | Admin-only responded/not-responded read | VERIFIED | Correlated EXISTS, case-insensitive, poll-scoped; zero participant-route callers (grep-confirmed) |
| `src/lib/email/templates.ts` (`renderReminderEmail`) | Participant-link-only reminder template | VERIFIED | No admin URL; HTML-escapes the poll title (hardened in `bb806f9` after initial land) |
| `src/lib/actions/nudge-non-respondents.ts` | Nudge server action with 3 security guards | VERIFIED | Admin-token re-derivation, closed-poll re-check, server-side recipient recompute — all enforced and tested |
| `src/components/whos-responded-card.tsx` | Admin-only tracking card, 3 states | VERIFIED | Empty / populated-open / populated-closed states rendered correctly; mandatory caption always paired with stat |
| `src/components/nudge-control.tsx` | One-click nudge client island | VERIFIED | `adminUrlId`-only form, disabled-at-zero state, aria-live result chips |
| `src/app/a/[adminUrlId]/page.tsx` | Wiring | VERIFIED | Fetches tracking data, renders card between Results and Book it, reuses existing `isClosed`/`emailConfigured` gates |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `send-invites.ts` | `invitations` table | `db.insert(invitations)...onConflictDoNothing()` | WIRED | Only on successful send; DB-backed tests confirm row counts |
| `page.tsx` | `getInvitationTrackingForPoll` | direct call, admin-only | WIRED | `invitations` prop flows only to `WhosRespondedCard`, never to `ResultsGrid` |
| `whos-responded-card.tsx` | `nudge-control.tsx` | component composition | WIRED | Rendered only when `!isClosed && emailConfigured` |
| `nudge-control.tsx` | `nudgeNonRespondents` | `useActionState` form action | WIRED | Form submits only `adminUrlId`; server action re-queries recipients |
| `nudgeNonRespondents` | `sendEmail` seam | `sendEmail({ to, subject, html })` | WIRED | Same seam as `sendInvites`; degrades gracefully when `PROVIDER === "none"` |
| participant routes (`/p/...`) | `invitations` / `getInvitationTrackingForPoll` | (absence checked) | NOT PRESENT (correct) | Grep confirms zero references in any participant-facing route module; non-vacuous canary test proves a seeded invitation email is admin-visible yet absent from participant HTML |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green | `DATABASE_URL='postgresql://postgres:password@localhost:5432/lfg' npm test` | 28 files, 299 tests passed, 0 failed | PASS |
| TypeScript clean | `npx tsc --noEmit` | No errors found | PASS |
| ESLint clean on touched files | `npx eslint <phase-7 files>` | No issues found | PASS |
| Local migration applied | `psql -U postgres -d lfg -c "\d invitations"` | Table + FK + unique index present, matches schema.ts | PASS |
| No debt markers in phase-7 files | grep TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER across all created/modified phase-7 files | None found (one pre-existing `TBD` on an unrelated header comment predates this phase, introduced in commit `e5cf81d`) | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RESP-03 | 07-01 | Invitations persisted on send | SATISFIED | `invitations` table + `sendInvites` recording, DB-backed tests |
| RESP-01 | 07-02, 07-03 | Admin sees who hasn't responded | SATISFIED | `getInvitationTrackingForPoll` + `WhosRespondedCard`, no-leak proven |
| RESP-02 | 07-02, 07-03 | One-click nudge non-respondents | SATISFIED | `nudgeNonRespondents` + `NudgeControl`, all 3 security guards tested |

No orphaned requirements — all three RESP-* IDs from REQUIREMENTS.md are claimed and satisfied by plans 07-01/02/03.

### Anti-Patterns Found

None blocking. One pre-existing `TBD` comment (`src/app/a/[adminUrlId]/page.tsx:149`, "location/description (TBD)") predates this phase (introduced in commit `e5cf81d`, an earlier admin-layout phase) and is unrelated to respondent tracking — not a phase-7 debt marker.

### Human Verification Required

### 1. Prod ship (07-04 Task 1)

**Test:** Back up prod Neon (pg18 client, stored outside the repo), apply the additive `0005_easy_madripoor.sql` migration to prod, deploy via `npx vercel@latest deploy --prod --yes`, and confirm the deployed admin page renders the "Who's responded" card.
**Expected:** Non-empty timestamped backup exists before migration; prod `information_schema` lists `invitations`; production deployment succeeds; admin page returns 200 with the card visible.
**Why human:** Requires live prod credentials and infrastructure actions (backup/migrate/deploy against real Neon + Vercel) that cannot be verified by static codebase inspection. Not yet executed — no `07-04-SUMMARY.md` exists in the phase directory.

### 2. Real nudge email delivers to an inbox (07-04 Task 2)

**Test:** On the deployed prod app, invite an address you control, confirm it shows "Not yet responded", click "Nudge non-respondents", and check that the reminder email actually arrives (inbox, not spam) with a working participant link; vote and confirm the badge flips to "Responded".
**Expected:** Reminder email ("Reminder: your response is needed") delivers to inbox with a working participant link; status updates correctly after voting.
**Why human:** Real email deliverability requires an actual inbox check that no agent can perform. This is explicitly a `checkpoint:human-verify` blocking task in `07-04-PLAN.md` — not yet executed.

### Gaps Summary

No code gaps found. All three requirements (RESP-01, RESP-02, RESP-03) and all four ROADMAP success criteria for Phase 7 are verifiably implemented, wired, and covered by substantive DB-backed tests (299/299 passing), with TypeScript and ESLint both clean. The only outstanding items are the two tasks of plan 07-04 — a deliberately separate, not-yet-executed prod-ship + human-inbox-verification step that the plan itself scopes outside the autonomous code work of 07-01/02/03. These are genuine human-verification items, not gaps in the delivered code.

---

*Verified: 2026-07-07T22:10:00Z*
*Verifier: Claude (gsd-verifier)*

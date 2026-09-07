# Looking For Group (LFG)

## Current State

**Shipped v1.2 Reliable Delivery — re-scoped to DLVR-04 (closed 2026-09-07)** — 332 tests green. Mid-milestone Dave deferred the email portion, so v1.2 was re-scoped from "make email deliver" to **DLVR-04 (failure visibility) only**. DLVR-04 is **CODE-COMPLETE on master** (`d708065`): per-recipient email delivery visibility — a failed/rate-limited send now persists a durable, admin-only "failed / needs-retry" record on the "Who's responded" card (previously a silent drop). **Whether it is LIVE IN PRODUCTION is UNCONFIRMED:** migration 0008 (`invitations.delivery_status`) was recorded as prod-applied only from a 2026-09-07 session-pane message attributed to Dave (*"Applied 0008 to prod"*); Dave (2026-09-07) does not recall applying it and deferred checking; never agent-verified (no prod access). **Resolution trigger:** check whether column `delivery_status` exists on the `invitations` table in prod Neon. The Phase 9 `sendEmail()` primary→fallback seam (`1ad8ac3`) is shipped but **INERT** — no provider configured, degrades to copy-link (D-02). **Email delivery itself remains OFF by choice; DLVR-03 deliverability is deferred (see Backlog).** v1.2 delivered its re-scoped goal, not its original "Reliable Delivery" goal.

**Shipped v1.1 Organizer Controls (2026-07-07, closed 2026-09-07)** — builds on v1.0, live on Vercel free tier + Neon; all 5 v1.1 requirements (321 tests green), migrations 0005/0006/0007. Respondent tracking + nudge, lazy-close voting deadline, organizer's own availability row.

**Shipped v1.0 MVP (2026-07-07)** — live on Vercel free tier + Neon, with all 30 v1 requirements complete and verified. The full happy path works end-to-end in production: create poll → (optionally email) invite → account-free three-state vote → admin results grid + best-day → "Book it" → confirmation emails.

## What This Is

A free, self-hostable clone of Doodle.com's "Group Poll" feature, focused on the single use case of helping a group agree on which day(s) to meet. The creator proposes a set of candidate dates, sends participants a link (by email), and each participant marks every date as **Available**, **Tentative (if-need-be)**, or **Not available**. A live results dashboard shows everyone's choices in a grid and surfaces the best day(s), and the organizer finalizes with "Book it". Built for a Dungeons & Dragons group to schedule game sessions without paying Doodle's subscription.

## Core Value

A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — with no login required for participants and no cost to run.

## Current Milestone: none active

**v1.2 Reliable Delivery (re-scoped to DLVR-04) closed 2026-09-07.** No milestone is in progress. See the Backlog below for the deferred email deliverability work, and `milestones/` for archived roadmaps/requirements.

## Backlog (deferred, carried across milestone close)

<!-- Deferred work that must survive milestone archiving so a future session finds it. -->

- **DLVR-03 — Email deliverability (SPF/DKIM/DMARC alignment + human-verified real-inbox send).** DEFERRED / moved out of scope by Dave (2026-09-07); he does not want to set up email delivery. The full plan is retained at `milestones/v1.2-phases/10-deliverability-visibility/10-02-PLAN.md` (`status: DEFERRED`), with a free-tier alignment approach and a non-secret DNS-alignment checker in its tasks. **Gate:** its D-19 dependency (Phase 9 Task 3 — prod EMAIL_PROVIDER credentials + redeploy) is **WITHDRAWN PERMANENTLY**; reviving DLVR-03 means first re-taking-up email setup. The `sendEmail()` primary→fallback seam it would build on is already shipped and inert (`1ad8ac3`). Also tracked in `.planning/todos/pending/` and STATE.md Deferred Items.
- Longer-term (from v1.2-REQUIREMENTS Future Requirements): MOBL-01 mobile results grid, SLOT-01 per-day time slots, CMNT-01 comments.

## Requirements

### Validated

<!-- Shipped and verified against the codebase / production. -->

- [x] Creator can create a poll with a title, optional description/location, and a set of candidate dates (or date+time slots) — *Validated in Phase 1*
- [x] Creator gets a shareable participant link and a separate admin/management link for the poll — *Validated in Phase 1*
- [x] Runs completely free, self-hostable locally and deployable to Vercel free tier — *Validated in Phase 1 (live on Vercel free tier + local Docker Postgres)*
- [x] Participants can respond via the link without creating an account (name + per-date selection) — *Validated in Phase 2 (VOTE-01/02/03/07)*
- [x] Each date supports three states per participant: Available (yes), Tentative (if-need-be), Not available (no) — *Validated in Phase 2*
- [x] Participants can return and edit their own response — *Validated in Phase 2 (VOTE-05/06; token-verified ownership + same-device auto-load)*
- [x] Results dashboard shows a grid of participants × dates with their selections — *Validated in Phase 3 (DASH-01/02/03; admin-only, participant-safe read)*
- [x] Dashboard highlights the best day(s) and supports sorting/filtering by who is available / tentative / not available — *Validated in Phase 3 (DASH-04/05)*
- [x] System can email participants an invitation containing the poll link — *Validated in Phase 4 (MAIL-01..03; env-switched sendEmail seam, copy-link fallback, live Gmail SMTP in prod)*
- [x] Organizer can finalize on the winning date ("Book it") and every voter gets a confirmation email — *Validated in Phase 4 (FNL-01..03; two-step confirm closes the poll)*
- [x] Accessible, responsive UI across all screens (WCAG radiogroup vote matrix, mobile sticky footers) — *Validated in Phase 5 (D-01..D-10; behavior-preserving redesign)*
- [x] Organizer "Your polls" dashboard + subscribable calendar feed of booked dates — *Validated in Phase 6 (account-free `lfg_organizer` cookie identity)*
- [x] Organizer can see which invited people have not yet responded — *Validated in Phase 7 (RESP-01/03; persisted invitations + responded/not-responded status)*
- [x] Organizer can send a one-click "nudge" reminder to non-respondents — *Validated in Phase 7 (RESP-02; action + copy-link fallback shipped; live email delivery an accepted limitation)*
- [x] Organizer can set a deadline after which voting auto-closes — *Validated in Phase 8 (DEAD-01; lazy close on poll access, no cron)*
- [x] Organizer can add their own availability row from the admin view — *Validated in Phase 8 (ORG-01; single-row upsert, "(you)" row in results/best-day)*
- [~] Send failures surfaced to the organizer, never silent — *DLVR-04 (Phase 10): CODE-COMPLETE on master (admin-only per-recipient delivery chip); live-in-prod UNCONFIRMED — migration 0008 prod application unverified (recorded from a 2026-09-07 session-pane message attributed to Dave; Dave does not recall, deferred; never agent-verified). Resolve by checking prod Neon for column `invitations.delivery_status`.*

### Active

<!-- No milestone in progress. v1.2 (re-scoped to DLVR-04) closed 2026-09-07. Deferred email deliverability (DLVR-03) + longer-term ideas are in the Backlog above. -->

- _(none — awaiting next milestone definition)_

**Shipped but inert (not a working feature):** the `sendEmail()` primary→fallback seam — *DLVR-01/02 (`1ad8ac3`); no provider configured, degrades to copy-link (D-02). Email delivery is OFF by choice; DLVR-03 deferred (Backlog).*

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Participant accounts / authentication — Doodle group polls work via anonymous links; accounts add friction for a small private group
- Paid plans, billing, teams/org management — the entire motivation is to avoid a subscription
- Calendar two-way sync (Google/Outlook auto-booking) — heavy integration cost; manual scheduling is sufficient for a D&D group
- Native mobile apps — a responsive web app covers all target users
- Recurring/automated polling, reminders bots — nice-to-have, not needed for v1

## Context

- **Origin:** Doodle moved its group-poll feature behind a paid subscription; the user only needs that one feature, used to schedule D&D sessions with friends.
- **Doodle group-poll model (reference behavior to replicate):** organizer creates a poll with options (dates or date/time slots) → shares a link / emails invitees → each invitee enters their name and marks each option Yes / If-need-be / No → organizer sees a results table and picks a final date. Doodle shows a count column and lets you see, per option, who said yes/maybe/no.
- **Users:** a handful of non-technical friends (poll participants) plus the user as organizer/host. Low traffic, small data volumes.
- **Deployment intent:** must run on the user's own PC and also deploy to Vercel's free tier; everything in the stack must have a free option (DB, email).
- **Shipped state (v1.0):** ~13.5K LOC TypeScript/TSX (app + tests), 270 tests green. Stack as built: Next.js 16 (App Router + Server Actions), React 19, Drizzle ORM (dual-driver: node-postgres local / neon-http prod), Postgres (Docker local + Neon prod), Tailwind v4, nanoid tokens, Zod validation, Nodemailer/Gmail-SMTP email. Live on Vercel free tier (`looking-for-group-eight.vercel.app`). Prod DB backups kept outside the repo at `/home/dave/lfg-db-backups/`.
- **Open human checks carried past v1.0:** a real prod invite landing in the owner's inbox (not spam); a full prod happy-path smoke run. Phase 5 formal visual/AT UAT was superseded by prod screenshot verification (see STATE.md Deferred Items).

## Constraints

- **Budget**: Must be $0 to build and run — only free tiers / free/open-source tooling. — The whole point is replacing a paid subscription.
- **Hosting**: Must be self-hostable locally on a Windows/WSL PC AND deployable to Vercel free tier. — User's stated deployment options.
- **Email**: Sending invitation emails must work on a free tier (e.g. Resend free tier, or SMTP) without a paid plan. — Email is a required feature but cannot incur cost.
- **Auth**: Participants must not need accounts; access is via unguessable poll links. — Mirrors Doodle group polls; minimizes friction.
- **Simplicity**: Single focused feature; avoid scope creep into a full scheduling suite. — Maintainability for a solo hobby project.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Clone only Doodle's "Group Poll" feature, nothing else | User explicitly needs just this one feature | ✓ Good — shipped focused; no scope creep |
| No participant accounts; link-based access | Matches Doodle group-poll UX, lowest friction | ✓ Good — anonymous voting works end-to-end |
| Target Vercel free tier + local self-host as deploy targets | User's stated hosting options; free constraint | ✓ Good — live on Vercel free tier + local Docker Postgres |
| Create a private GitHub repo under `davesienkowski` and sync | User requested git tracking + GitHub sync | ✓ Good |
| Tech stack: Next.js 16 + Drizzle + Postgres + Tailwind v4 (research-confirmed) | Stack must satisfy $0 + Vercel + local constraints | ✓ Good — all free-tier, ~13.5K LOC shipped |
| Three independent unguessable nanoid tokens (admin/participant/edit), none derivable | Least-privilege link sharing; IDOR defense | ✓ Good — LINK-03 verified; no token leak |
| Date-only slots as Postgres DATE, never parsed via `new Date()` | Avoid timezone drift (PLAT-04) | ✓ Good — no off-by-one across month boundaries |
| Single env-switched `sendEmail()` seam; email fully optional | $0 default + graceful degradation (MAIL-03) | ✓ Good — zero-config builds green; Gmail SMTP live in prod |
| Gmail SMTP with `EMAIL_FROM = SMTP_USER` (self-aligned SPF/DKIM/DMARC) | Free-tier deliverability without a domain | ⚠️ Revisit — live inbox/spam landing not yet human-verified |
| WCAG role=radiogroup/radio vote matrix, both responsive layers in DOM | Accessible three-state input | ⚠️ Revisit — code-verified; formal screen-reader pass deferred |
| Account-free organizer identity via `lfg_organizer` cookie + nullable `organizer_id` | Same-browser poll grouping without auth | ✓ Good — powers /polls + calendar feed |
| [v1.1] Persist invitations in an additive `invitations` table; record on successful send | Respondent tracking needs a source of truth (v1.0 sent invites transiently) | ✓ Good — RESP-01/03 shipped |
| [v1.1] Lazy deadline close (evaluated on poll access), not cron | Vercel Hobby cron too limited; reuse FNL-02 closed guard | ✓ Good — DEAD-01, no scheduler, never blocks page load |
| [v1.1] DB-enforce one-organizer-row-per-poll via partial unique index + graceful race fallthrough | Prevent duplicate organizer availability rows under concurrency | ✓ Good — ORG-01 (code-review hardening) |
| [v1.1] Outbound email delivery accepted as a known limitation at milestone close | Respond/choose flow works without it; nudge/invite degrade to copy-link | ⚠️ Revisit — re-enable email as a likely next item |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-09-07 — closed milestone v1.2 Reliable Delivery (re-scoped to DLVR-04)*

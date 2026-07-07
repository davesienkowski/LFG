# Looking For Group (LFG)

## Current State

**Shipped v1.0 MVP (2026-07-07)** — live on Vercel free tier + Neon, with all 30 v1 requirements complete and verified. The full happy path works end-to-end in production: create poll → (optionally email) invite → account-free three-state vote → admin results grid + best-day → "Book it" → confirmation emails. Free-tier email is enabled via Gmail SMTP.

## What This Is

A free, self-hostable clone of Doodle.com's "Group Poll" feature, focused on the single use case of helping a group agree on which day(s) to meet. The creator proposes a set of candidate dates, sends participants a link (by email), and each participant marks every date as **Available**, **Tentative (if-need-be)**, or **Not available**. A live results dashboard shows everyone's choices in a grid and surfaces the best day(s), and the organizer finalizes with "Book it". Built for a Dungeons & Dragons group to schedule game sessions without paying Doodle's subscription.

## Core Value

A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — with no login required for participants and no cost to run.

## Current Milestone: v1.1 Organizer Controls

**Goal:** Give the organizer the tools to drive a poll to a confident decision — track who hasn't responded, nudge them, auto-close on a deadline, and vote in their own availability.

**Target features:**
- See which invited people have not yet responded (requires persisting invitations)
- One-click "nudge" email to non-respondents
- Optional voting deadline that auto-closes the poll (serverless-safe lazy close, no cron)
- Organizer can add their own availability row from the admin view

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

### Active

<!-- Current scope (milestone v1.1 Organizer Controls). Remaining v2 candidates (comments CMNT-01, mobile grid MOBL-01, per-day multi-slot SLOT-01) stay deferred — see milestones/v1.0-REQUIREMENTS.md. -->

- [ ] Organizer can see which invited people have not yet responded — *RESP-01 (v1.1)*
- [ ] Organizer can send a one-click "nudge" email to non-respondents — *RESP-02 (v1.1)*
- [ ] Organizer can set a deadline after which voting auto-closes — *DEAD-01 (v1.1)*
- [ ] Organizer can add their own availability row from the admin view — *ORG-01 (v1.1)*

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
*Last updated: 2026-07-07 — started milestone v1.1 Organizer Controls*

# Looking For Group (LFG)

## What This Is

A free, self-hostable clone of Doodle.com's "Group Poll" feature, focused on the single use case of helping a group agree on which day(s) to meet. The creator proposes a set of candidate dates, sends participants a link (by email), and each participant marks every date as **Available**, **Tentative (if-need-be)**, or **Not available**. A live results dashboard shows everyone's choices in a grid and surfaces the best day(s). Built for a Dungeons & Dragons group to schedule game sessions without paying Doodle's subscription.

## Core Value

A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — with no login required for participants and no cost to run.

## Requirements

### Validated

<!-- Shipped and verified against the codebase / production. -->

- [x] Creator can create a poll with a title, optional description/location, and a set of candidate dates (or date+time slots) — *Validated in Phase 1*
- [x] Creator gets a shareable participant link and a separate admin/management link for the poll — *Validated in Phase 1*
- [x] Runs completely free, self-hostable locally and deployable to Vercel free tier — *Validated in Phase 1 (live on Vercel free tier + local Docker Postgres)*
- [x] Participants can respond via the link without creating an account (name + per-date selection) — *Validated in Phase 2 (VOTE-01/02/03/07)*
- [x] Each date supports three states per participant: Available (yes), Tentative (if-need-be), Not available (no) — *Validated in Phase 2*
- [x] Participants can return and edit their own response — *Validated in Phase 2 (VOTE-05/06; token-verified ownership + same-device auto-load)*

### Active

<!-- Current scope. Building toward these. -->

- [ ] Results dashboard shows a grid of participants × dates with their selections — *Phase 3 (results-dashboard)*
- [ ] Dashboard highlights the best day(s) and supports sorting/filtering by who is available / tentative / not available — *Phase 3*
- [ ] System can email participants an invitation containing the poll link — *Phase 4*

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

## Constraints

- **Budget**: Must be $0 to build and run — only free tiers / free/open-source tooling. — The whole point is replacing a paid subscription.
- **Hosting**: Must be self-hostable locally on a Windows/WSL PC AND deployable to Vercel free tier. — User's stated deployment options.
- **Email**: Sending invitation emails must work on a free tier (e.g. Resend free tier, or SMTP) without a paid plan. — Email is a required feature but cannot incur cost.
- **Auth**: Participants must not need accounts; access is via unguessable poll links. — Mirrors Doodle group polls; minimizes friction.
- **Simplicity**: Single focused feature; avoid scope creep into a full scheduling suite. — Maintainability for a solo hobby project.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Clone only Doodle's "Group Poll" feature, nothing else | User explicitly needs just this one feature | — Pending |
| No participant accounts; link-based access | Matches Doodle group-poll UX, lowest friction | — Pending |
| Target Vercel free tier + local self-host as deploy targets | User's stated hosting options; free constraint | — Pending |
| Create a private GitHub repo under `davesienkowski` and sync | User requested git tracking + GitHub sync | — Pending |
| Tech stack to be confirmed by research (free-tier-friendly) | Stack must satisfy $0 + Vercel + local constraints | — Pending |

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
*Last updated: 2026-07-01 after Phase 2 (participant voting) completion*

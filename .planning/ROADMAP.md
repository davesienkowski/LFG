# Roadmap: Looking For Group (LFG)

## Overview

LFG ships as four end-to-end vertical slices, each independently deployable to both local Postgres and Vercel/Neon. Phase 1 locks in the irreversible foundations — the three-token access model, crypto-random non-enumerable IDs, Postgres-everywhere, and timezone-safe DATE storage — while delivering poll creation and the admin share-link page. Phase 2 adds the core differentiator: anonymous three-state availability voting with token-verified self-editing. Phase 3 turns stored votes into the organizer's results grid with best-day highlighting and sort/filter. Phase 4 layers on free-tier email (invitations, edit-link confirmations, finalization notices) plus the "Book it" close-poll flow. Per coarse granularity, polish/UX refinements (multi-select date picker, responsive grid pass) ride inside their owning phases rather than a separate phase.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Poll Creation** - Lock in tokens/DB/timezone foundations; organizer creates a poll and gets distinct share links (completed 2026-06-30)
- [ ] **Phase 2: Participant Voting** - Anonymous three-state availability voting with token-verified self-editing
- [ ] **Phase 3: Results Dashboard** - Participant × date grid, vote tallies, best-day highlight, sort/filter
- [ ] **Phase 4: Email & Finalization** - Free-tier email invites, edit-link confirmations, and "Book it" finalize with notices

## Phase Details

### Phase 1: Foundation & Poll Creation

**Goal**: An organizer can create a scheduling poll (title, optional description/location, one or more candidate dates with optional start time) and land on an admin page exposing two distinct, unguessable share links — running on Postgres locally and deployed to Vercel/Neon on free tiers.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: POLL-01, POLL-02, POLL-03, POLL-04, LINK-01, LINK-02, LINK-03, PLAT-01, PLAT-02, PLAT-03, PLAT-04
**Success Criteria** (what must be TRUE):

  1. Organizer can create a poll with a required title, optional description and location, and one or more candidate dates (each with an optional start time; date-only is valid).
  2. On creation, the organizer lands on an admin page showing two separate links — a participant (voting) link and an admin (management) link — where the admin link cannot be derived from the participant link.
  3. Poll and admin identifiers are long crypto-random strings; altering or incrementing a link returns 404 rather than another poll (non-enumerable).
  4. The app runs locally against a local Postgres database and deploys to Vercel against Neon Postgres, both entirely within free tiers.
  5. Candidate dates render on the same calendar day in every timezone (no off-by-one drift; date-only stored as DATE, never parsed via the `new Date()` constructor).

**Plans**: 3/3 plans complete
**UI hint**: yes

Plans:

- [x] 01-01-PLAN.md — Scaffold Next.js 16 + Drizzle + nanoid/date helpers; Dockerized dev environment (db + web in Docker Desktop, D-12); Poll + Option schema migrated into live Docker Postgres; Walking Skeleton DB round-trip proven locally
- [x] 01-02-PLAN.md — `createPoll` server action + `/` creation form (title/description/location/dates) + `/a/[adminUrlId]` admin page (both share links, Keep-private admin badge) + `/p/[participantUrlId]` participant shell + 404
- [x] 01-03-PLAN.md — Vercel/Neon deploy (FINAL, sequenced after the local Docker skeleton works per D-13): migrate schema to Neon, configure env, deploy, verify cold-start poll creation on free tiers

### Phase 2: Participant Voting

**Goal**: A participant can open the shared link and record three-state availability for every candidate date without creating an account, then return to edit only their own response.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: VOTE-01, VOTE-02, VOTE-03, VOTE-05, VOTE-06, VOTE-07
**Success Criteria** (what must be TRUE):

  1. A participant can open the participant link and submit a response (name, optional email, availability) without creating an account.
  2. For each candidate date, a participant can set exactly one of three states — Available (yes), If-need-be (tentative), Not available (no).
  3. After submitting, the participant sees a confirmation showing a personal edit link to bookmark, and returning from the same device auto-loads their previous response.
  4. A participant can return via their edit link and change their selections while the poll is open.
  5. Editing requires the participant's own per-participant token; another participant's token (or no token, or a name-only attempt) cannot modify the response.
  6. Per-row bulk actions (Set all Available / Set all Not available / Clear) set the whole row at once before per-date adjustment (VOTE-07, added by the 01-04 revision).

**Plans**: 2 plans
**UI hint**: yes

Plans:
**Wave 1**

- [ ] 02-01-PLAN.md — participants + votes schema (local migration gate), AvailabilityGrid 3-state grid + VOTE-07 bulk actions, INSERT-only submitResponse, live vote view + /thanks edit link (VOTE-01/02/03/07)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 02-02-PLAN.md — token-verified updateResponse upsert + edit route + same-device auto-load, then the blocking Neon migration + production redeploy (VOTE-05/06)

### Phase 3: Results Dashboard

**Goal**: The organizer can read everyone's availability in a participant × date grid, see per-date vote tallies, and instantly identify the best day(s).
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: DASH-01, DASH-02, DASH-03, DASH-04, DASH-05
**Success Criteria** (what must be TRUE):

  1. The admin page shows a results grid with participants as rows and candidate dates as columns.
  2. Each grid cell visually distinguishes the participant's three states (available / if-need-be / not available) for that date.
  3. Each date column displays a summary count of "yes" votes and "if-need-be" votes.
  4. The best date(s) are highlighted by highest yes count, breaking ties by if-need-be count and then chronological order.
  5. The organizer can sort/filter the view by availability status (available / tentative / not available) for a given date.

**Plans**: 2 plans
**UI hint**: yes

Plans:

- [ ] 03-01: `getResultsAggregation` SQL GROUP BY + `ResultsGrid` + `BestDayBadge`; three-state cells, summary counts, and best-day highlight on the admin page (index `votes.poll_id`)
- [ ] 03-02: Sort/filter the results view by availability status for a given date

### Phase 4: Email & Finalization

**Goal**: The organizer can email invitations from the app, every participant receives a confirmation email containing their edit link, and the organizer can finalize a winning date that closes voting and notifies all voters — all on free-tier email with a graceful no-email fallback.
**Mode:** mvp
**Depends on**: Phase 1 (poll + participant link), Phase 2 (participant/vote records, edit tokens)
**Requirements**: VOTE-04, MAIL-01, MAIL-02, MAIL-03, FNL-01, FNL-02, FNL-03
**Success Criteria** (what must be TRUE):

  1. The organizer can enter one or more email addresses and send each participant an invitation email containing the participant link (individual sends, not CC).
  2. Email delivery works on a free-tier provider (Resend) or SMTP, selected by environment variable; if email is not configured, the app surfaces the participant link to copy/share manually.
  3. On submitting a response, a participant receives a confirmation email containing the unique link to review/edit their response.
  4. The organizer can finalize the poll by selecting the winning date ("Book it"), which closes voting so the response form becomes read-only.
  5. On finalization, every participant who voted receives a confirmation email with the chosen date and event details.

**Plans**: 2 plans
**Research**: Required — Resend custom-domain DNS/deliverability (DKIM/SPF/DMARC, up to ~48h propagation; verify before sending real invites) and the local SMTP/MailHog dev path; handle the 100/day cap (429) visibly.
**UI hint**: yes

Plans:

- [ ] 04-01: Env-switched email service (Resend / Nodemailer+MailHog) + invite template; `sendInvites` action + admin email UI + copy-link fallback; participant confirmation email carrying the edit link (VOTE-04)
- [ ] 04-02: `closePoll` / "Book it" finalize action (select winning date, set status=closed, read-only participant form) + finalization confirmation emails to all voters

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Poll Creation | 3/3 | Complete   | 2026-06-30 |
| 2. Participant Voting | 0/2 | Not started | - |
| 3. Results Dashboard | 0/2 | Not started | - |
| 4. Email & Finalization | 0/2 | Not started | - |

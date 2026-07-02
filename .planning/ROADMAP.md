# Roadmap: Looking For Group (LFG)

## Overview

LFG ships as four end-to-end vertical slices, each independently deployable to both local Postgres and Vercel/Neon. Phase 1 locks in the irreversible foundations — the three-token access model, crypto-random non-enumerable IDs, Postgres-everywhere, and timezone-safe DATE storage — while delivering poll creation and the admin share-link page. Phase 2 adds the core differentiator: anonymous three-state availability voting with token-verified self-editing. Phase 3 turns stored votes into the organizer's results grid with best-day highlighting and sort/filter. Phase 4 layers on free-tier email (invitations, edit-link confirmations, finalization notices) plus the "Book it" close-poll flow. Per coarse granularity, polish/UX refinements (multi-select date picker, responsive grid pass) ride inside their owning phases rather than a separate phase.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Poll Creation** - Lock in tokens/DB/timezone foundations; organizer creates a poll and gets distinct share links (completed 2026-06-30)
- [x] **Phase 2: Participant Voting** - Anonymous three-state availability voting with token-verified self-editing (completed 2026-07-01)
- [x] **Phase 3: Results Dashboard** - Participant × date grid, vote tallies, best-day highlight, sort/filter (completed 2026-07-01)
- [x] **Phase 4: Email & Finalization** - Free-tier email invites, edit-link confirmations, and "Book it" finalize with notices (completed 2026-07-02)

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

**Plans**: 2/2 plans complete
**UI hint**: yes

Plans:
**Wave 1**

- [x] 02-01-PLAN.md — participants + votes schema (local migration gate), AvailabilityGrid 3-state grid + VOTE-07 bulk actions, INSERT-only submitResponse, live vote view + /thanks edit link (VOTE-01/02/03/07)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — token-verified updateResponse upsert + edit route + same-device auto-load, then the blocking Neon migration + production redeploy (VOTE-05/06)

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

**Plans**: 2/2 plans complete
**UI hint**: yes

Plans:
**Wave 1**

- [x] 03-01-PLAN.md — Data & aggregation foundation: extract shared vote-state vocabulary (`STATE_META` + `normalizeVoteState`), pure `computeResults` tally + best-day ranking (D-02, lexicographic yes↓/if-need-be↓/date↑), and admin-only participant-safe `getResultsForPoll` LEFT JOIN with a non-vacuous no-leak DB test (DASH-01..04)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 03-02-PLAN.md — `ResultsGrid` `"use client"` island: semantic table, three-state cells, per-date tallies, best-day highlight/badge, scroll-edge fade, and a concurrency-safe client-only date/status filter, mounted on `/a/[adminUrlId]` (DASH-01..05)

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

**Plans**: 3/3 plans complete
**Research**: Required — Resend custom-domain DNS/deliverability (DKIM/SPF/DMARC, up to ~48h propagation; verify before sending real invites) and the local SMTP/Mailpit dev path; handle the 100/day cap (429) visibly. (Resolved to SEED-001: Gmail SMTP + App Password for $0 no-domain prod sending, Mailpit for local capture.)
**UI hint**: yes

Plans:
**Wave 1**

- [x] 04-01-PLAN.md — Env-switched `sendEmail()` seam (Nodemailer SMTP: Mailpit local / Gmail-SMTP prod) + three plain-HTML templates + `sendInvites` action & Invite-by-email card (individual sends, dedupe, copy-link fallback) + best-effort VOTE-04 confirmation via `after()` (MAIL-01/02/03, VOTE-04)

**Wave 2** *(blocked on Wave 1 email seam)*

- [x] 04-02-PLAN.md — `[BLOCKING]` additive `winning_option_id` local schema gate + `closePoll` "Book it" finalize action (single UPDATE, admin-gated, in-poll option guard) + finalization emails to voters (deduped, best-effort via `after()`) + Book-it picker/confirm UI, finalized card & Booked badge (FNL-01/02/03)

**Wave 3** *(blocked on Wave 2; production ship)*

- [x] 04-03-PLAN.md — Prod Neon migrate + Vercel deploy + prod happy-path smoke (graceful email fallback), then a human-action checkpoint to enable real Gmail SMTP sending and verify a live invite delivery (MAIL-02 in production)
  - Task 1 ✅ done (efab035): prod Neon migrated (`winning_option_id`), Vercel prod deploy live, `.env.example` documents email vars. Task 2 ✅ done: owner enabled 2FA + Gmail App Password + the 7 Gmail SMTP vars in Vercel Production; prod redeployed, build now selects the Gmail transport (MAIL-02 configured in prod). End-of-phase human checks: a real prod invite arriving in the owner's inbox (not spam, working link) + the full interactive prod happy-path smoke; SMTP2GO single-sender is the recorded fallback (T-04-13).

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Poll Creation | 3/3 | Complete   | 2026-06-30 |
| 2. Participant Voting | 2/2 | Complete    | 2026-07-01 |
| 3. Results Dashboard | 2/2 | Complete    | 2026-07-01 |
| 4. Email & Finalization | 3/3 | Complete   | 2026-07-02 |

### Phase 5: Vote-Grid Redesign (Matrix / 1c)

**Goal:** Redesign the participant vote experience to the "Matrix" direction (1c) from the Claude Design handoff: rewrite `src/components/availability-grid.tsx` from a click-to-cycle button-per-date into a radio-style matrix (rows = dates × three columns Available / If-need-be / Not available; icon-only desktop cells with icon+text persistent column headers; stacked full-width icon+text segments <640px; sticky mobile submit), and reconcile every supporting screen and the three emails to the high-fidelity mocks as pixel targets. Preserve all shipped invariants — default/untouched row reads "Not available" (never blank), bulk actions (VOTE-07), closed read-only chips, unchanged state labels (Doodle parity), icon-or-color-never-alone (WCAG AA), and the existing OKLCH tokens + vote-state palette verbatim. Includes rewriting `availability-grid.test.tsx` plus new a11y tests (desktop column-header association + mobile segmented fallback), and one optional `templates.ts` per-provider calendar-button color change.

**Design contract:** `design_handoff_vote_grid_redesign/` (README.md + DESIGN.md + designs/*.dc.html) — high-fidelity Claude Design handoff; the participant vote screen `/p/[participantUrlId]` is the hero (states 2a–2e).
**Requirements**: TBD — no new backend/requirements; visual/UX redesign of shipped VOTE features (no dark mode; out of scope).
**Depends on:** Phase 4
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 5 to break down)

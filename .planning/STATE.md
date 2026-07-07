---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Organizer Controls
status: planning
last_updated: "2026-07-07T21:15:00.000Z"
last_activity: 2026-07-07
progress:
  total_phases: 2
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-07 after v1.0 milestone)

**Core value:** A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — no participant login, no cost.
**Current focus:** v1.1 Organizer Controls — roadmap created (Phases 7-8). Phase 7 (Respondent Tracking & Nudges) is ready to plan.

## Current Position

Phase: 7 of 8 (Respondent Tracking & Nudges)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-07-07 — v1.1 roadmap created; 5/5 requirements mapped (RESP-01/02/03 → Phase 7, DEAD-01/ORG-01 → Phase 8)

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: -
- Total execution time: -

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 02 | 2 | - | - |
| 3 | 2 | - | - |

**Recent Trend:**

- Last 5 plans: -
- Trend: -

*Updated after each plan completion*
| Phase 1 P01 | 13min | 3 tasks | 46 files |
| Phase 01 P02 | 14min | 3 tasks | 18 files |
| Phase 02 P01 | 35min | 3 tasks | 11 files |
| Phase 02 P02 | 35min | 3 tasks | 9 files |
| Phase 04 P01 | 13min | 3 tasks | 14 files |
| Phase 04 P02 | 9min | 3 tasks | 12 files |
| Phase 04 P03 | checkpoint-gated | 2 tasks | 2 files |
| Phase 05 P01 | 15m | 2 tasks | 2 files |
| Phase 05 P02 | 12min | 2 tasks | 1 files |
| Phase 05 P03 | 18min | 2 tasks | 1 files |
| Phase 05 P04 | 15min | 2 tasks | 3 files |
| Phase 05 P05 | 3min | 2 tasks | 2 files |
| Phase 06 P03 | ~20m | 2 tasks | 2 files |
| Phase 06 P04 | ~15m | 3 tasks | 4 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Three-token access model — separate `adminUrlId`, `participantUrlId`, and per-participant `editToken`, none derivable from another.
- [Phase 1]: Crypto-random non-enumerable IDs (nanoid) for all public identifiers; no auto-increment integers in URLs.
- [Phase 1]: Date-only slots stored as Postgres DATE and parsed without the `new Date()` constructor (no timezone drift).
- [Phase 4]: sendEmail() is the single env-switched outbound-email seam (none|smtp|resend) — email fully optional (D-02), degrades gracefully; RESP-02 nudge and DEAD-01 must reuse this seam (no new email path).
- [Phase 6]: Account-free organizer identity via httpOnly `lfg_organizer` cookie + nullable indexed `polls.organizer_id` (same-browser poll grouping without auth).

### v1.1 design constraints (carried into planning)

- All schema changes must be **additive + nullable** (backward-compatible, prod-safe migration) — matches the v1.0 pattern.
- **RESP-03** (persist invitation recipients) is the data-layer prerequisite for RESP-01/RESP-02 — sequenced first within Phase 7. Invitations are NOT persisted today (see `src/lib/db/schema.ts` — v1.0 sent invites transiently).
- **DEAD-01** auto-close must be **LAZY** (evaluated on poll access), NOT a cron/scheduled job — Vercel Hobby cron is out of scope. Reuse the existing FNL-02 read-only/closed guard for the expired state.
- **RESP-02** nudge routes through the existing env-switched `sendEmail()` seam — no new email path.

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

v1.0-era live-site UX polish items were all cleared via quick tasks (pdt, ppz, r8r, rqc, sn2, t7e, tv3, wfm, xbo — see Quick Tasks Completed). No open v1.1 todos captured yet.

Review with `/gsd-capture --list`.

### Blockers/Concerns

[Issues that affect future work]

- **[v1.1 prod migration]** Phase 7 (RESP-03) and Phase 8 (DEAD-01) both add columns. Follow the v1.0 prod pattern: back up prod Neon first (pg18 client — local pg_dump 17 mismatches; store outside repo at `/home/dave/lfg-db-backups/`), pull creds via `npx vercel env pull`, `npm run db:migrate`, then `npx vercel@latest deploy --prod --yes` (git push does NOT auto-deploy).
- **[carried from v1.0]** Open end-of-phase human email check: a real prod invite/nudge landing in the owner's inbox (not spam) with a working link — the executor has no inbox access to self-verify. Applies again to the RESP-02 nudge.
- **[process]** Author CONTEXT.md decision IDs as bare `D-NN` (not phase-prefixed) so the `decision-coverage-plan` gate parses (v1.0 false-negative, now resolved).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260701-il0 | Phase 2 code-review follow-ups #1 (activate env validation via instrumentation register hook) + #2 (pure setState updater in AvailabilityGrid) + remove stale checkpoint | 2026-07-01 | 1570165 | [260701-il0-apply-phase-2-code-review-follow-ups-1-w](./quick/260701-il0-apply-phase-2-code-review-follow-ups-1-w/) |
| 260702-k1u | Add "Add to Calendar" links (Google Calendar link + hosted/attached `.ics`) for the booked date to the finalization email — timezone-safe floating/all-day event, closed-poll-only route, best-effort | 2026-07-02 | 41467c0 | [260702-k1u-add-add-to-calendar-links-google-calenda](./quick/260702-k1u-add-add-to-calendar-links-google-calenda/) |
| 260703-pdt | Show current poll results on participant post-submit (thanks) page — read-only "Current results" section reusing ResultsGrid via participant-safe queries (no email/token/admin leak, no migration) | 2026-07-03 | 418dfa8 | [260703-pdt-show-current-poll-results-on-participant](./quick/260703-pdt-show-current-poll-results-on-participant/) |
| 260703-ppz | Compact horizontal wrapping candidate-date chips on admin echo + Book-it picker (layout only; radio/two-step-confirm semantics intact; 44px tap targets) | 2026-07-03 | 32669ce | [260703-ppz-compact-horizontal-candidate-date-lists-](./quick/260703-ppz-compact-horizontal-candidate-date-lists-/) |
| 260703-r8r | ResultsGrid rework (admin + participant): best-day column(s) moved leftmost via single displayOptions array, best-day summary line, readability polish, and decoupled always-active filter (Best day / specific / All-dates modes; status works standalone). Covers 2 todos: redesign-results-display + fix-admin-filters | 2026-07-03 | 11cd350 | [260703-r8r-results-grid-rework-best-day-column-firs](./quick/260703-r8r-results-grid-rework-best-day-column-firs/) |
| 260703-rqc | Optionally email the ADMIN link to the poll creator on creation — optional creatorEmail form field, best-effort after()+sendEmail send (mirrors Phase 04 pattern), new renderCreatorAdminLinkEmail template (sole legit /a/ admin-URL email, creator recipient). Email transient (never persisted, no migration); D-02 preserved | 2026-07-03 | 62a2c0f | [260703-rqc-email-admin-link-to-creator-on-poll-crea](./quick/260703-rqc-email-admin-link-to-creator-on-poll-crea/) |
| 260703-tv3 | Responsive redesign of admin + participant pages (presentation only, research-backed via 260703-tv3-RESEARCH.md). Added condensed timezone-safe date formatters (formatDateShort / …WithTimeShort / formatMonthYear, full dates kept in aria-labels); participant widened to max-w-4xl + 2-col desktop availability matrix; admin → max-w-6xl two-column dashboard (controls rail + Results/Book-it hero) with condensed month-grouped date chips + Results-in-Card; ResultsGrid sticky header (bounded scroll box); denser BookItControl date grid. Mobile stacked layouts + all radiogroup/two-step/filter/best-first semantics preserved. 229 tests green. | 2026-07-03 | 9998087 | [260703-tv3-redesign-admin-participant-page-layouts-](./quick/260703-tv3-redesign-admin-participant-page-layouts-/) |
| 260703-t7e | Email the poll creator on EACH participant response (submit + edit). Persists creator email: `polls.creator_email` (nullable — **migration 0004_late_the_santerians.sql**), stored in createPoll. Best-effort after() notify on submit-response AND update-response, naming the participant + linking the admin results view; admin_url_id + creator_email fetched ONLY via new server-side getPollAdminNotifyTargets(pollId), used ONLY inside after() closures (never on participant surface). New renderParticipantResponseNotification template. D-02 preserved; 220 tests green. **Prod migrate 0004 + deploy batched below.** | 2026-07-03 | 0c8bbab | [260703-t7e-email-poll-creator-on-each-participant-s](./quick/260703-t7e-email-poll-creator-on-each-participant-s/) |
| 260703-sn2 | Subscribable multi-poll organizer calendar feed. NEW account-free organizer identity: `polls.organizer_id` (nullable, indexed — **migration 0003_organic_metal_master.sql**), minted/reused via httpOnly `lfg_organizer` cookie in createPoll so same-browser polls group. New `GET /feed/[organizerId]/calendar.ics` emits a multi-event VCALENDAR of that organizer's closed polls (unknown/empty → valid empty calendar, no 404 oracle, no token/participant leak); refactored calendar/links.ts to add `buildVcalendar` (buildIcs byte-identical); subscribe card on admin page. 211 tests green. **Prod Neon 0003 migrate + deploy deferred to batch with QT5.** | 2026-07-03 | f6b293b | [260703-sn2-subscribable-multi-poll-organizer-calend](./quick/260703-sn2-subscribable-multi-poll-organizer-calend/) |

## Deferred Items

Items acknowledged and deferred at v1.0 milestone close on 2026-07-07 (override_closeout — none are shipped-code gaps; all are human-eyeball sign-offs or an obsolete seed):

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| uat | Phase 05 05-UAT.md — 9 human visual/AT scenarios (screen-reader announcement, pixel fidelity vs mocks, mobile sticky footer) | testing | 2026-07-07 |
| verification | Phase 05 05-VERIFICATION.md — human_needed (same visual/AT sign-off; code-level 10/10 must-haves verified, 270 tests green, design screenshot-verified on prod) | human_needed | 2026-07-07 |
| uat | Phase 03 03-UAT.md — 0 pending scenarios (effectively clear; flagged only because file present) | passed | 2026-07-07 |
| seed | SEED-001-phase4-free-email-no-domain — obsolete; Phase 4 email shipped (Gmail SMTP live in prod) | dormant | 2026-07-07 |

## Session Continuity

Last session: 2026-07-07 — v1.1 roadmap created
Stopped at: ROADMAP.md written with Phases 7 (Respondent Tracking & Nudges) and 8 (Scheduling Controls); REQUIREMENTS.md traceability filled (5/5 mapped); STATE.md advanced to v1.1 Phase 7 ready-to-plan
Resume file: None

## Operator Next Steps

- Plan Phase 7 with `/gsd-plan-phase 7` (Respondent Tracking & Nudges — RESP-03 → RESP-01 → RESP-02).
- Per project hook: run the edge-probe family after SPEC.md/PLAN.md and close findings before execution.

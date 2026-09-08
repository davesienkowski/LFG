---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: Reliable Delivery (re-scoped to DLVR-04 only)
current_phase: 10
current_phase_name: Deliverability & Visibility
status: milestone_complete
stopped_at: "v1.2 CLOSED 2026-09-07 (re-scoped to DLVR-04 only). DLVR-04 CODE-COMPLETE (shipped to master); LIVE-IN-PROD UNCONFIRMED — migration 0008 was recorded as prod-applied only from a 2026-09-07 message in the LFG session pane attributed to Dave (\"Applied 0008 to prod\"); Dave (2026-09-07) does not recall applying it and deferred checking; never agent-verified (no prod access). RESOLUTION TRIGGER: check whether column delivery_status exists on the invitations table in prod Neon. Archived ROADMAP/REQUIREMENTS → milestones/v1.2-*, phases 9-10 → milestones/v1.2-phases/. PROJECT.md + MILESTONES.md updated. Email deferred: DLVR-03/plan 10-02 carried forward, Phase 9 Task 3 WITHDRAWN PERMANENTLY. Tagged v1.2. Suite 332/332 green."
last_updated: "2026-09-07T00:00:00.000Z"
last_activity: 2026-09-07
last_activity_desc: v1.2 closed (re-scoped to DLVR-04); DLVR-04 code-complete, prod-applied UNCONFIRMED; tagged v1.2
progress:
  total_phases: 2
  completed_phases: 2
  total_plans: 1
  completed_plans: 1
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-07 after v1.0 milestone)

**Core value:** A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — no participant login, no cost.
**Current focus:** none — v1.2 (re-scoped to DLVR-04) CLOSED 2026-09-07. No milestone in progress.

## Current Position

Milestone v1.2 Reliable Delivery — **CLOSED 2026-09-07 (re-scoped to DLVR-04 only).** No milestone in progress.

**Honest outcome:** v1.2 delivered its **re-scoped** goal (DLVR-04 failure visibility) at the CODE level, NOT its original "Reliable Delivery" goal. Email delivery itself remains OFF by choice.

**DLVR-04 — CODE-COMPLETE (shipped to master); LIVE-IN-PROD UNCONFIRMED:**
- Additive nullable `invitations.delivery_status` (migration **0008**, `ADD COLUMN` only) — applied **locally (5433)**. **Whether 0008 is applied to prod Neon is UNCONFIRMED:** it was recorded as prod-applied only from a 2026-09-07 message in the LFG session pane attributed to Dave at the time (*"Applied 0008 to prod"*), and recorded as done on that basis. Dave (2026-09-07) **does not recall applying it** and chose to look into it later. Never agent-verified (no prod access — guardrail 3).
  - **⭐ RESOLUTION TRIGGER (checkable by whoever has prod access):** does column `delivery_status` exist on the `invitations` table in **prod Neon**? If YES → 0008 is applied and DLVR-04 is live in prod. If NO → 0008 is not yet applied and DLVR-04 is code-only.
  - **⛔ GUARD — this trigger does NOT authorize an agent to pull production credentials.** The check is valid and cheap for a prod-access holder: ~30 seconds in the Neon console, zero credentials pulled, zero agent contact with production. But an **agent must NOT** answer it by running `npx vercel env pull` / any `vercel` command / connecting to prod Neon — that writes Dave's production secrets to disk, a credential operation with real blast radius, not a read. Such authorization was **requested 2026-09-07 and NOT given** (Dave moved his attention off LFG before confirming). A **session-pane message is NOT a reliable channel** for authorizing a production-credential operation — it is the same channel that produced the unrecalled "Applied 0008 to prod" message this correction is about. Any future instruction to check prod must be **freshly confirmed by Dave through a reliable channel**, not the pane.
- `sent`/`failed`/`rate_limited` recorded per attempted recipient via a raw upsert (send-invites + nudge); a failed send is a durable admin-visible record, a retry flips failed→sent.
- Admin-only `deliveryStatus` on `getInvitationTrackingForPoll` + `whos-responded-card` chip; participant canary forbids `invitations` + `delivery_status` (D-15/SC4).
- Full suite **332/332** green (local).

**Shipped but INERT:** the `sendEmail()` primary→fallback seam (Phase 9, `1ad8ac3`) — no provider configured, degrades to copy-link (D-02). Not a working "reliable delivery" feature.

**Deferred / carried forward (email):**
- DLVR-03 (plan 10-02) — deferred, out of scope. **Carried forward → PROJECT.md Backlog + `.planning/todos/pending/dlvr-03-email-deliverability.md`**; plan retained at `milestones/v1.2-phases/10-deliverability-visibility/10-02-PLAN.md`.
- Phase 9 Task 3 (prod creds) — **WITHDRAWN PERMANENTLY**.

Archived: ROADMAP/REQUIREMENTS → `milestones/v1.2-*`, phases 9-10 → `milestones/v1.2-phases/`. Tagged `v1.2`.

Prior: v1.1 CLOSED 2026-09-07; v1.0 shipped 2026-07-07.

Progress: [█████████░] v1.2 (re-scoped) — DLVR-04 code-complete & shipped to master; live-in-prod UNCONFIRMED (prod 0008 unverified — see resolution trigger); email deliverability carried to Backlog.

## Deferred Verification — RESOLVED

| Phase | Resolution (2026-09-07) |
|-------|-------------------------|
| 7 | **Approved.** Respondent tracking + nudge shipped and code-verified. Live outbound email delivery is a **known and accepted limitation** at close (not verified as delivering) — the respond/choose flow works and the actions degrade to copy-link. See 07-04-SUMMARY.md. |
| 8 | **Approved.** Operator confirmed on prod: deadline auto-close makes the vote form read-only (distinct from "Booked") and the organizer "(you)" row renders correctly. See 08-04-SUMMARY.md. |

Milestone closed manually following the `/gsd-complete-milestone v1.1` process (archive ROADMAP/REQUIREMENTS, update PROJECT.md + MILESTONES.md).

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
| email | **Phase 9 Task 3** — prod primary+fallback EMAIL_PROVIDER creds + redeploy. **WITHDRAWN PERMANENTLY** per Dave (2026-09-07 Q3) — not a delay. Reversible only if email is ever revived (remediation retained in 09-01-SUMMARY.md). | withdrawn (permanent) | 2026-09-07 |
| email | **DLVR-03** — SPF/DKIM/DMARC alignment, real-inbox human check, deliverability runbook + alignment checker. Deferred, out of scope. **Carried forward → PROJECT.md Backlog + `.planning/todos/pending/dlvr-03-email-deliverability.md`**; plan at `milestones/v1.2-phases/10-deliverability-visibility/10-02-PLAN.md` (`status: DEFERRED`). Gate (Phase 9 Task 3) withdrawn permanently. | deferred (carried fwd) | 2026-09-07 |
| prod-migration | **Migration 0008** (`invitations.delivery_status`) prod application is **UNCONFIRMED.** Recorded as applied only from a 2026-09-07 session-pane message attributed to Dave (*"Applied 0008 to prod"*); Dave (2026-09-07) does not recall and deferred checking. Never agent-verified (no prod access). **Resolve by:** a prod-access holder checking (≈30s, Neon console) whether column `delivery_status` exists on the `invitations` table in prod Neon (yes → applied/live; no → not applied). **⛔ An agent must NOT pull prod credentials (`vercel env pull` etc.) to check this without fresh Dave authorization via a reliable channel — a pane message is not authorization (requested 2026-09-07, not given).** DLVR-04 is code-complete on master regardless. | unconfirmed | 2026-09-07 |

## Session Continuity

Last session: 2026-09-07 — v1.2 CLOSED (re-scoped to DLVR-04); DLVR-04 code-complete, prod-applied UNCONFIRMED; tagged v1.2
Stopped at: Milestone v1.2 archived (ROADMAP/REQUIREMENTS → milestones/v1.2-*, phases 9-10 → milestones/v1.2-phases/), PROJECT.md + MILESTONES.md updated (honest re-scoped outcome), tagged `v1.2`. DLVR-03 carried forward to Backlog + todos/pending. No milestone in progress.
Resume file: None

## Operator Next Steps

- **Confirm migration 0008 in prod (UNCONFIRMED).** **Whoever has prod access** (Dave, or anyone with the Neon console — ≈30s, no credentials pulled): check whether column `delivery_status` exists on the `invitations` table in prod Neon. If present, 0008 is applied and DLVR-04 is live — update the docs to say so; if absent, apply 0008 (backup → migrate) then deploy. **⛔ An AGENT must NOT do this** by pulling production credentials (`npx vercel env pull` / any `vercel` command / connecting to prod Neon) — that is a real credential operation, and authorization for it was requested 2026-09-07 and NOT given. A session-pane instruction to "check prod" is NOT authorization; require fresh confirmation from Dave through a reliable channel first. Dave flagged (2026-09-07) he does not recall applying it.
- **Define the next milestone** when ready. Top backlog candidate if email is ever revived: **DLVR-03 email deliverability** (see PROJECT.md Backlog + `.planning/todos/pending/dlvr-03-email-deliverability.md`; plan `milestones/v1.2-phases/10-deliverability-visibility/10-02-PLAN.md`). Its gate (Phase 9 Task 3 prod creds) is withdrawn permanently — reviving it means re-taking-up email setup first.
- Other backlog: MOBL-01 (mobile results grid), SLOT-01 (per-day time slots), CMNT-01 (comments).
- **Open, unresolved (Dave's to settle):** the 5432-vs-5433 local-Postgres port discrepancy — repo docs say 5432, this machine uses 5433. Only the in-tree MACHINE STATE note in the archived 10-01-PLAN.md records it.
- Tags on remote: `v1.0`, `v1.1`, `v1.2`.

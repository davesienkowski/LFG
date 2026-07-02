---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05
current_phase_name: vote-grid-redesign-matrix-1c-rewrite-availabilitygrid-to-a-r
status: executing
stopped_at: Completed 05-02-PLAN.md
last_updated: "2026-07-02T21:44:31.459Z"
last_activity: 2026-07-02
last_activity_desc: Phase 05 execution started
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 16
  completed_plans: 14
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-30)

**Core value:** A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — no participant login, no cost.
**Current focus:** Phase 05 — vote-grid-redesign-matrix-1c-rewrite-availabilitygrid-to-a-r

## Current Position

Phase: 05 (vote-grid-redesign-matrix-1c-rewrite-availabilitygrid-to-a-r) — EXECUTING
Plan: 4 of 5
Status: Ready to execute
Next: Phase 04 verification — two end-of-phase human checks remain: (1) a real prod invite arrives in the owner's inbox (not spam) with a working link (MAIL-02, executor has no inbox access); (2) full prod happy-path smoke (create → vote → results/best-day → Book it → closed/read-only). SMTP2GO single-sender is the recorded fallback if Gmail spam-folders/DMARC-fails or hits the 100/day cap (T-04-13).
Last activity: 2026-07-02 — Phase 05 execution started

Progress: [███████░░░] 75% (3 of 4 phases complete; Phase 04 execution done, pending verification)

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

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Phase 1]: Three-token access model — separate `adminUrlId`, `participantUrlId`, and per-participant `editToken`, none derivable from another.
- [Phase 1]: Crypto-random non-enumerable IDs (nanoid) for all public identifiers; no auto-increment integers in URLs.
- [Phase 1]: Postgres everywhere (Docker local + Neon prod) — Neon chosen over Supabase (no 7-day pause); use pooled connection string.
- [Phase 1]: Date-only slots stored as Postgres DATE and parsed without the `new Date()` constructor (no timezone drift).
- [Phase 1]: Dual-driver Drizzle client typed as a single concrete driver type (cast neon-http branch) — the union type collapses Drizzle's overloaded query signatures
- [Phase 1]: Schema-push gate honored: polls/options migrated into live Docker Postgres and verified via psql before asserting reads/writes
- [Phase ?]: 01-02: Order options ASC NULLS FIRST so date-only sorts before timed same-day, matching insert-time position
- [Phase ?]: 01-02: createPoll uses no interactive transaction (neon-http production-safe); only the poll insert carries the token-collision retry
- [Phase ?]: submitResponse is INSERT-only; editToken is a third independent nanoid(21), never derived from participantUrlId (D-11)
- [Phase ?]: vote.state stored as text constrained by Zod enum at the action boundary, not a Postgres enum (D-03)
- [Phase ?]: VoteForm gained an optional heading prop so 02-02's edit route reuses it verbatim
- [Phase ?]: 02-02: Fixed missing Secure flag on lfg_edit cookie (secure: NODE_ENV==='production'), found by the production smoke test rather than unit tests
- [Phase ?]: 02-02: updateResponse re-derives the participant strictly from the server-validated editToken, never a client-supplied participantId (VOTE-06 IDOR defense)
- [Phase ?]: 04-01: sendEmail() is the single env-switched outbound-email seam (none|smtp|resend); 04-02 finalization reuses it
- [Phase ?]: 04-01: email fully optional (D-02) — Mailpit local capture, zero email config still builds/tests green; EMAIL_FROM DMARC discipline (D-03) documented
- [Phase ?]: 04-01: VOTE-04 confirmation fires best-effort via after() only from submitResponse (first-submit-only); update-response.ts untouched
- [Phase 4]: 04-03: prod Neon migrated (0002 winning_option_id) + Vercel prod deploy live; .env.example documents Mailpit + Gmail SMTP shapes (!.env.example un-ignore, Rule 3)
- [Phase 4]: 04-03: Gmail SMTP enabled in prod (D-03 EMAIL_FROM=SMTP_USER on smtp.gmail.com self-aligns SPF/DKIM/DMARC); secrets held only in Vercel env; SMTP2GO single-sender is the pre-wired fallback behind the same D-01 seam (T-04-13)
- [Phase ?]: 05-01: AvailabilityGrid rewritten to role=radiogroup/radio matrix (D-01); desktop icon-only cells + labelled column headers, mobile stacked icon+text segments; both layers in DOM with display:none a11y isolation
- [Phase 05]: 05-02: kept shipped semantic ResultsGrid <table> + scroll-fade (no CSS-grid port); added only the mock's bordered-card wrapper + filter select widths — D-09 forbids structural rewrites
- [Phase 05]: 05-02: admin shell, InviteByEmailForm, BookItControl verified no-drift vs boards 3d/3e — two-step finalize + closed-poll hiding preserved
- [Phase ?]: 05-03: D-03 mobile submit as sticky pinned footer

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

None yet.

### Blockers/Concerns

[Issues that affect future work]

- [Phase 4]: Email options researched → **SEED-001** (`.planning/seeds/SEED-001-phase4-free-email-no-domain.md`). Key finding: a domain is NOT required — Gmail SMTP + App Password is a genuinely-free, no-domain path with good deliverability (send *as* your gmail; SPF/DKIM/DMARC align), with SMTP2GO single-sender as fallback and Resend+domain as an optional deliverability upgrade. Watch the gmail-From-via-relay DMARC trap. Re-verify free-tier numbers at build time. (Original concern — ~48h DNS / ~$10-12/yr domain — only applies if we choose the Resend+domain path.)
- 04-03 Task 1 BLOCKER — **RESOLVED (2026-07-02):** the Neon prod DATABASE_URL was obtained via `npx vercel env pull .env.vercel.local --environment=production`; `npm run db:migrate` applied `drizzle/0002_superb_skaar.sql` to prod Neon (`polls.winning_option_id` verified) and `npx vercel@latest deploy --prod --yes` shipped the Phase 4 code (dpl_2eW7gorAzFRQE45zYmKcsAen8Aew READY on looking-for-group-eight.vercel.app). `.env.vercel.local` stays gitignored/untracked.
- 04-03 Task 2 (human-action checkpoint) — **RESOLVED (2026-07-02):** the owner enabled Google 2-Step Verification, generated a Gmail App Password, and set the 7 Gmail SMTP vars in Vercel Production (EMAIL_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM). Var names verified present; prod redeployed (looking-for-group-f8uvztjhh READY; alias serves HTTP 200); the build now selects the Gmail transport. **Open (end-of-phase human check):** a real prod invite arriving in the owner's inbox (not spam) with a working link — the executor has no inbox access to self-verify.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260701-il0 | Phase 2 code-review follow-ups #1 (activate env validation via instrumentation register hook) + #2 (pure setState updater in AvailabilityGrid) + remove stale checkpoint | 2026-07-01 | 1570165 | [260701-il0-apply-phase-2-code-review-follow-ups-1-w](./quick/260701-il0-apply-phase-2-code-review-follow-ups-1-w/) |
| 260702-k1u | Add "Add to Calendar" links (Google Calendar link + hosted/attached `.ics`) for the booked date to the finalization email — timezone-safe floating/all-day event, closed-poll-only route, best-effort | 2026-07-02 | 41467c0 | [260702-k1u-add-add-to-calendar-links-google-calenda](./quick/260702-k1u-add-add-to-calendar-links-google-calenda/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-02T21:44:09.417Z
Stopped at: Completed 05-02-PLAN.md
Resume file: None

**Planning gate note — RESOLVED (2026-07-01):** During Phase 2 and Phase 3 planning, the
`decision-coverage-plan` gate returned `could-not-parse` (total:0) because those phases'
CONTEXT.md used phase-prefixed decision IDs (the `D<phase>-NN` form) but the parser only
recognizes bare `D-NN`. Both times coverage was real (gsd-plan-checker independently confirmed
all decisions traceable to tasks; requirements coverage 6/6 and 5/5 respectively) and the phases
were shipped under a documented override. **Fixed:** all decision IDs across `.planning/` renamed
to bare `D-NN` (Phase 1 already used it); the gate now parses (Phase 2 total:11, Phase 3 total:7).
Going forward, author CONTEXT.md decisions as bare `D-NN`.

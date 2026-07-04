---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 05
current_phase_name: vote-grid-redesign-matrix-1c-rewrite-availabilitygrid-to-a-r
status: ready-for-verification
stopped_at: 05 execution COMPLETE — all 5 plans shipped (13 commits) on master. Post-merge gate green (176/176 tests + build). Verifier 10/10 must_haves (D-01..D-10 hold in real code); status human_needed → 9 pixel/AT-fidelity checks in 05-UAT.md await sign-off via /gsd-verify-work 5. Code review: no blockers (WR-01 roving-tabindex tradeoff, IN-01 bg-white token — optional follow-ups). ALSO STILL OPEN: Phase 04 verification (real prod invite lands in inbox not spam [MAIL-02] + full prod happy-path smoke).
last_updated: "2026-07-03T22:25:00Z"
last_activity: 2026-07-03
last_activity_desc: "Quick task 260703-pdt — show current poll results on participant thanks page (176/176 tests + build green, deployed to prod)"
progress:
  total_phases: 5
  completed_phases: 4
  total_plans: 16
  completed_plans: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-30)

**Core value:** A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — no participant login, no cost.
**Current focus:** Phase 05 — vote-grid-redesign-matrix-1c-rewrite-availabilitygrid-to-a-r

## Current Position

Phase: 05 (vote-grid-redesign-matrix-1c-rewrite-availabilitygrid-to-a-r) — EXECUTING
Plan: 5 of 5
Status: Phase complete — ready for verification
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
| Phase 05 P04 | 15min | 2 tasks | 3 files |
| Phase 05 P05 | 3min | 2 tasks | 2 files |

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
- [Phase ?]: 05-04: reconciled poll-create surface to board 3a/3a-m — sm:-only card frame (desktop) + full-bleed mobile so the Create poll action pins as a sticky border-top footer (D-09); createPoll action + serialized dates + timezone-safe date-only handling unchanged
- [Phase ?]: D-10 implemented: per-provider calendar-button color (Google #1a73e8 vs neutral FG #171717) via calLink background param

### Pending Todos

[From .planning/todos/pending/ — ideas captured during sessions]

Live-site UX review (2026-07-03) captured 5 results/admin/participant polish items, being cleared via quick tasks:
- ~~Redesign admin results display for readability (too small/cramped)~~ ✓ DONE 2026-07-03 (folded into results-grid rework 260703-r8r)
- ~~Fix admin results filters (best-slot ranking + standalone status filter)~~ ✓ DONE 2026-07-03 (folded into results-grid rework 260703-r8r)
- ~~Show current results on participant page~~ ✓ DONE 2026-07-03 (quick task 260703-pdt)
- ~~Make candidate date lists horizontal/compact ("Book it" + poll description)~~ ✓ DONE 2026-07-03 (quick task 260703-ppz)
- ~~Email admin link to creator on poll creation~~ ✓ DONE 2026-07-03 (quick task 260703-rqc)
- ~~Shared subscribable calendar feed of finalized poll dates~~ ✓ DONE 2026-07-03 (quick task 260703-sn2 — multi-poll organizer feed; user chose the real-value scope; prod migrate+deploy pending, batched with QT5)

**New feature request (2026-07-03, user) — ✓ DONE (quick task 260703-t7e).**
**DB backup (2026-07-03, user request, pre-migration):** full pg_dump of PROD Neon saved to `/home/dave/lfg-db-backups/lfg-prod-neon-20260703-211115.sql` (7 polls/70 options/8 participants/122 votes + neon_auth + drizzle ledger). Taken before 0003/0004 hit prod. pg18 client required (Neon prod is PG 18.4; local pg_dump 17 mismatches — dump via `docker run --rm postgres:18`).
**Prod deploy status — ✓ DONE 2026-07-03:** prod Neon migrated (0003 organizer_id + 0004 creator_email verified present; 5 migrations recorded) and Vercel prod redeployed (alias looking-for-group-eight.vercel.app; new /feed/[organizerId]/calendar.ics route live — smoke: home 200, thanks-no-cookie 404, unknown-organizer feed → 200 valid empty VCALENDAR). Session shipped 6 quick tasks: pdt, ppz, r8r, rqc, sn2, t7e.

**Live design refinement (2026-07-03, user) — RESOLVED:** results grid on BOTH admin + participant should surface the "best" slot first/most-prominent. User chose: KEEP orientation (people=rows, dates=columns), move best day column(s) leftmost (NOT a transpose — Phase 05 D-09 preserved), and fix filters in same task. Shipped in 260703-r8r.

Plus: Shared subscribable calendar feed of finalized poll dates (2026-07-02).

Review with `/gsd-capture --list`.

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
| 260703-pdt | Show current poll results on participant post-submit (thanks) page — read-only "Current results" section reusing ResultsGrid via participant-safe queries (no email/token/admin leak, no migration) | 2026-07-03 | 418dfa8 | [260703-pdt-show-current-poll-results-on-participant](./quick/260703-pdt-show-current-poll-results-on-participant/) |
| 260703-ppz | Compact horizontal wrapping candidate-date chips on admin echo + Book-it picker (layout only; radio/two-step-confirm semantics intact; 44px tap targets) | 2026-07-03 | 32669ce | [260703-ppz-compact-horizontal-candidate-date-lists-](./quick/260703-ppz-compact-horizontal-candidate-date-lists-/) |
| 260703-r8r | ResultsGrid rework (admin + participant): best-day column(s) moved leftmost via single displayOptions array, best-day summary line, readability polish, and decoupled always-active filter (Best day / specific / All-dates modes; status works standalone). Covers 2 todos: redesign-results-display + fix-admin-filters | 2026-07-03 | 11cd350 | [260703-r8r-results-grid-rework-best-day-column-firs](./quick/260703-r8r-results-grid-rework-best-day-column-firs/) |
| 260703-rqc | Optionally email the ADMIN link to the poll creator on creation — optional creatorEmail form field, best-effort after()+sendEmail send (mirrors Phase 04 pattern), new renderCreatorAdminLinkEmail template (sole legit /a/ admin-URL email, creator recipient). Email transient (never persisted, no migration); D-02 preserved | 2026-07-03 | 62a2c0f | [260703-rqc-email-admin-link-to-creator-on-poll-crea](./quick/260703-rqc-email-admin-link-to-creator-on-poll-crea/) |
| 260703-t7e | Email the poll creator on EACH participant response (submit + edit). Persists creator email: `polls.creator_email` (nullable — **migration 0004_late_the_santerians.sql**), stored in createPoll. Best-effort after() notify on submit-response AND update-response, naming the participant + linking the admin results view; admin_url_id + creator_email fetched ONLY via new server-side getPollAdminNotifyTargets(pollId), used ONLY inside after() closures (never on participant surface). New renderParticipantResponseNotification template. D-02 preserved; 220 tests green. **Prod migrate 0004 + deploy batched below.** | 2026-07-03 | 0c8bbab | [260703-t7e-email-poll-creator-on-each-participant-s](./quick/260703-t7e-email-poll-creator-on-each-participant-s/) |
| 260703-sn2 | Subscribable multi-poll organizer calendar feed. NEW account-free organizer identity: `polls.organizer_id` (nullable, indexed — **migration 0003_organic_metal_master.sql**), minted/reused via httpOnly `lfg_organizer` cookie in createPoll so same-browser polls group. New `GET /feed/[organizerId]/calendar.ics` emits a multi-event VCALENDAR of that organizer's closed polls (unknown/empty → valid empty calendar, no 404 oracle, no token/participant leak); refactored calendar/links.ts to add `buildVcalendar` (buildIcs byte-identical); subscribe card on admin page. 211 tests green. **Prod Neon 0003 migrate + deploy deferred to batch with QT5.** | 2026-07-03 | f6b293b | [260703-sn2-subscribable-multi-poll-organizer-calend](./quick/260703-sn2-subscribable-multi-poll-organizer-calend/) |

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(none)* | | | |

## Session Continuity

Last session: 2026-07-02T22:02:09.699Z
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

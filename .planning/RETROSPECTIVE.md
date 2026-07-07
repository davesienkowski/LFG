# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-07-07
**Phases:** 6 | **Plans:** 20 | **Timeline:** 2026-06-30 → 2026-07-07 (8 days) | **Commits:** 195 (63 `feat`)

### What Was Built
- Poll creation with month-calendar multi-select, three independent unguessable nanoid tokens (admin/participant/edit), and timezone-safe date-only storage
- Account-free three-state participant voting with token-verified self-edit, same-device auto-load, and bulk per-row actions
- Admin-only results dashboard: participants × dates grid, per-date tallies, best-day highlighting, zero-network status/date filter, no email leak
- Env-switched `sendEmail()` seam (none/SMTP/Resend) + two-step "Book it" finalization; live Gmail SMTP in production
- WCAG-correct responsive redesign (radiogroup vote matrix, mobile sticky footers), behavior-preserving, screenshot-verified on prod
- Account-free "Your polls" organizer dashboard + subscribable multi-poll calendar feed of booked dates

### What Worked
- **Vertical-slice first (Phase 1):** shipping create-poll → admin-links end-to-end early (incl. a live Vercel/Neon deploy in 01-03) meant every later phase built on a proven, deployed spine.
- **Single seams over sprawl:** one `sendEmail()` env-switch and one `computeResults()` pure function kept email and results logic testable and swappable; both paid off when prod email moved to Gmail SMTP behind the same seam.
- **Prod screenshot verification caught real bugs** unit tests structurally couldn't — the desktop horizontal-overflow (`min-w-0`) regression and the missing cookie `Secure` flag both surfaced from driving the real deployment.
- **Additive, nullable migrations** (`winning_option_id`, `organizer_id`, `creator_email`) kept every schema change backward-compatible and prod-safe.

### What Was Inefficient
- **ROADMAP.md was collapsed to the active phase during development**, so the `milestone.complete` CLI under-archived (saw only Phase 6). Required manual reconstruction of the full v1.0 archive at close time.
- **Phase-prefixed decision IDs** (`D5-01`) tripped the `decision-coverage-plan` gate twice (false `could-not-parse`), forcing documented overrides until all IDs were renamed to bare `D-NN`.
- **Formal Phase 5 UAT scenarios were never run as written** — superseded ad hoc by prod screenshots, leaving 9 "pending" scenarios that had to be acknowledged as deferred at close.
- **Local pg_dump version mismatch** (client 17 vs Neon PG 18) cost a detour before settling on `docker run postgres:18` for backups.

### Patterns Established
- Bare `D-NN` decision IDs everywhere in `.planning/` (never phase-prefixed) so coverage gates parse.
- Every public identifier is a crypto-random nanoid; no auto-increment integers in URLs.
- Date-only values stored as Postgres DATE and never parsed through `new Date()` — a hard project rule (PLAT-04).
- Best-effort side effects (emails) fire via `after()` and never block or fail the primary action.
- UI redesigns are behavior-preserving and verified against the live deployment with Playwright full-page screenshots (a capture wider than the viewport = a horizontal-overflow bug).

### Key Lessons
1. **Keep all shipped phases in ROADMAP.md through milestone close** (or grouped, not deleted) — the archival tooling reads scope from the roadmap, so collapsing it mid-flight loses history the CLI would otherwise capture.
2. **Deploy on Phase 1, not at the end** — the earliest prod deploy turns "works locally" into "works deployed," and every subsequent smoke test finds environment bugs (cookies, drivers, overflow) that jsdom can't.
3. **Distinguish code-verifiable from human-verifiable acceptance up front** — visual/AT fidelity and inbox-deliverability are genuine gaps unit tests can't close; track them as first-class deferred checks rather than letting them read as "untested."
4. **One env-switched seam per external dependency** makes free-tier swaps (local Mailpit → Gmail SMTP → SMTP2GO fallback) a config change, not a code change.

### Cost Observations
- Model mix: executors/planners/reviewers pinned to Opus 4.8; researchers/verifiers/checkers to Sonnet; classifiers to Haiku (per config `model_overrides`).
- Mode: `yolo` / `coarse` granularity — auto-advancing chains kept phase turnaround tight (most plans 3–35 min execution).
- Notable: a heavy tail of 9 same-day quick tasks (2026-07-03 UX polish) rode on top of the 6 planned phases — the redesign work lived mostly in quick tasks + Phase 5, not the original roadmap.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 6 | 20 | Established GSD phase flow, prod-from-Phase-1 deploy, bare `D-NN` decision IDs, prod screenshot verification |

### Cumulative Quality

| Milestone | Tests | LOC (app+tests) | Requirements |
|-----------|-------|-----------------|--------------|
| v1.0 | 270 green | ~13.5K TS/TSX | 30/30 v1 complete |

### Top Lessons (Verified Across Milestones)

1. Deploy early; the live environment finds the bugs jsdom cannot. *(v1.0)*
2. One env-switched seam per external dependency keeps free-tier swaps to config. *(v1.0)*

*(Cross-milestone entries accumulate as future milestones ship.)*

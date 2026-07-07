# Milestones

## v1.0 MVP (Shipped: 2026-07-07)

**Phases completed:** 6 phases (1-6), 20 plans
**Timeline:** 2026-06-30 → 2026-07-07 (8 days)
**Git range:** 195 commits (63 `feat`), first `5d7c602` → tag `v1.0`
**Codebase:** ~13.5K LOC TypeScript/TSX (app + tests), 270 tests green
**Closeout:** override_closeout — 4 items acknowledged and deferred (see STATE.md Deferred Items); all are human visual/AT sign-offs or an obsolete seed, no shipped-code gaps.
**Requirements:** 30/30 v1 requirements complete and verified.

**Delivered:** A free, self-hostable Doodle "Group Poll" clone — organizer proposes candidate dates, participants vote three-state via an account-free (optionally emailed) link, and a live admin dashboard highlights the best day(s) and finalizes with "Book it"; running $0 on Vercel free tier + Neon with live Gmail SMTP email.

**Key accomplishments:**

- Poll creation with a month-calendar multi-select, three independent unguessable nanoid tokens (admin / participant / edit), and timezone-safe date-only storage (Phases 1)
- Account-free three-state participant voting (Available / If-need-be / Not available) with token-verified self-edit, same-device auto-load, and bulk per-row actions (Phase 2)
- Admin-only results dashboard: participants × dates grid, per-date tallies, best-day highlighting, and a zero-network status/date filter — with no participant-email leak (Phase 3)
- Env-switched `sendEmail()` seam (none/SMTP/Resend) driving invite + confirmation emails and a two-step "Book it" finalization that closes the poll and notifies every voter; live Gmail SMTP in production (Phase 4)
- WCAG-correct responsive redesign — role=radiogroup/radio vote matrix, mobile sticky footers, mock-faithful screens — with zero behavior change, screenshot-verified on prod (Phase 5)
- Account-free "Your polls" organizer dashboard (`lfg_organizer` cookie) plus a subscribable multi-poll calendar feed of booked dates (Phase 6)

---

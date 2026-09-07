# Milestones

## v1.1 Organizer Controls (Shipped: 2026-07-07 · Closed: 2026-09-07)

**Phases completed:** 2 phases (7-8), 8 plans
**Codebase:** 321 tests green
**Prod:** migrations 0005/0006/0007 applied to Neon; deployed to Vercel free tier
**Closeout:** Both end-of-phase human checks approved 2026-09-07. Phase 8 (deadline auto-close + organizer "(you)" row) visually confirmed on prod. Phase 7 respondent tracking / nudge shipped and code-verified; **live outbound email delivery is a known and accepted limitation** — participants can still open, respond, and choose, and the nudge/invite actions degrade gracefully to copy-link.
**Requirements:** 5/5 v1.1 requirements complete (RESP-01/02/03, DEAD-01, ORG-01).

**Delivered:** Organizer controls to drive a poll to a confident decision — persisted invitations with a responded / not-responded status on the admin view, a one-click nudge to the non-respondents, an optional voting deadline that lazily closes the poll on access (no cron), and the organizer's own availability row (single-row upsert, "(you)" in the results grid and best-day computation). All schema changes additive + nullable, consistent with the v1.0 prod-safe pattern.

---

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

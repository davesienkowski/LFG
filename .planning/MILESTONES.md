# Milestones

## v1.2 Reliable Delivery — re-scoped to DLVR-04 (Closed: 2026-09-07)

**Phases:** 9-10 (re-scoped mid-milestone). 1 plan executed (10-01); 1 deferred (10-02).
**Codebase:** 332 tests green (local). Migration 0008 (`invitations.delivery_status`) — prod application **UNCONFIRMED** (see the delivered note below).
**Git:** closing commit tagged `v1.2`. Phase 9 seam `1ad8ac3`; DLVR-04 `d708065`.

**⚠️ Honest outcome — v1.2 delivered its RE-SCOPED goal, not its original one.** Partway through, Dave deferred the email portion of the project (does not want to set up email delivery), so the milestone was re-scoped from "make email actually deliver" to **DLVR-04 (failure visibility) only**.

**Delivered (DLVR-04 — CODE-COMPLETE on master; LIVE-IN-PROD UNCONFIRMED):** per-recipient email delivery visibility. A failed/rate-limited send now persists a durable, admin-only "failed / needs-retry" record on the "Who's responded" card (was a silent drop). Additive nullable `invitations.delivery_status` (migration 0008), recorded via atomic upsert in the invite + nudge senders (a retry flips failed→sent); admin-only access boundary canary-locked (no participant-facing surface exposes it); reuses the existing status chips (no auto-retry implication).

> **⚠️ Prod status of migration 0008 is UNCONFIRMED.** It was recorded as prod-applied only from a 2026-09-07 message in the LFG session pane attributed to Dave at the time (*"Applied 0008 to prod"*), and recorded on that basis. Dave (2026-09-07) does not recall applying it and chose to look into it later; it was never agent-verified (no prod access). **Resolution trigger:** check whether column `delivery_status` exists on the `invitations` table in prod Neon — yes → applied and DLVR-04 live; no → not applied and DLVR-04 is code-only. The code is on master (`d708065`) either way.
>
> **⛔ Guard (do NOT let this trigger authorize a credential pull).** The check is cheap for a prod-access holder — ~30 seconds in the Neon console, zero credentials pulled, zero agent contact with production. But an **agent must NOT** resolve it by pulling production secrets (`npx vercel env pull` / any `vercel` command / connecting to prod Neon): that has real blast radius and is not a read. Authorization for it was **requested 2026-09-07 and not given** (Dave moved his attention off LFG before confirming). A **session-pane message is not a reliable channel** for authorizing a production-credential operation — it is the same channel that produced the unrecalled "Applied 0008 to prod" message above. A future "check prod" instruction needs fresh confirmation from Dave through a reliable channel, not the pane. (Precedent for "leave the artifact, let the record explain what not to do": the v1.0 tag note above.)

**Shipped but INERT (Phase 9, `1ad8ac3`):** the `sendEmail()` primary→fallback provider seam. Real and tested, but does nothing until a provider is configured — with none set it degrades to copy-link (D-02), which is the chosen state. This is NOT a working "reliable delivery" feature.

**Deferred / out of scope (carried forward — see PROJECT.md backlog + `.planning/todos/pending/`):**
- DLVR-03 — SPF/DKIM/DMARC alignment + human-verified real-inbox send (plan `milestones/v1.2-phases/10-deliverability-visibility/10-02-PLAN.md`, `status: DEFERRED`). Its D-19 gate (Phase 9 Task 3 prod creds) is WITHDRAWN PERMANENTLY.
- Phase 9 Task 3 — prod EMAIL_PROVIDER credentials + redeploy: WITHDRAWN PERMANENTLY.

**Net:** email delivery itself remains OFF by choice; what shipped is the *visibility* of send outcomes plus an inert delivery seam.

---

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
**Tag note (why v1.0 is the outlier — BY DESIGN, not an oversight):** the annotated `v1.0` tag points at `07151c4` *"chore: remove REQUIREMENTS.md for v1.0 milestone"*. Unlike `v1.1` (→ `8f8d02b`) and `v1.2` (→ `a785304`), there is **no** `docs: close milestone v1.0` commit — the close-milestone-commit convention began with **v1.1**, after v1.0 had already shipped. So v1.0 predates the convention; its tag is intentionally left pointing where it is. Do NOT "fix" it to match v1.1/v1.2 — moving a published annotated tag would be destructive and would apply a rule that did not exist when v1.0 shipped. (Verified 2026-09-07: v1.0→`07151c4`; v1.1→`8f8d02b` and v1.2→`a785304` are both `docs: close milestone` commits; no `close milestone v1.0` commit exists in history.)
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

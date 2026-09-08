# 10-01 SUMMARY — DLVR-04 Failure Visibility (BUILT)

**Executed:** 2026-09-07
**Plan:** 10-01-PLAN.md
**Status:** Complete — built, full suite green locally (332/332, port 5433). One prod follow-up for Dave (below).
**Milestone context:** v1.2 re-scoped to DLVR-04 only (Dave 2026-09-07); DLVR-03/plan 10-02 and Phase 9 Task 3 deferred (email out of scope; prod creds withdrawn permanently).

## What shipped (SC3, SC4, SC5)

**Task 1 — additive column + migration 0008**
- `src/lib/db/schema.ts`: added nullable `deliveryStatus: text("delivery_status")` to `invitations` (no `.notNull()`, no default). Legacy rows = NULL = unknown.
- `drizzle/0008_futuristic_retro_girl.sql`: exactly `ALTER TABLE "invitations" ADD COLUMN "delivery_status" text;` — **ADD COLUMN only**, no NOT NULL / ALTER / DROP.
- Applied **LOCALLY ONLY** (port 5433, `DATABASE_URL` derived from shell env; no committed config/.env edited). Verified: column exists, `is_nullable = YES`, `data_type = text`.

**Task 2 — record delivery outcome for every attempted recipient (upsert)**
- `send-invites.ts` + `nudge-non-respondents.ts`: every attempted send records `sent` / `failed` / `rate_limited` via a **raw parameterized upsert** on the functional unique index `(poll_id, lower(email))`. (drizzle 0.45.2's `onConflictDoUpdate` cannot serialize an expression-index target — it throws `escapeName(undefined)` — so the ON CONFLICT clause is written as raw bound-parameter SQL. No injection: all values are `${}` parameters.)
- A **failed send now persists a durable row** (previously nothing was recorded on failure — the silent drop). A later successful retry **flips the same row failed→sent** (atomic upsert; concurrent/any-casing duplicates resolve via ON CONFLICT, never a thrown unique violation — the edge-probe concurrency fold-in).
- Best-effort (D-05): the upsert is inside the existing try/catch — never throws to the user, never aborts the loop, never alters the `SendInviteResult` row.
- The malformed-address case is unchanged: it never reaches `sendEmail`, so it records no row (a validation failure, not a send failure).

**Task 3 — admin-only surface + participant boundary**
- `getInvitationTrackingForPoll` now returns `{ email, responded, deliveryStatus }` — `deliveryStatus` is select-only, so the **stable `invited_at asc` + `id` tiebreaker ordering is unchanged** (edge-probe ordering fold-in). Admin-only; no participant route calls it (D-15).
- `whos-responded-card.tsx` renders a per-recipient chip via `SEND_STATUS_META` **only for `failed`/`rate_limited`** (happy path `sent`/NULL unchanged). Icon + text label, never colour alone (WCAG 1.4.1). The label prescribes MANUAL action ("share the link manually") — **no auto-retry implication** (D-16 / prohibition-probe).
- Participant canary (`p/[participantUrlId]/page.test.ts`) extended: the non-vacuous test proves `deliveryStatus` is admin-surfaced, and the structural guard now forbids **both** `invitations` AND `delivery_status` (and `deliveryStatus`) in every participant-route source (SC4 / D-15).

## Access-control confirmation (SC4)
The participant canary forbids BOTH strings on every participant-facing route source; the admin card is the sole render site; `getInvitationTrackingForPoll` is called only by the admin page + the nudge action. delivery_status never crosses to a participant surface.

## Tests
- New/changed: send-invites — 2 `(b)` tests flipped to assert a durable failed/rate_limited row + delivery_status, plus a new `(b')` failed→sent flip; nudge — new `(i)` update-in-place test; queries — structural key test updated to include `deliveryStatus` + a new NULL/failed surfacing test; participant canary extended.
- **Full suite: 31 files, 332/332 passed, exit 0** — re-verified in-session against local Postgres on `127.0.0.1:5433` (`DATABASE_URL` port-overridden for the run only; no repo/config/.env change). `tsc --noEmit` + eslint clean.

## ⚠️ Follow-up for Dave — prod status of migration 0008 is UNCONFIRMED
> **Correction (2026-09-07):** this section originally read "NOT done". The honest state is **UNCONFIRMED, not not-done.** After this summary was written, a message in the LFG session pane attributed to Dave said *"Applied 0008 to prod"*, and it was briefly recorded as applied; Dave (2026-09-07) then said he does not recall applying it and deferred checking. It was never agent-verified (no prod access). **Resolve by checking whether column `delivery_status` exists on the `invitations` table in prod Neon** — if present, 0008 is applied; if absent, apply it.
- **If 0008 is not yet in prod Neon, apply it** before DLVR-04 works in production. Follow the established prod pattern: back up prod Neon → `npm run db:migrate` against the prod `DATABASE_URL` → deploy the app code. This is additive/nullable, so it is safe on existing rows (they read NULL = unknown).
> **⛔ Guard:** the schema check and this migration are for **whoever has prod access** (Dave, or anyone with the Neon console). An **agent must NOT** pull production credentials (`npx vercel env pull` / any `vercel` command / connect to prod Neon) to check or apply this without **fresh authorization from Dave via a reliable channel** — a session-pane message is not authorization (it was requested 2026-09-07 and not given, and the pane is the same channel that produced the unrecalled "Applied 0008 to prod" message). See the fuller guard in STATE.md / MILESTONES.md.
- Email itself stays OFF (deferred): with no provider configured, sends return "Email not configured" and record nothing new; DLVR-04 simply has nothing to show until/unless email is revived. It does no harm in the meantime.

## Notes
- No new dependency. No app code touched outside the DLVR-04 surface.
- The 5432-vs-5433 machine/repo discrepancy is Dave's open item; only the in-tree MACHINE STATE note in 10-01-PLAN.md states it. Not touched here.

# Phase 10: Deliverability & Visibility — Context

**Gathered:** 2026-09-07
**Status:** Ready for planning
**Requirements:** DLVR-03 (deliverability), DLVR-04 (failure visibility)
**Depends on:** Phase 9 (Delivery Restoration & Fallback). **GATED on Phase 9 Task 3** — the prod-credential + redeploy step Dave owns. Deliverability (SC1/SC2) and failure-surfacing (SC3) are only meaningful once prod email actually sends; execution of this phase must NOT begin until that prod send works (D-19).

<domain>
## Phase Boundary

The mail that now sends (Phase 9) must actually LAND in the inbox, and the organizer must SEE when it doesn't.

- **DLVR-03 (SC1, SC2)** — Sender identity is SPF/DKIM/DMARC-aligned for the configured provider(s) on the FREE tier, and a real production send is HUMAN-VERIFIED to land in a real inbox (not spam) with a working link. This closes the v1.0/v1.1 open inbox human check — it must be CLOSED, not re-deferred.
- **DLVR-04 (SC3, SC4)** — A per-recipient failed / needs-retry indicator on the ADMIN view, so a send failure is a durable, visible record instead of a silent drop. The indicator NEVER leaks participant emails on any participant-facing surface and never blocks or errors a normal page load (best-effort, `after()`-consistent).
- **SC5** — No regression to the v1.0/v1.1 happy path locally or on the Vercel free tier.

In scope: an additive nullable `delivery_status` on `invitations`; recording delivery outcome for every attempted recipient (invite + nudge); an admin-only read + admin card chip; canary tests for the participant/admin access boundary; a free-tier SPF/DKIM/DMARC alignment runbook + non-secret verification scaffolding.

Out of scope: paid domain / paid email plan (the $0 constraint holds — D-17); open/click analytics (send success/failure only); automatic retry/cron (the indicator says "needs-retry"; the organizer re-sends manually); inbound/reply handling.
</domain>

## Decisions

Author decisions for this phase. IDs continue the project's bare `D-NN` sequence (last used: D-13).

- **D-14 — Persist per-recipient delivery status.** Add an additive, nullable `delivery_status` column to `invitations` (migration 0008) and record every attempted recipient — `sent` / `failed` / `rate_limited` — via upsert on both the success AND failure paths. Today an invitation row is inserted ONLY on a successful send, so a failure persists nothing and is visible only in the transient form response; D-14 makes a failed send a durable, admin-visible record (fixes the silent drop; DLVR-04 / SC3).
- **D-15 — Delivery status is an admin-only access-control boundary, not a UI detail.** The status rides the existing admin-token-gated `getInvitationTrackingForPoll` read; NO participant-facing query selects `invitations` or `delivery_status`, and this is enforced by a structural canary test (the `page.test.ts` `.not.toContain("invitations")` guard, D-09 precedent). The same per-recipient data is allowed on the admin surface and disallowed on every participant-facing surface (SC4).
- **D-16 — Reuse the existing `send-status-meta.ts` chips.** The admin failed / needs-retry indicator reuses the shared `sent` / `rate_limited` / `failed` chip meta already driving the invite + nudge forms — one status vocabulary, one icon+label+palette source, no parallel status path (DLVR-04).
- **D-17 — Free-tier-only alignment; stop rather than pay.** SPF/DKIM/DMARC alignment (SC1) is achieved on the FREE tier only. If free-tier alignment is not achievable, STOP and report — never select a paid domain or paid plan. The $0 constraint and the REQUIREMENTS Out of Scope note hold.
- **D-18 — SC1 (DNS) and SC2 (real-inbox arrival) are HUMAN checks, not agent tasks.** SC1 needs Dave's DNS records at his registrar/DNS provider; SC2 needs Dave's own eyes on a real inbox after a real prod send. The plan builds verification scaffolding (a runbook + non-secret alignment checks) AROUND them but does NOT plan to self-close them.
- **D-19 — Phase 10 is gated on Phase 9 Task 3.** Dave must finish the phase-9 prod-credential step (primary + fallback creds + redeploy, so prod email actually sends) BEFORE Phase 10 execution begins. Planning may proceed now; execution waits on that dependency.

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/db/queries.ts:421` `getInvitationTrackingForPoll(pollId)` — the admin-only RESP-01 read returning `{ email, responded }[]`, ordered `invited_at` asc + stable `invitations.id` tiebreaker. DLVR-04 extends its select to add `deliveryStatus`. It is never called by a participant-facing route (D-09 discipline).
- `src/components/whos-responded-card.tsx` — the admin card rendering the tracking rows; where the new per-recipient chip lands.
- `src/components/send-status-meta.ts` — the shared `SEND_STATUS_META` (`sent` / `rate_limited` / `failed`: icon + label + palette). Reuse verbatim (D-16); note the current `failed` label already reads "Failed to send — share the link manually" (a needs-retry affordance).
- `src/lib/actions/send-invites.ts:114-140` — the invite send loop; today inserts an invitation `onConflictDoNothing()` ONLY on `result.ok`. D-14 changes this to record on every path (sent/failed/rate_limited) via upsert.
- `src/lib/actions/nudge-non-respondents.ts:83` — the nudge send; records the same way so a failed nudge is also visible.
- `src/app/p/[participantUrlId]/page.test.ts:310-325` — the existing STRUCTURAL CANARY (`source.not.toContain("invitations")`) proving the participant page never reads invitations. Extend this discipline to cover `delivery_status` (SC4 / D-15).

### Established Patterns
- Additive, nullable, backward-compatible migrations (`winning_option_id`, `organizer_id`, `creator_email`, `invitations`, `deadline`, `is_organizer`).
- Best-effort side effects never throw to the user / never abort the loop / never block a page load (`after()` + the send-invites try-catch precedent).
- Admin-only reads deliberately return emails but are never wired to a participant route (D-09 / `getVoterEmailsForPoll` / `getInvitationTrackingForPoll`).
- Prod migration is the same backup → migrate → deploy gate as Phases 7/8 (self-serve, Dave).

### Integration Points
- New nullable `invitations.delivery_status` in `src/lib/db/schema.ts` + drizzle migration 0008.
- `getInvitationTrackingForPoll` return shape gains `deliveryStatus`.
- `whos-responded-card.tsx` renders the admin chip.
- send-invites + nudge record delivery outcome.
</code_context>

<human_checks>
## Human Checks (NOT agent-closable — D-18)

| SC | Check | Owner | Why not agent-closable |
|----|-------|-------|------------------------|
| SC1 | SPF/DKIM/DMARC records aligned for the configured provider(s), free tier only | Dave | Requires DNS records at Dave's registrar/DNS provider; no agent access, and $0 constraint forbids a paid path (D-17) |
| SC2 | A real prod send lands in a real inbox (not spam) with a working link | Dave | Requires a real production send + Dave's own eyes on a real inbox; closes the v1.0/v1.1 open check (must NOT be re-deferred) |

The plan provides a runbook + non-secret verification scaffolding for both; it does not self-close them.
</human_checks>

<specifics>
## Specific Ideas
- `delivery_status` = a nullable text enum-ish column (`sent` | `failed` | `rate_limited`); NULL = legacy/no-record (pre-0008 rows), read as unknown.
- Record via upsert: `onConflictDoUpdate` on the `(poll_id, lower(email))` index so a later successful retry flips `failed` → `sent`.
- The admin card shows the chip only when a status exists; a plain invited/responded row with NULL status renders exactly as today (no regression).
</specifics>

<deferred>
## Deferred Ideas
- Automatic retry / scheduled re-send of failed recipients — out (cron; the organizer re-sends manually).
- Open/click/bounce-webhook analytics — out (send success/failure only).
- A custom sending domain — out ($0 / D-17); free-tier self-aligned identity only.
</deferred>

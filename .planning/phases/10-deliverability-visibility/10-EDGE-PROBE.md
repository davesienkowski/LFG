# Phase 10 — Edge-Probe Family Findings & Closure

**Run:** 2026-09-07, after 10-01/10-02 PLAN.md written (project edge-probe gate).
**Engine:** `node ~/.claude/gsd-core/bin/lib/edge-probe.cjs` on DLVR-03, DLVR-04, SC3, SC4, SC5.
**Result:** 12 findings; all resolved (covered) or dismissed (source-backed). 2 genuine fold-ins applied to 10-01-PLAN.md.

## Deterministic edge-probe (12 findings)

| # | Req | Category | Resolution | Where |
|---|-----|----------|------------|-------|
| 1 | DLVR-03 | unclassified | **Dismiss** — deliverability is DNS/config + human (SC1/SC2, D-18); no data/behavior shape edge for the taxonomy to see. | 10-02 (human checks) |
| 2 | DLVR-04 | idempotency | **Covered** — a re-send flips the SAME recipient row failed→sent via upsert; tested in Task 2 <behavior>. | 10-01 T2 |
| 3 | DLVR-04 | concurrency | **Fold-in** — added must_have: recording is an atomic upsert on (poll_id, lower(email)); concurrent/duplicate recordings are last-writer-wins, never a thrown unique violation. | 10-01 must_haves |
| 4 | SC3 | adjacency | **Covered** — two same-email (case-insensitive) invitations collapse to one row via the existing functional unique index; upsert keeps one. | 10-01 T2 (index) |
| 5 | SC3 | empty | **Covered** — empty invite list → no rows; NULL/legacy delivery_status renders exactly as today (D-14). | 10-01 T1/T3, SC5 |
| 6 | SC3 | ordering | **Fold-in** — added must_have: deliveryStatus is select-only; the read keeps its stable invited_at asc + invitations.id tiebreaker order. | 10-01 must_haves |
| 7 | SC3 | idempotency | **Covered** — same as #2 (failed→sent flip). | 10-01 T2 |
| 8 | SC3 | concurrency | **Covered by #3 fold-in.** | 10-01 must_haves |
| 9 | SC4 | adjacency | **Covered** — an email that is both invited and a participant: the responded EXISTS join handles case-insensitive match; delivery_status stays admin-only regardless (D-15 canary). | 10-01 T3 |
| 10 | SC4 | empty | **Covered** — the canary asserts the participant source references neither 'invitations' nor 'delivery_status' irrespective of data. | 10-01 T3 |
| 11 | SC4 | ordering | **Covered by #6 fold-in** (admin-side ordering unchanged). | 10-01 must_haves |
| 12 | SC5 | unclassified | **Dismiss** — meta/no-regression requirement; closed by the full-suite-green gate. | 10-01 verification |

## Prohibition-probe (manual): "What could this silently become that Dave would NOT want, but the spec does not forbid?"

| Candidate | Verdict | Handling |
|-----------|---------|----------|
| The delivery_status column leaks onto a participant surface (it rides the invitations row, which holds the email) | **Real** | Already forbidden: Task 3 extends the participant canary to forbid BOTH 'invitations' AND 'delivery_status'; prohibition bans selecting either from any participant query (D-15). |
| A "needs-retry" label implies the system will AUTO-retry (there is no cron) — false again-feedback | **Real → fold-in** | Added prohibition: reuse SEND_STATUS_META's manual-action label ('… share the link manually'); no auto-resend implied (D-16). |
| Best-effort recording silently fails, so the admin sees "no status" and assumes success | **Mitigated** | Best-effort write logs server-side (existing send-invites console.error precedent); a NULL status renders as "unknown/as-today", never as a false "sent". |
| delivery_status shows a stale 'sent' after a later bounce | **Out of scope** | Scope is dispatch success/failure, not post-delivery bounce webhooks (analytics deferred, 10-CONTEXT). |

## Net changes folded into the plan
- 10-01 must_haves: **+2** (concurrency atomic-upsert; ordering stability).
- 10-01 prohibitions: **+1** (no auto-retry implication).
- No new findings block execution; all edges resolved or dismissed with a source-backed reason.

# 09-01 SUMMARY — Delivery Restoration & Fallback (DLVR-01 + DLVR-02)

**Executed:** 2026-09-07
**Plan:** 09-01-PLAN.md
**Status:** Tasks 1–2 code-complete & verified. Task 3 (prod restore) escalated to Dave — credential/deploy gated (per plan checkpoint + guardrails).

## What shipped (code)

- **`src/lib/email/send.ts`** — refactored the single-provider branch into an ordered **primary→fallback provider chain** inside the one `sendEmail()` seam:
  - Extracted `sendVia(provider, from, args)` holding the (verbatim) per-provider smtp/resend bodies + the message-only catch with the `rateLimited` heuristic.
  - `CHAIN` is built **once at module load** from `EMAIL_PROVIDER` (primary) + `EMAIL_FALLBACK_PROVIDER` (fallback): `none`/unset dropped, provider de-duplicated. Each attempt pairs the provider with the `from` it is authorized for (primary → `EMAIL_FROM`; fallback → `EMAIL_FALLBACK_FROM ?? EMAIL_FROM`, D-03).
  - `sendEmail()` returns the **first `{ok:true}`**, only falls through on `{ok:false}` (transport error or rate-limit), and returns the **last** failure if all fail. Empty chain → `{ok:false, error:"Email not configured"}` touching **no** transport (D-02).
- **`src/lib/env.ts`** — added optional `EMAIL_FALLBACK_PROVIDER` + `EMAIL_FALLBACK_FROM` to **both** `server` and `runtimeEnv` (no drift). Unset = today's single-provider behavior exactly.
- **`src/lib/email/send.test.ts`** — +8 cases: primary-only-on-success, fallthrough-in-order (asserts `invocationCallOrder`), rate-limit→fallback, fallback own-`from`, both-fail→last-error with **neither** `SMTP_PASS` nor `RESEND_API_KEY` leaked (T-04-05), dedupe, fallback-unset superset, and a DLVR-01 dispatch guard (a configured send reaches the transport exactly once).

**Invariants preserved (verified):** never throws; no secret leak on either link; single-string `to` (no CC/BCC-all, T-04-03); `none`→"Email not configured" with no transport; zero-email-env still builds/boots/tests (D-02). **No call site changed** — send-invites / nudge-non-respondents / close-poll still call `sendEmail({to: <string>})` (grep + diff confirmed); the chain is invisible above the seam.

## Test results

- **Full suite: 31/31 files, 329/329 tests, exit 0** — re-verified in-session against the local Postgres on `127.0.0.1:5433` (this machine's port; `DATABASE_URL` port-overridden for the run only, **no repo/config/.env change**).
- Email seam: **17/17** (10 pre-existing kept verbatim + 8 new + dispatch guard). `tsc --noEmit` clean.

## DLVR-01 diagnosis (Task 2) — why prod email is currently off

The send **code path exists and is tested** (Phase 4); the "accepted limitation" is **configuration/credentials, not code**. In production, outbound email is off because `EMAIL_PROVIDER` is unset (→ the first-class `{ok:false, error:"Email not configured"}` MAIL-03 path) or its provider credentials are stale/revoked (→ a transport auth error surfaced as a `failed` send chip). Either way `sendEmail()` already degrades gracefully to the copy-link fallback the organizer sees today via `send-status-meta.ts` (sent / rate_limited / failed chips).

**Remediation (Dave, Task 3 — escalated, NOT performed here):**
1. Set the **primary** provider env in Vercel prod: `EMAIL_PROVIDER` + its creds (SMTP_* for Gmail, or `RESEND_API_KEY`) + `EMAIL_FROM` aligned to it.
2. Set the **fallback**: `EMAIL_FALLBACK_PROVIDER` (a *different* provider) + that provider's creds (+ optional `EMAIL_FALLBACK_FROM`).
3. Redeploy prod; confirm a real send **dispatches** (no "Email not configured").

Per guardrails, this session ran **no** `vercel env ls`, set **no** credentials, and performed **no** deploy. Inbox / not-spam human verification is **Phase 10 (DLVR-03)** — not claimed here.

## Follow-ups / notes

- Fallback scoped as *a different provider than the primary* (e.g. Gmail SMTP → Resend), reusing the existing distinct cred vars. Full SPF/DKIM/DMARC alignment of the fallback sender is **Phase 10 / DLVR-03**; `EMAIL_FALLBACK_FROM` makes an aligned fallback sender *possible* now.
- Local Postgres on this machine listens on **5433** (not the repo default 5432) — a machine-state detail, handled with a per-run `DATABASE_URL` override, no committed change.

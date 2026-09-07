# Backlog: DLVR-03 — Email deliverability (SPF/DKIM/DMARC + real-inbox verification)

**Captured:** 2026-09-07 (at v1.2 close)
**Status:** DEFERRED / out of scope — reversible
**Origin:** milestone v1.2 "Reliable Delivery", re-scoped to DLVR-04 only when Dave deferred the email portion.

## What it is
Make outbound email actually LAND in the inbox and prove it:
- SPF/DKIM/DMARC-aligned sender identity for the configured provider(s), **free tier only** (no paid domain/plan — $0 constraint holds).
- A real production send **human-verified** to arrive in a real inbox (not spam) with a working link.

## Why deferred
Dave does not want to set up email delivery (decision 2026-09-07). The whole email portion is deferred; DLVR-03 moved out of v1.2 scope.

## Gate / dependency
- Depends on **Phase 9 Task 3** (prod EMAIL_PROVIDER primary + fallback credentials + redeploy), which is **WITHDRAWN PERMANENTLY**. Reviving DLVR-03 requires first re-taking-up email setup (credentials + a provider).
- The code it builds on already exists: the `sendEmail()` primary→fallback seam shipped inert in Phase 9 (commit `1ad8ac3`); with no provider configured it degrades to copy-link (D-02).

## Where the full plan lives
`.planning/milestones/v1.2-phases/10-deliverability-visibility/10-02-PLAN.md` (`status: DEFERRED`) — includes a free-tier alignment runbook task and a non-secret public-DNS alignment checker (`scripts/check-email-alignment.mjs`, not yet built). Edge-probe/prohibition findings for the phase: `.../10-EDGE-PROBE.md`.

## To revive
1. Confirm email setup is being taken up again (re-open Phase 9 Task 3 — provider creds).
2. Un-defer 10-02-PLAN.md and execute it (SC1 DNS + SC2 real-inbox are Dave's human checks).

## Open unrelated item (not part of DLVR-03)
The 5432-vs-5433 local-Postgres port discrepancy (repo docs say 5432; this machine uses 5433) is still unresolved and is Dave's to settle. Only the in-tree MACHINE STATE note in 10-01-PLAN.md records it.

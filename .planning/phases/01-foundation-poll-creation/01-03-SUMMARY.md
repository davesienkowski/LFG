# Plan 01-03 Summary — Vercel/Neon Deploy (FINAL)

**Plan:** 01-03 (Vercel/Neon free-tier deployment)
**Status:** Complete
**Requirements:** PLAT-02, PLAT-03

## Outcome

Phase 1 is live in production on free tiers, deployed AFTER the local Docker Desktop stack proved the full flow (D-13). Same single Drizzle schema; the `neon-http` driver is selected automatically by `NODE_ENV=production` — no code divergence.

**Production URL:** https://looking-for-group-eight.vercel.app
**Vercel project:** `davesienkowskis-projects/looking-for-group` (`prj_PlpVKR1Y28sA0d0aD8uNZC9kk7TQ`)
**Neon project:** `Looking-For-Group` (`round-smoke-14801672`, Postgres 18, aws-us-east-1), pooled connection (`-pooler`).

## What was done

- **Removed the `/health` diagnostic skeleton** (PLAN-boundary prohibition-probe finding) — its unauthenticated DB-write button must not ship to prod. Deployed `/health` → 404.
- **[BLOCKING] Migrated the schema to Neon** before serving traffic: `drizzle-kit migrate` against the Neon pooled URL → `polls` + `options` tables + `options_dedup` (NULLS NOT DISTINCT) confirmed present via `information_schema`.
- **Set Vercel production env** (encrypted): `DATABASE_URL` = Neon pooled string, `NEXT_PUBLIC_BASE_URL` = the production alias.
- **Deployed** via the authenticated Vercel CLI (`vercel --prod`). Initial deploy used a guessed base URL; corrected `NEXT_PUBLIC_BASE_URL` to the assigned alias `looking-for-group-eight.vercel.app` and redeployed.
- **Wrote the deploy runbook** into `README.md` and `.env.production.example` (placeholders only, no secrets).

## Verification (automated, against the live URL)

| Check | Result |
|-------|--------|
| `/` (creation form) | 200 |
| `/health` (diagnostic removed) | 404 ✓ |
| `/a/<invalid>` , `/p/<invalid>` (non-enumerable) | 404 ✓ (LINK-03) |
| Seeded poll → `/a/<adminToken>` | 200, shows title + "Keep private" badge ✓ (UI-P1) |
| Seeded poll → `/p/<participantToken>` | 200, shows title, does NOT leak admin token ✓ (P2) |
| Prod app ↔ Neon read path | working (seed + read + cleanup via pg) |

## Deviations

- Vercel assigned the alias `looking-for-group-eight.vercel.app` (the plain `looking-for-group` name was taken); `NEXT_PUBLIC_BASE_URL` was corrected and the app redeployed.
- Deploy executed by the orchestrator (inline) rather than a `gsd-executor` subagent, because the deploy relies on the authenticated Vercel CLI + `neonctl` in the orchestrator context and on secret handling that must not be echoed.

## Recommended human spot-check (write path + cold start)

Automated checks covered the read path and all prohibitions. Two items are best confirmed in a browser:
1. Create a poll on https://looking-for-group-eight.vercel.app/ and confirm it lands on the admin page with both links.
2. After ~5 min idle (Neon auto-suspend), create another poll — confirm no cold-start 504.

## Notes

- Secrets: `DATABASE_URL` lives only in Vercel env + gitignored local files; `.vercel/` and `.env*` are gitignored. No secrets committed.
- shadcn theme remains base-nova/neutral (carried from 01-01) — cosmetic, deferred.

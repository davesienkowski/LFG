# Plan 07-04 Summary — Prod Ship + Human Email Verify

**Status:** Task 1 COMPLETE (prod shipped); Task 2 DEFERRED (human inbox check — cannot be automated)
**Date:** 2026-07-07

## Task 1 — Back up prod Neon, apply the 0005 migration, deploy (self-serve) ✅

Executed in the mandated order (backup → migrate → deploy), self-serve per project MEMORY (prod-migrate-self-serve). Secrets never echoed to logs.

1. **Creds:** `npx vercel@latest env pull .env.vercel.local --environment=production --yes` (CLI pre-authed as `davesienkowski`). Prod `DATABASE_URL` present (not Sensitive-blanked); derived the direct (non-pooled) endpoint by stripping `-pooler`; `sslmode` present.
2. **Backup FIRST (hard precondition):** dumped prod Neon with a **pg18** client (`docker run postgres:18 pg_dump`, matching Neon PG18) to `/home/dave/lfg-db-backups/lfg-prod-neon-20260707-175801.sql` — **52,152 bytes**, non-empty. Provenance confirmed: contains the `neon_auth.*` schema (98 refs) that the local Docker DB lacks, plus `public.{polls,options,participants,votes}`. `invitations` correctly absent (pre-migration).
3. **Migrate prod:** `DATABASE_URL="$DIRECT" npm run db:migrate` applied **only 0005** (prod journal was at 5 → now 6). Verified `\d invitations` in prod: columns `id / poll_id / email / invited_at`, PK, FK `poll_id → polls(id) ON DELETE CASCADE`, and the functional unique index `invitations_poll_lower_email_unique (poll_id, lower(email))`. Additive-only — no existing table altered; pre-deploy serverless code simply ignored the new table.
4. **Deploy:** `npx vercel@latest deploy --prod --yes` → deployment `dpl_92Aqh6Dd4bR8KfQhYNfpcMEHqKaN`, `readyState: READY`, `target: production` (a READY production build means Vercel compiled the new admin-page code that imports `getInvitationTrackingForPoll`).
5. **Smoke check:** `https://looking-for-group-eight.vercel.app/` → HTTP 200, renders `<title>Looking For Group</title>` + the create-poll form.

**Backup artifact:** `/home/dave/lfg-db-backups/lfg-prod-neon-20260707-175801.sql` (outside the repo; contains real user data — never committed).

## Task 2 — Human-verify a real nudge email delivers (DEFERRED) ⏳

This is a `checkpoint:human-verify` gate and CANNOT be automated — the executor has no inbox access. HTTP smoke (Task 1 step 5) is the partial substitute the memory allows; true deliverability + the responded-status flip must be confirmed by the owner on the live prod app.

**Owner steps (on `https://looking-for-group-eight.vercel.app`):**
1. On a poll's admin page `/a/<adminUrlId>`, send an email invite to an address you control that hasn't voted.
2. Refresh — confirm that address shows under "Who's responded" with an amber **Not yet responded** badge and "0 of 1 responded" + the caption "Only counts people invited by email through this tool."
3. Click **Nudge non-respondents** — confirm the chip shows **Sent**.
4. Check that inbox: the reminder ("Reminder: your response is needed") arrives **in inbox (not spam)** and its link opens the correct participant voting page.
5. Vote from the link, refresh admin — badge flips to emerald **Responded**; nudge button shows "Everyone's responded — nothing to nudge."

If the email spam-folders or the link is wrong, describe the failure and it becomes a follow-up gap rather than closing the check.

**Resume:** `/gsd-verify-work 7` (or reply "approved") once the nudge email arrived with a working link and status behaved as described.

# Plan 08-04 Summary — Prod Ship + Human Browser Verify

**Status:** Task 1 COMPLETE (prod shipped); Task 2 DEFERRED (human live-browser check — cannot be automated)
**Date:** 2026-07-07

## Task 1 — Back up prod Neon, apply migrations 0006 + 0007, deploy (self-serve) ✅

Executed in the mandated order (backup → migrate → deploy), self-serve per project MEMORY (prod-migrate-self-serve). Secrets never echoed.

1. **Creds:** `npx vercel@latest env pull .env.vercel.local --environment=production --yes`. Prod `DATABASE_URL` present; derived the direct (non-pooled) endpoint by stripping `-pooler`.
2. **Backup FIRST:** pg18 client (`docker run postgres:18 pg_dump`) → `/home/dave/lfg-db-backups/lfg-prod-neon-20260707-190936.sql` — **53,311 bytes**, non-empty. Provenance: `neon_auth.*` present (98 refs); the Phase-7 `invitations` table present (confirms current prod). Journal at 6 pre-migrate.
3. **Migrate prod:** `DATABASE_URL="$DIRECT" npm run db:migrate` applied **0006 + 0007** (journal 6 → 8). Verified in prod: `polls.deadline` column present, `participants.is_organizer` column present, and the partial unique index `participants_one_organizer_per_poll` present. All additive — no existing column altered; pre-deploy code tolerated the new nullable columns.
4. **Deploy:** `npx vercel@latest deploy --prod --yes` → `readyState: READY`, `target: production` (`looking-for-group-msvwa33d2-...`). A READY production build means Vercel compiled the new deadline/organizer code.
5. **Smoke check:** `https://looking-for-group-eight.vercel.app/` → HTTP 200, renders `<title>Looking For Group</title>` + create-poll form.

**Backup artifact:** `/home/dave/lfg-db-backups/lfg-prod-neon-20260707-190936.sql` (outside the repo; real user data — never committed).

## Task 2 — Human-verify auto-close & organizer row on live prod (DEFERRED) ⏳

`checkpoint:human-verify` — CANNOT be automated (time-dependent auto-close + visual states; no agent browser/inbox access). HTTP smoke (Task 1 step 5) is the partial substitute.

**Owner steps (on `https://looking-for-group-eight.vercel.app`):**

*DEAD-01 (deadline auto-close):*
1. On a poll's admin page `/a/<adminUrlId>`, set a **Voting deadline** a couple minutes in the future; confirm it saves and the admin header shows the deadline (no "Booked" pill).
2. Before it passes: open the participant link `/p/<participantUrlId>` in another browser — voting still works.
3. After the deadline passes: reload the participant page — the vote form is **read-only** with "voting closed — deadline passed" copy (distinct from a booked poll). Try submitting a stale form — the server rejects it.
4. Confirm the admin still shows the deadline-passed state (amber), NOT a "Booked" pill, and no winner is claimed; you can still "Book it" afterward.

*ORG-01 (organizer's own row):*
5. On the admin page, use **"Add your availability"**, mark some dates, save. Confirm your row appears in the Results grid labeled "(you)" and counts toward the best-day tally. Edit it — confirm it stays a single row (no duplicate).

**Resume:** `/gsd-verify-work 8` (or reply "approved") once the deadline auto-close and organizer row behaved as described. If anything is off, describe it and it becomes a follow-up gap.

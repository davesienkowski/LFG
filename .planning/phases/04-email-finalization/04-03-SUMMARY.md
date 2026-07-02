---
phase: 04-email-finalization
plan: 03
subsystem: infra
tags: [vercel, neon, drizzle, migration, gmail-smtp, nodemailer, deploy, postgres, env]

# Dependency graph
requires:
  - phase: 04-email-finalization
    plan: 01
    provides: "sendEmail() env-switched transport seam (none|smtp|resend), EMAIL_PROVIDER/SMTP_* env vars, renderInvite/Finalization templates"
  - phase: 04-email-finalization
    plan: 02
    provides: "polls.winning_option_id additive migration (drizzle/0002_superb_skaar.sql), closePoll finalize action, Book-it UI"
provides:
  - "drizzle/0002_superb_skaar.sql applied to the production Neon database (polls.winning_option_id live in prod)"
  - "Phase 4 code deployed live on Vercel production (looking-for-group-eight.vercel.app)"
  - ".env.example documenting both email shapes (Mailpit local + Gmail SMTP prod) with the D-03 EMAIL_FROM=SMTP_USER note; placeholders only"
  - "Vercel Production environment configured with the 7 Gmail SMTP vars (EMAIL_PROVIDER=smtp + SMTP_HOST/PORT/SECURE/USER/PASS + EMAIL_FROM); prod build now selects the Gmail transport at runtime"
affects: [phase-04-verification, production-operations]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Self-serve prod migrate: npx vercel env pull → DATABASE_URL=<neon> npm run db:migrate → verify column on Neon → npx vercel@latest deploy --prod --yes (per prod-migrate-self-serve MEMORY)"
    - "Gmail SMTP prod deliverability: EMAIL_FROM = SMTP_USER on smtp.gmail.com self-aligns SPF/DKIM/DMARC (D-03); SMTP2GO single-sender is the pre-wired fallback behind the same D-01 seam"

key-files:
  created:
    - .env.example
  modified:
    - .gitignore

key-decisions:
  - "EMAIL_FROM = SMTP_USER in prod (D-03): the From MUST match SMTP_USER on smtp.gmail.com — a gmail From on a non-gmail relay would DMARC-fail (T-04-06)"
  - "Prod email vars set by the owner directly in the Vercel dashboard (never in the repo): the App Password is a Google credential held only in Vercel encrypted env + the gitignored .env.vercel.local (T-04-12)"
  - "Real prod email delivery verification is an end-of-phase human check (human_verify_mode: end-of-phase) — the executor has no inbox access to confirm arrival/not-spam"

patterns-established:
  - "Placeholder env template (.env.example) un-ignored via !.env.example while real .env* stay gitignored — the documentation artifact is trackable, secrets are not"

requirements-completed: [MAIL-02]

coverage:
  - id: D12
    description: "drizzle/0002_superb_skaar.sql applied to prod Neon: polls.winning_option_id column verified live on Neon before prod code reads it"
    requirement: "MAIL-02"
    verification:
      - kind: manual_procedural
        ref: "DATABASE_URL=<neon> npm run db:migrate; winning_option_id confirmed on the Neon polls table (per STATE blocker resolution + commit efab035)"
        status: pass
    human_judgment: false
  - id: D13
    description: "Phase 4 code deployed live on Vercel production; prod alias serves HTTP 200 and the running build selects the email provider from env at runtime"
    requirement: "MAIL-02"
    verification:
      - kind: manual_procedural
        ref: "npx vercel@latest deploy --prod --yes → looking-for-group-f8uvztjhh READY on target production; https://looking-for-group-eight.vercel.app serves HTTP 200"
        status: pass
    human_judgment: false
  - id: D14
    description: ".env.example documents Mailpit (local) + Gmail SMTP (prod) var shapes with the D-03 EMAIL_FROM=SMTP_USER note; no real secret committed; .env.vercel.local gitignored"
    requirement: "MAIL-02"
    verification:
      - kind: automated
        ref: "test -f .env.example && grep -q EMAIL_PROVIDER .env.example && grep -q winning_option_id drizzle/0002_superb_skaar.sql (plan Task 1 <automated> gate)"
        status: pass
    human_judgment: false
  - id: D15
    description: "Vercel Production configured with all 7 Gmail SMTP env vars (owner set 2FA + App Password + the vars); prod redeployed so the email env is live and the smtp branch is selected"
    requirement: "MAIL-02"
    verification:
      - kind: manual_procedural
        ref: "All 7 email var NAMES verified present in Vercel Production (EMAIL_PROVIDER, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, EMAIL_FROM); prod redeployed READY"
        status: pass
    human_judgment: false
  - id: D16
    description: "A real test invitation sent from the prod admin page arrives in the owner's OWN inbox (not spam) with a working participant link — MAIL-02 delivery proven end-to-end in production"
    requirement: "MAIL-02"
    verification: []
    human_judgment: true
    rationale: "The executor has no access to the owner's inbox; real-delivery + not-spam + working-link is the one step that cannot be self-verified (human_verify_mode: end-of-phase). SMTP2GO single-sender fallback (same D-01 seam) is the recorded remedy if Gmail spam-folders/DMARC-fails or hits the 100/day cap (T-04-13)."
  - id: D17
    description: "Full prod happy-path smoke: create poll → participant vote → results/best-day highlight → Book it (confirm) → poll shows closed/read-only on the participant page"
    requirement: "MAIL-02"
    verification: []
    human_judgment: true
    rationale: "The interactive end-to-end happy path on the live deployment is a human end-of-phase check (human_verify_mode: end-of-phase); a lightweight prod smoke passed but the full interactive flow needs human judgment."

# Metrics
duration: checkpoint-gated (Task 1 ~single session; Task 2 gated on owner action)
completed: 2026-07-02
status: complete
---

# Phase 4 Plan 03: Production Ship + Gmail SMTP Enablement Summary

**The Phase 4 email + finalization code is live on Vercel production against a Neon database now carrying the `winning_option_id` column, and real free-tier email sending is enabled: the owner set 2-Step Verification + a Gmail App Password + the 7 Gmail SMTP vars in Vercel Production, prod was redeployed, and the running build now selects the Gmail transport at runtime (MAIL-02 configured in production; live delivery is the one remaining end-of-phase human check).**

## Performance

- **Duration:** Checkpoint-gated — Task 1 executed in a single session; Task 2 was a `human-action` checkpoint gated on the owner enabling 2FA + generating a Google App Password (no CLI/API exists for that step).
- **Started:** 2026-07-02 (Task 1)
- **Completed:** 2026-07-02 (Task 2 resolved "done")
- **Tasks:** 2 completed
- **Files created/modified:** 2 (`.env.example`, `.gitignore`)

## Accomplishments

- **Prod Neon migration applied (MAIL-02 / T-04-11):** the additive `drizzle/0002_superb_skaar.sql` (ADD COLUMN `winning_option_id` + `ON DELETE SET NULL` FK, no existing column altered) was applied to the production Neon database via `DATABASE_URL=<neon> npm run db:migrate` after pulling the connection string with `npx vercel env pull`. The `polls.winning_option_id` column was verified live on Neon before any prod code relied on it — the same verification discipline as the local gate, run BEFORE the deploy so prod code never hit a missing column.
- **Phase 4 code deployed to Vercel production:** `npx vercel@latest deploy --prod --yes` shipped the email + finalization code; the prod alias `https://looking-for-group-eight.vercel.app` serves HTTP 200 and the latest deployment (`looking-for-group-f8uvztjhh`) is READY on target production. With email initially unconfigured, prod showed the MAIL-03 copy-link fallback and finalize succeeded with zero sends.
- **`.env.example` documented (Task 1 artifact):** both email shapes are captured as placeholders-only — the local Mailpit block (`EMAIL_PROVIDER=smtp` / `SMTP_HOST=mailpit` / `SMTP_PORT=1025` / `EMAIL_FROM=dev@localhost`) and the prod Gmail block (`EMAIL_PROVIDER=smtp` / `SMTP_HOST=smtp.gmail.com` / `SMTP_PORT=465` / `SMTP_SECURE=true` / `SMTP_USER` / `SMTP_PASS` (App Password) / `EMAIL_FROM=SMTP_USER`), with the D-03 note that `EMAIL_FROM` MUST equal `SMTP_USER` on Gmail and that all email vars are optional (MAIL-03). No real secret was committed; `.env.vercel.local` stays gitignored/untracked (T-04-12).
- **Gmail SMTP enabled in production (MAIL-02, via the human-action checkpoint):** the owner completed the human-only prerequisite — enabled Google 2-Step Verification, generated a 16-char App Password, and set all 7 email vars in the Vercel Production environment (`EMAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM=SMTP_USER` per D-03). All 7 var **names** were verified present in Vercel Production (values never read). Prod was then redeployed so the new env is live, and the running build now selects the `smtp` provider in `src/lib/email/send.ts` at runtime.

## Task Commits

Each task was committed atomically:

1. **Task 1: Apply the Neon migration, deploy to Vercel, document `.env.example`** — `efab035` (feat) — documents the email env vars (`.env.example` + `.gitignore` `!.env.example`); records the orchestrator-applied prod Neon migrate + Vercel deploy for provenance.
2. **Task 2: Enable real Gmail SMTP sending in production** — no repo file (external service config): the owner set the 7 Gmail SMTP vars in Vercel Production; the orchestrator verified the var names, redeployed prod, and confirmed the live build selects the Gmail transport. No source code changed.

**Plan metadata:** committed with this SUMMARY (`docs(04-03): complete prod ship + Gmail SMTP enablement`).

## Files Created/Modified

- `.env.example` — documents the Mailpit (local) + Gmail SMTP (prod) var shapes with the D-03 `EMAIL_FROM=SMTP_USER` note; placeholders only, mirroring `src/lib/env.ts` var names.
- `.gitignore` — un-ignore `.env.example` (`!.env.example`) so the placeholder template is trackable while real `.env*` / `.env*.local` secret files stay ignored.

## Decisions Made

- **`EMAIL_FROM = SMTP_USER` in production (D-03 DMARC trap):** on `smtp.gmail.com` the From MUST match the authenticating gmail address so SPF/DKIM/DMARC self-align; a gmail From on a non-gmail relay is never used (T-04-06).
- **Secrets held only in Vercel + the gitignored pull file (T-04-12):** the owner set `SMTP_PASS` (the App Password, a Google credential) directly in the Vercel dashboard; it is never committed nor logged; `.env.example` carries placeholders only.
- **Real prod delivery is an end-of-phase human check:** the executor cannot read the owner's inbox, so "invite arrives, not spam, working link" is deferred to a human `human_verify_mode: end-of-phase` step rather than claimed as automated pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Un-ignored `.env.example` so the Task 1 artifact could be committed**
- **Found during:** Task 1 (staging `.env.example`)
- **Issue:** The repo `.gitignore` catches `.env*` (and `.env*.local`), which also matched `.env.example` — the plan's required Task 1 artifact. Without an override the placeholder template (a documentation file, no secrets) could not be tracked.
- **Fix:** Added `!.env.example` to `.gitignore` so the placeholders-only template is trackable while real `.env` / `.env*.local` / `.env*` secret files stay ignored.
- **Files modified:** `.gitignore`
- **Verification:** `git ls-files .env.example` returns the file; `.env.vercel.local` remains untracked/ignored.
- **Committed in:** `efab035` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 × Rule 3).
**Impact on plan:** The fix was necessary to commit the plan's own required artifact and does not weaken secret-ignore coverage (real `.env*` files stay ignored). No scope creep, no source-code change.

## Issues Encountered

- **Task 2 is inherently human-gated:** generating a Google App Password has no CLI/API, so the plan correctly modeled it as a `checkpoint:human-action` (`gate="blocking-human"`). The owner replied "done"; the automatable follow-up (verify var names, redeploy, confirm the transport switch) was performed by the orchestrator out of band. The one truly-unverifiable step — real inbox delivery — is recorded below as an end-of-phase human check.

## Open Human Verification (end-of-phase — `human_verify_mode: end-of-phase`)

The following require human judgment and are NOT claimed as automated pass:

1. **Real prod email delivery (MAIL-02, the one step the executor cannot self-verify):** send a real test invitation from the prod admin page to the owner's OWN inbox and confirm it **arrives (not spam) with a working participant link**. The executor has no inbox access.
   - **Recorded remedy if it fails:** if Gmail spam-folders the message, DMARC-fails, or the 100/day automated-SMTP cap is hit (T-04-13), switch to the **SMTP2GO single-sender** path — still behind the same D-01 `sendEmail()` seam (env-only change, no code rewrite). The `rateLimited` UI (04-01) surfaces a 429 visibly and degrades to copy-link if the cap is ever hit.
2. **Full prod happy-path smoke:** on the live deployment, walk create poll → participant vote (three-state) → results grid + best-day highlight → **Book it** (two-step confirm) → poll shows finalized/Booked and the participant page renders "Voting is closed" (read-only). A lightweight prod smoke passed; the full interactive flow is a human end-of-phase check.

## User Setup Required

**Completed during this plan (Task 2 checkpoint):** the owner enabled Google 2-Step Verification, generated a Gmail App Password, and set the 7 Gmail SMTP vars in the Vercel Production environment (see the `.env.example` Gmail block for the exact var shapes). No further setup is required to run the app; the remaining item is the end-of-phase human delivery verification above.

## Next Phase Readiness

- Phase 4 execution is complete (all 3 plans shipped); the phase is **ready for verification**. The prod deployment is live on free tiers (PLAT-02/03 preserved) with the full create → invite → vote → grid → Book it → confirmation path deployed and Gmail SMTP enabled.
- The only open items are the two end-of-phase human checks above (real delivery + interactive prod smoke); neither blocks code completion.

---
*Phase: 04-email-finalization*
*Completed: 2026-07-02*

## Self-Check: PASSED

`.env.example` exists on disk and contains `EMAIL_PROVIDER`; `drizzle/0002_superb_skaar.sql` exists and contains `winning_option_id`; the Task 1 commit `efab035` is present in git history; `.env.vercel.local` is untracked/gitignored (no secret leaked). Automated criteria are met — real prod email delivery and the interactive prod happy-path are the two recorded end-of-phase human checks (delivery cannot be self-verified without inbox access).

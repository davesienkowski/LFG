---
phase: 04-email-finalization
plan: 01
subsystem: email
tags: [nodemailer, resend, mailpit, nextjs-after, server-actions, smtp, react, drizzle]

# Dependency graph
requires:
  - phase: 01-foundation-poll-creation
    provides: "env.ts createEnv shape, urls.ts builders (buildParticipantUrl/buildEditUrl), format-date.ts, getPollByAdminUrlId, docker-compose db service, resolveBaseUrl"
  - phase: 02-participant-voting
    provides: "submitResponse INSERT-only action, participants.email field, editToken model, status!='open' read-only path"
provides:
  - "Env-switched sendEmail() transport seam (none|smtp|resend) with non-throwing SendResult union"
  - "Three plain-HTML email templates (invite / confirmation / finalization)"
  - "sendInvites admin-only server action with per-recipient individual sends + dedupe"
  - "InviteByEmailForm client island with icon+label result chips and copy-link fallback"
  - "Best-effort VOTE-04 confirmation email fired from submitResponse via after()"
  - "Mailpit local SMTP capture service; nine optional email env vars"
affects: [04-02-finalization, closePoll, finalization-emails]

# Tech tracking
tech-stack:
  added: [nodemailer@9.0.3, resend@6.16.0, "@types/nodemailer@8.0.1", "axllent/mailpit:v1.30"]
  patterns:
    - "Env-switched service seam read once at module load (mirrors db/index.ts)"
    - "Best-effort non-blocking send via next/server after() before redirect(), base URL captured beforehand"
    - "Discriminated SendResult union at the transport layer (never throws)"
    - "Sequential per-recipient send loop (no Promise.all), individual sends never CC"
    - "Pure string-in/string-out HTML templates (format-date.ts discipline), no react-email"

key-files:
  created:
    - src/lib/email/send.ts
    - src/lib/email/send.test.ts
    - src/lib/email/templates.ts
    - src/lib/email/templates.test.ts
    - src/lib/actions/send-invites.ts
    - src/lib/actions/send-invites.test.ts
    - src/components/invite-by-email-form.tsx
  modified:
    - src/lib/env.ts
    - docker-compose.yml
    - src/lib/actions/submit-response.ts
    - src/lib/actions/submit-response.test.ts
    - src/app/a/[adminUrlId]/page.tsx
    - package.json

key-decisions:
  - "EMAIL_FROM discipline (D-03 DMARC trap) documented in env.ts + send.ts headers; never a gmail From on a relay"
  - "Malformed invite address becomes its own failed result row with a validation-specific message, never dropped, never aborting the batch"
  - "Server-only EMAIL_PROVIDER check on the admin page mounts the form vs the MAIL-03 copy-link fallback; unset/''/none treated identically"
  - "Confirmation hook lives only in submitResponse (INSERT-only = first-submit-only by construction); update-response.ts deliberately untouched"

patterns-established:
  - "sendEmail() seam: the single outbound-email chokepoint every future send rides (04-02 finalization reuses it)"
  - "SEND_STATUS_META icon+label chip mechanic reused from Phase 2/3 STATE_META (never color alone)"
  - "after() best-effort send: capture next/headers-derived base URL BEFORE the callback (runs post-redirect)"

requirements-completed: [MAIL-01, MAIL-02, MAIL-03, VOTE-04]

coverage:
  - id: D1
    description: "Env-switched sendEmail() seam: none->no-op, smtp single-to (never CC), rate-limit detection, never leaks SMTP_PASS/RESEND_API_KEY"
    requirement: "MAIL-02"
    verification:
      - kind: unit
        ref: "src/lib/email/send.test.ts#sendEmail — provider none / smtp / resend"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three plain-HTML email templates with timezone-safe dates and no admin-URL leakage"
    requirement: "MAIL-01"
    verification:
      - kind: unit
        ref: "src/lib/email/templates.test.ts#no admin-path leakage (T-04-02)"
        status: pass
    human_judgment: false
  - id: D3
    description: "sendInvites: admin-token auth, individual sends never CC, case-insensitive dedupe, empty-input rejected, malformed->failed row, submission-order results"
    requirement: "MAIL-01"
    verification:
      - kind: integration
        ref: "src/lib/actions/send-invites.test.ts#access control / batch / dedupe / ordering"
        status: pass
    human_judgment: false
  - id: D4
    description: "Best-effort VOTE-04 confirmation email fired via after(); a send failure never fails the vote"
    requirement: "VOTE-04"
    verification:
      - kind: integration
        ref: "src/lib/actions/submit-response.test.ts#best-effort confirmation hook (VOTE-04, D-07)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Admin page mounts the invite form when EMAIL_PROVIDER configured, else the copy-link fallback (MAIL-03); block hidden on closed poll"
    requirement: "MAIL-03"
    verification:
      - kind: manual_procedural
        ref: "docker compose up; unset EMAIL_PROVIDER -> 'Email isn't set up' card at /a/[adminUrlId]"
        status: unknown
    human_judgment: true
    rationale: "Visual/functional confirmation of the configured-vs-fallback branch and Mailpit capture is a human end-of-phase check (human_verify_mode: end-of-phase)."

# Metrics
duration: 13min
completed: 2026-07-02
status: complete
---

# Phase 4 Plan 01: Email Service, Invites & VOTE-04 Confirmation Summary

**A single env-switched `sendEmail()` seam now powers organizer invite emails (individual sends, deduped, per-recipient result chips, copy-link fallback when unconfigured) and best-effort participant confirmation emails — all optional by design so every non-email feature still passes with zero email config.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-07-02T16:20:00Z (approx)
- **Completed:** 2026-07-02T16:29:30Z
- **Tasks:** 3 completed
- **Files modified/created:** 14

## Accomplishments

- **The `sendEmail()` seam (MAIL-02):** one async function branching on `EMAIL_PROVIDER` (`none`|`smtp`|`resend`), returning a non-throwing discriminated `SendResult`, with a narrow inline `rateLimited` heuristic and a catch that never echoes `SMTP_PASS`/`RESEND_API_KEY`. Every call site is provider-agnostic; 04-02's finalization emails ride the same seam.
- **Three plain-HTML templates (D-10):** invite / confirmation / finalization, built from one Outlook-safe shell (single outer `<table>`, 600px, inline styles), dates via `formatDateWithTime`, and a proven T-04-02 guard — no template can emit an `/a/` admin path.
- **Organizer invites (MAIL-01):** `sendInvites` re-derives the poll from the admin token (V4), parses comma/newline addresses, rejects empty input with a form error, dedupes case/whitespace-insensitively, validates each address (malformed → its own failed chip), and sends individually in submission order — never CC.
- **MAIL-03 graceful degradation:** the admin page does a server-only `EMAIL_PROVIDER` check and renders either the `InviteByEmailForm` or the "Email isn't set up" copy-link fallback card; the whole invite block is hidden on a closed poll.
- **VOTE-04 confirmation:** `submitResponse` fires a best-effort confirmation via `after()` immediately before `redirect()`, with the base URL captured beforehand; a send failure never fails the vote. `update-response.ts` is untouched (first-submit-only).
- **Local capture:** a `mailpit` docker service (SMTP :1025 / UI :8025) plus nine optional email env vars added without breaking the zero-config boot.

## Task Commits

Each task was committed atomically:

1. **Task 1: Optional email env vars, Mailpit service, and three email templates** - `d801deb` (feat)
2. **Task 2: sendEmail() env-switched seam + best-effort VOTE-04 confirmation hook** - `805d9d9` (feat)
3. **Task 3: sendInvites action + Invite-by-email card (MAIL-01/02/03)** - `d5e864c` (feat)

## Files Created/Modified

- `src/lib/email/send.ts` - Env-switched sendEmail() transport seam; non-throwing SendResult union
- `src/lib/email/send.test.ts` - Mocked nodemailer/resend; none/smtp/resend/rate-limit/secret-leak cases
- `src/lib/email/templates.ts` - renderInvite/Confirmation/Finalization; shared Outlook-safe shell
- `src/lib/email/templates.test.ts` - CTA/heading presence, formatter proof, no admin-path leak
- `src/lib/actions/send-invites.ts` - Admin-only per-recipient invite send action
- `src/lib/actions/send-invites.test.ts` - V4, dedupe, empty, malformed, ordering, single-to
- `src/components/invite-by-email-form.tsx` - useActionState island + SEND_STATUS_META chips
- `src/lib/env.ts` - Nine optional email vars (server + runtimeEnv 1:1)
- `docker-compose.yml` - mailpit service + web SMTP env
- `src/lib/actions/submit-response.ts` - after() VOTE-04 confirmation hook
- `src/lib/actions/submit-response.test.ts` - no-provider submit still commits + redirects; de-flaked count assertion
- `src/app/a/[adminUrlId]/page.tsx` - Conditional invite card (configured vs MAIL-03 fallback), closed-poll guard
- `package.json` / `package-lock.json` - nodemailer/resend/@types pinned exactly

## Decisions Made

- **Result shape carries an optional per-recipient `message`** so a malformed address can show "Not a valid email address" while the status enum still drives the chip icon/palette — keeps the UI-SPEC `SEND_STATUS_META` mechanic intact.
- **Exact version pins (no caret)** for the three new packages, matching the stack's critical-dep discipline (next/drizzle) and T-04-SC's pin mandate.
- **First-seen casing preserved** for a deduped address's display, while dedupe keys on the lower-cased form.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] De-flaked a racy global participant-count assertion in submit-response.test.ts**
- **Found during:** Task 2 (extending submit-response.test.ts)
- **Issue:** The existing "unknown token → notFound()" test counted *all* participant rows in the shared Postgres before and after the call (`expect(after).toBe(before)`). Under vitest's parallel file execution, other DB-backed test files insert participants between the two counts, making the assertion fail non-deterministically (observed: 16 vs 15). This blocked the D-02 "full suite green with zero email config" acceptance criterion.
- **Fix:** Removed the global before/after count. `notFound()` throws before the participant INSERT is ever reached, so the "creates no rows" intent is structurally guaranteed by the `notFound === true` assertion alone; added a comment explaining the race.
- **Files modified:** src/lib/actions/submit-response.test.ts
- **Verification:** Full suite now green across parallel runs (132 passed, 17 files).
- **Committed in:** `805d9d9` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 × Rule 1)
**Impact on plan:** The fix was necessary for a reliable green suite and touched only a test assertion in a file the plan already scoped for modification. No scope creep, no production-code change.

## Issues Encountered

- **Build requires `DATABASE_URL` even with `SKIP_ENV_VALIDATION=1`:** `next build` collects page data by evaluating `db/index.ts`, which throws when `DATABASE_URL` is unset. This is a pre-existing Phase 1 condition unrelated to email config — the build succeeds with the DB var set and no email vars, confirming D-02 (zero email config boots/builds). Not a new issue introduced by this plan.

## User Setup Required

None for local development (Mailpit is wired via docker-compose; no email vars required to run/test). Production email delivery (Gmail SMTP App Password or Resend) is a Phase 4 deployment concern documented in 04-RESEARCH.md "Prod Wiring" — deferred to the finalization/deploy plans.

## Next Phase Readiness

- The `sendEmail()` seam and the three templates (including `renderFinalizationEmail`) are ready for 04-02's `closePoll` + finalization-email loop — no new transport work needed there.
- The admin page already guards the invite block on `poll.status === 'closed'`, anticipating the finalize flow.
- Local Mailpit smoke test (create poll → send invite → submit with email) is the recommended end-of-phase human verification at http://localhost:8025.

---
*Phase: 04-email-finalization*
*Completed: 2026-07-02*

## Self-Check: PASSED

All 7 created source files and the SUMMARY exist on disk; all 3 task commits (d801deb, 805d9d9, d5e864c) are present in git history.

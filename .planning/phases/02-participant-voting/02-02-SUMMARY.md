---
phase: 02-participant-voting
plan: 02
subsystem: ui
tags: [drizzle, postgres, server-actions, onConflictDoUpdate, cookies, nanoid, zod, vitest, vercel, neon]

# Dependency graph
requires:
  - phase: 02-participant-voting
    provides: "02-01 — participants/votes schema, INSERT-only submitResponse, shared VoteForm (action/initial*/readOnly/editToken-parameterized), buildEditUrl, httpOnly edit cookie"
provides:
  - "getParticipantByEditToken / getVotesForParticipant participant-safe read helpers (token ownership + vote preload)"
  - "updateResponse server action: token-verified ownership, pollId cross-check, single onConflictDoUpdate atomic replace on votes_participant_option_unique"
  - "token-verified edit route /p/[participantUrlId]/edit/[editToken] with identical 404 for garbage vs valid-but-unknown tokens"
  - "same-device auto-load on the participant page (cookie -> preload -> updateResponse routing, no auto-submit)"
  - "Phase 2 live in production: Neon migration 0001 applied, merged code deployed and smoke-verified on Vercel"
affects: [03-results-aggregation, 04-email-and-close]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single onConflictDoUpdate({ target: [votes.participantId, votes.optionId], set: { state: sql`excluded.state` } }) as the entire edit write — no delete-then-insert, no interactive transaction (neon-http safe)"
    - "Participant re-derived from the server-validated editToken only, never a client-supplied participantId (VOTE-06 IDOR defense)"
    - "Identical notFound() surface for a malformed token and a valid-format-but-unknown token — no token-format oracle"
    - "Same-device cookie preload routes the participant page's VoteForm at updateResponse instead of submitResponse, so a re-submit UPDATES the existing participant instead of creating a duplicate"
    - "Environment-conditional Secure cookie flag (secure: process.env.NODE_ENV === 'production') so HTTPS-only cookies still round-trip in local HTTP dev"

key-files:
  created:
    - src/lib/actions/update-response.ts
    - src/lib/actions/update-response.test.ts
    - src/app/p/[participantUrlId]/edit/[editToken]/page.tsx
    - src/app/p/[participantUrlId]/edit/[editToken]/page.test.ts
  modified:
    - src/lib/db/queries.ts
    - src/app/p/[participantUrlId]/page.tsx
    - src/app/p/[participantUrlId]/page.test.ts
    - src/lib/actions/submit-response.ts
    - src/lib/actions/submit-response.test.ts

key-decisions:
  - "The Secure-cookie gap (found in production smoke test, not unit tests) was fixed by adding secure: process.env.NODE_ENV === 'production' to both submitResponse's and updateResponse's cookie writes, plus a regression assertion in submit-response.test.ts — see Deviations."
  - "Production deploy (Task 3) executed by the orchestrator: neonctl pooled connection string -> npm run db:migrate against Neon -> vercel --prod, migration applied strictly before the new code served traffic (RESEARCH Pitfall 6)."

patterns-established:
  - "Atomic single-statement upsert as the edit-write pattern, extending Phase 2's no-interactive-transaction rule from submitResponse's insert to updateResponse's upsert"
  - "Cookie-driven form routing: the same VoteForm component switches its target server action (submitResponse vs updateResponse) based on server-side cookie/token resolution, never client state"

requirements-completed: [VOTE-05, VOTE-06]

coverage:
  - id: D1
    description: "getParticipantByEditToken / getVotesForParticipant participant-safe read helpers added to queries.ts"
    verification:
      - kind: integration
        ref: "src/lib/actions/update-response.test.ts (helpers exercised via updateResponse ownership/idempotency tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "updateResponse: token-verified ownership, pollId cross-check, status guard, single onConflictDoUpdate atomic upsert (idempotent, no duplicate, no cross-participant write)"
    requirement: "VOTE-06"
    verification:
      - kind: integration
        ref: "src/lib/actions/update-response.test.ts (7 tests: valid update, idempotency, ownership isolation, missing/name-only token no-op, wrong-poll 404, closed-poll rejection, concurrency backstop)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Token-verified edit route /p/[participantUrlId]/edit/[editToken]: preload on valid token, identical 404 for garbage vs valid-but-unknown token, no admin_url_id/foreign-email leak, read-only on closed"
    requirement: "VOTE-05"
    verification:
      - kind: integration
        ref: "src/app/p/[participantUrlId]/edit/[editToken]/page.test.ts (5 tests: preload, identical-404 garbage vs unknown, no admin leak, closed read-only)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Same-device auto-load on the participant page: cookie resolves to a participant of this poll -> preloaded VoteForm pointed at updateResponse + notice, no auto-submit; absent/invalid cookie -> fresh submitResponse form"
    requirement: "VOTE-05"
    verification:
      - kind: integration
        ref: "src/app/p/[participantUrlId]/page.test.ts (extended: +6 tests for cookie preload / absent-cookie / no-leak / no-auto-submit)"
        status: pass
    human_judgment: false
  - id: D5
    description: "lfg_edit cookie is HttpOnly AND Secure on both submitResponse and updateResponse writes (Security Domain V3) — fixed mid-plan after the production smoke test caught the missing Secure flag"
    verification:
      - kind: e2e
        ref: "Playwright live smoke test on https://looking-for-group-eight.vercel.app: DevTools cookie inspection confirmed httpOnly=true, secure=true after f76303b"
        status: pass
    human_judgment: false
  - id: D6
    description: "Neon production migration (0001: participants + votes + votes_participant_option_unique) applied before Phase 2 code served traffic; Phase 2 deployed and live-smoke-verified on Vercel production with no regression to Phase 1 polls"
    verification:
      - kind: e2e
        ref: "Playwright live smoke test on https://looking-for-group-eight.vercel.app: 9/9 pass (create poll -> vote submit -> /thanks -> edit link preload -> edit save -> same-device auto-load -> single-row update verified in prod DB -> Phase 1 poll still renders)"
        status: pass
      - kind: other
        ref: "Neon prod introspection: tables options/participants/polls/votes present; migration hashes match local (0000 817480f15cba, 0001 8137062fda84); votes_participant_option_unique present"
        status: pass
    human_judgment: false

# Metrics
duration: unspecified (executor-reported; code tasks + orchestrator-run deploy)
completed: 2026-07-01
status: complete
---

# Phase 2 Plan 02: Participant Return-and-Edit + Production Deploy Summary

**Token-verified updateResponse upsert (onConflictDoUpdate on votes_participant_option_unique), an edit-link route and same-device auto-load that route re-submits through it instead of duplicating a participant, and the blocking Neon migration + Vercel production deploy that puts all of Phase 2 live.**

## Performance

- **Duration:** not separately timed by this executor run (code tasks completed in a prior session; this run only produces tracking artifacts)
- **Completed:** 2026-07-01
- **Tasks:** 3 (2 code tasks + 1 blocking production-deploy checkpoint)
- **Files modified/created:** 9 (5 source, 2 test-extended, 2 further touched by the cookie fix)

## Accomplishments

- Added `getParticipantByEditToken` and `getVotesForParticipant` participant-safe read helpers (explicit column lists, never leaking `editToken` or another participant's row) and implemented `updateResponse`: re-derives the participant strictly from the server-validated edit token (never a client-supplied `participantId`), cross-checks `participant.pollId === poll.id`, enforces the `poll.status === 'open'` guard, and persists the entire vote-row set via a single `onConflictDoUpdate` targeting `votes_participant_option_unique` — no delete-then-insert, no interactive transaction. 7 DB-backed tests cover ownership isolation (VOTE-06), idempotency (VOTE-05), wrong-poll 404, the status guard, and a concurrency backstop (two concurrent opposite-selection updates resolve to one complete last-write-wins set, never a blend).
- Built the token-verified edit route `/p/[participantUrlId]/edit/[editToken]`: unconditional preload of the participant's stored response reached only via their own token, identical `notFound()` for a garbage token and a well-formed-but-unknown token (no token-format oracle), read-only rendering when the poll is closed, and no `admin_url_id`/foreign-email leak. Extended the participant page with same-device auto-load: reads the `lfg_edit_<participantUrlId>` cookie, resolves it via `getParticipantByEditToken`, and when valid for this poll, preloads the prior response and points the shared `VoteForm` at `updateResponse` with a "Showing your previous response" notice — never auto-submitting. Absent/invalid cookie falls back to the fresh `submitResponse` form from 02-01. 15 further DB-backed tests added across the edit route and the participant page.
- **Deviation caught by the production smoke test, not by unit tests:** the `lfg_edit` cookie was `HttpOnly` + `SameSite=Lax` but missing `Secure`, which the plan's Task 3 done-criteria and Security Domain V3 require under Vercel HTTPS. Fixed by setting `secure: process.env.NODE_ENV === "production"` on both `submitResponse`'s and `updateResponse`'s cookie writes, with a regression assertion added to `submit-response.test.ts`. Environment-conditional so local HTTP dev auto-load is unaffected.
- Shipped Phase 2 to production: applied the `drizzle/0001` migration (participants + votes + `votes_participant_option_unique`) to Neon via the pooled connection string **before** the merged Phase 2 code served traffic (RESEARCH Pitfall 6), then deployed to Vercel production (`https://looking-for-group-eight.vercel.app`). A live Playwright smoke test ran the full round trip — poll create, vote submit (no 500, lands on `/thanks`), edit-link preload and save, same-device auto-load ("Showing your previous response") — 9/9 pass after the cookie fix, including confirming the `lfg_edit` cookie is both `httpOnly` and `secure` on the HTTPS origin. Direct prod-DB inspection confirmed an edit produces exactly one participant row with updated vote rows (no duplicate participant), and a pre-existing Phase 1 poll still renders with no regression.

## Task Commits

1. **Task 1: read helpers + updateResponse (token ownership + atomic upsert, TDD)** - `9382d0b` (feat)
2. **Task 2: edit route + same-device auto-load** - `5b9093a` (feat)
3. **Task 3 fix: Secure cookie flag (smoke-test finding, applied during the production deploy checkpoint)** - `f76303b` (fix)
3. **Task 3: Neon production migration + Vercel redeploy + live smoke verify** - performed against production infrastructure (Neon `round-smoke-14801672`/`neondb`, Vercel `looking-for-group-eight`); no additional repo commit — verified via prod DB introspection + Playwright live smoke test (9/9 pass)

**Plan metadata:** _this commit_ (docs: complete plan)

## Files Created/Modified

- `src/lib/db/queries.ts` - added `getParticipantByEditToken` (exact-token ownership lookup, participant-safe columns) and `getVotesForParticipant` (Record<optionId,state> preload)
- `src/lib/actions/update-response.ts` - `updateResponse` server action: token re-derivation, pollId cross-check, status guard, single atomic `onConflictDoUpdate` upsert, cookie re-set (with the Secure fix), redirect to `/thanks`
- `src/lib/actions/update-response.test.ts` - 7 DB-backed tests (ownership, idempotency, wrong-poll 404, status guard, concurrency backstop)
- `src/app/p/[participantUrlId]/edit/[editToken]/page.tsx` - token-verified edit RSC (preload, identical 404 hygiene, read-only on closed, no admin leak)
- `src/app/p/[participantUrlId]/edit/[editToken]/page.test.ts` - 5 DB-backed tests for the edit route
- `src/app/p/[participantUrlId]/page.tsx` - added same-device cookie preload -> `updateResponse` routing with no-auto-submit notice
- `src/app/p/[participantUrlId]/page.test.ts` - extended with 6 tests for cookie preload / absent-cookie / no-leak / no-auto-submit
- `src/lib/actions/submit-response.ts` - added `secure: process.env.NODE_ENV === "production"` to the cookie write (deviation fix)
- `src/lib/actions/submit-response.test.ts` - added a regression assertion for the Secure flag (deviation fix)

## Decisions Made

- The onConflictDoUpdate target exactly matches `votes_participant_option_unique` (`[votes.participantId, votes.optionId]`), and the upsert is the entire write — extending 02-01's no-interactive-transaction rule to the edit path.
- `updateResponse` re-derives the participant exclusively from the server-validated `editToken`; a client-supplied `participantId` is never trusted (VOTE-06's core IDOR defense).
- The edit route and the same-device path share `getParticipantByEditToken` + `getVotesForParticipant` and reuse the 02-01 `VoteForm` component verbatim (parameterized `action`/`editToken`/`initial*`/`readOnly`/`heading`), avoiding a forked component.
- The Secure-cookie omission was treated as a plan-scoped bug fix (Rule 1) rather than a new task, since Task 3's own done-criteria already required a Secure cookie under HTTPS — the unit tests just hadn't asserted it.
- Production deploy sequencing followed the plan's explicit ordering: only run the Neon migration + redeploy after both 02-01 and 02-02 code was merged, so prod was never left half-migrated mid-phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing Secure flag on the lfg_edit cookie**
- **Found during:** Task 3 (production deploy live smoke test)
- **Issue:** The `lfg_edit_<participantUrlId>` cookie was set with `httpOnly: true` and `sameSite: "lax"` but no `secure` flag, so it was not restricted to HTTPS in production — violating the plan's Task 3 done-criteria and Security Domain V3, which require the cookie to be Secure under Vercel HTTPS. The gap slipped past unit tests because the original cookie assertions only checked `httpOnly`.
- **Fix:** Added `secure: process.env.NODE_ENV === "production"` to the cookie-setting call in both `submitResponse` and `updateResponse`, so the cookie is Secure in production while still round-tripping over local HTTP dev. Added a regression assertion in `submit-response.test.ts`.
- **Files modified:** `src/lib/actions/submit-response.ts`, `src/lib/actions/submit-response.test.ts`, `src/lib/actions/update-response.ts`
- **Verification:** Re-ran the full local test suite (green); confirmed live in production via Playwright DevTools cookie inspection (`httpOnly=true`, `secure=true`) on the HTTPS origin after redeploy.
- **Commit:** `f76303b`

---

**Total deviations:** 1 auto-fixed (1 bug fix, cookie security hardening)
**Impact on plan:** Necessary for correctness/security per the plan's own Task 3 done-criteria; no scope creep — it closes a gap the plan already specified but the original tests didn't cover.

## Issues Encountered

None beyond the Secure-cookie gap documented above, which was caught and fixed within the same production-deploy checkpoint before final human approval.

## User Setup Required

None - no new external service configuration required for this plan. The Neon and Vercel infrastructure used for the deploy was already provisioned in Phase 1; this plan applied the additive `0001` migration and redeployed the merged Phase 2 code to the same production project.

## Next Phase Readiness

- Phase 2 is fully complete and live in production: VOTE-01, 02, 03, 05, 06, 07 are all delivered and verified (VOTE-04 remains Phase 4 scope).
- `votes(poll_id)` index and the full `participants`/`votes` schema are in place in both local Docker Postgres and Neon production, ready for Phase 3's results aggregation to read from the same tables with no further migration.
- The `editToken`-based ownership pattern (`getParticipantByEditToken` + pollId cross-check) and the atomic `onConflictDoUpdate` upsert pattern are established precedents Phase 3/4 can reuse if any further participant-scoped writes are needed.
- No known stubs or deferred gaps block Phase 3 start.

## Verification Summary

- Local full suite: 81/81 tests green (`DATABASE_URL` exported against the local Docker Postgres `lfg-db-1` container).
- `next build`, `npx tsc --noEmit`, and `npm run lint` all clean.
- Production: live submit -> `/thanks` -> edit -> save -> same-device auto-load round trip verified via Playwright against `https://looking-for-group-eight.vercel.app`, 9/9 checks pass; `lfg_edit` cookie confirmed `HttpOnly` + `Secure`; a pre-existing Phase 1 poll still renders (no migration regression); prod DB confirmed a single participant row is updated on edit (no duplicate).

## Self-Check: PASSED

All 4 created files exist on disk (`src/lib/actions/update-response.ts`, `src/lib/actions/update-response.test.ts`, `src/app/p/[participantUrlId]/edit/[editToken]/page.tsx`, `src/app/p/[participantUrlId]/edit/[editToken]/page.test.ts`); all 3 code commits (`9382d0b`, `5b9093a`, `f76303b`) are present in git history.

---
*Phase: 02-participant-voting*
*Completed: 2026-07-01*

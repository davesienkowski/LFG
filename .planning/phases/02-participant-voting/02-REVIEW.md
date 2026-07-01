---
phase: 02-participant-voting
type: code-review
status: issues-advisory
reviewed_range: f34ec09..HEAD
blockers: 0
date: 2026-07-01
---

# Phase 2 (Participant Voting) — Code Review

Advisory review run at phase completion (code-review capability). Phase is already
verified (`02-VERIFICATION.md` status: passed) and **deployed to production**, so every
finding below is a follow-up, not a gate blocker. **No BLOCKERs.** All six requested
security/correctness invariants were confirmed holding in source (admin_url_id never
leaks; edit route re-derivation + identical 404 no-oracle; atomic upsert target matches
`votes_participant_option_unique`; cookie httpOnly+lax+secure-in-prod and never trusted
as authority; gap-fill + string dates; Zod + server-side status guard).

## Findings (ranked)

### 1. [MEDIUM] `src/lib/env.ts` validation is dead code — "fail loudly" env guarantee never runs
`createEnv({...})` is never imported anywhere (verified `grep -rln "lib/env" src/` → 0),
so the documented startup failure on missing `DATABASE_URL` / `NEXT_PUBLIC_BASE_URL` never
executes. Impacts the Phase 2 `/thanks` surface: the bearer-credential edit URL is built via
`resolveBaseUrl()` (`src/lib/urls.ts:6-14`), which silently falls back to the request
`Host`/`X-Forwarded-Proto` headers when `NEXT_PUBLIC_BASE_URL` is unset. Prod currently has
the var set (smoke-test edit links resolved correctly), so this is hardening against a
self-host redeploy that forgets it — not a live exploit. **Fix:** import `env` from an
always-executed entry point (`instrumentation.ts` or root `layout.tsx`), or delete the dead
module. (Pre-existing from Phase 1; surfaced here because Phase 2's edit link depends on it.)

### 2. [MEDIUM] Impure `setState` updater in `AvailabilityGrid.cycleCell` (`availability-grid.tsx:87-94`)
`setAnnouncement(...)` is called inside the `setCellState` updater. React updaters must be
pure; Strict Mode double-invokes them. Idempotent today (same string), but a latent
concurrent-render risk on the accessibility `aria-live` announcement. **Fix:** compute `next`
and call `setAnnouncement` outside the updater. (New in Phase 2.)

### 3. [MEDIUM] Same-device auto-load has no "not you?" escape hatch (`p/[participantUrlId]/page.tsx`)
The `lfg_edit_<participantUrlId>` cookie is per-poll, not per-person. Two people on one shared
device answering the same poll: the 2nd sees the 1st's prefilled name/votes and a submit
UPDATES (overwrites) the 1st's row with no confirmation. Residual risk of an accepted design
decision (D-05: same-device re-submit must UPDATE, not duplicate). **Fix (follow-up):** add a
"Not you? Start a new response" affordance that clears the cookie / routes to `submitResponse`.

### 4. [LOW-MEDIUM] Unchecked `as VoteState` cast on DB-read vote state (defense-in-depth)
`votes.state` is untyped `text` (no DB CHECK — documented tradeoff). Pages cast
`getVotesForParticipant()` result to `VoteState` with no runtime guard; a future non-Zod write
path persisting a bad literal would make `STATE_META[state]` undefined → `AvailabilityGrid`
throws on render. Currently unreachable (Zod guards both write paths). **Fix:** `const meta =
STATE_META[state] ?? STATE_META.no;` and/or narrow in `getVotesForParticipant`.

### 5. [LOW] Edit cookie set before votes insert commits (submitResponse only)
Cookie is set after the participant INSERT but before the batched votes INSERT; with no
interactive transaction (neon-http), a votes-insert failure leaves a durable participant + edit
cookie with zero votes. Self-heals (next load routes through `updateResponse`). **Fix
(optional):** move `cookies().set(...)` after the votes insert succeeds.

### 6. [LOW] No `.max()` on the `votes` array in either action's Zod schema
Unbounded hidden-input array → unnecessary parse/alloc (foreign optionIds already ignored, so
not a correctness bug). **Fix:** `.max(500)` (or a multiple of expected option count).

### 7. [INFO] "Clear" bulk button == "Set all Not available" (both `setAll("no")`)
Intentional/tested UX redundancy. Consider making "Clear" on the edit surface reset to
`initialVotes` instead.

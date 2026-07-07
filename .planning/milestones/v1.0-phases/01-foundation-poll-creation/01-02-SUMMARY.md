---
phase: 01-foundation-poll-creation
plan: 02
subsystem: poll-creation
tags: [nextjs, server-actions, zod, drizzle, useActionState, rsc, nanoid, clipboard, vitest, jsdom, testing-library]

# Dependency graph
requires:
  - "01-01: polls/options schema, dual-driver db client, generateToken(), formatDateOnly/formatDateWithTime, Docker Postgres dev stack"
provides:
  - "createPoll server action: Zod validation, app-layer dedupe, two independent tokens, poll+options insert, redirect to admin"
  - "Reusable read helpers (queries.ts): getPollByAdminUrlId, getPollByParticipantUrlId (participant-safe), getOptionsForPoll (chronological, NULLS FIRST)"
  - "Creation form at / (useActionState, dynamic date rows, inline validation, past-date warning, pending state)"
  - "Admin page /a/[adminUrlId] rendering both share links with Keep-private badge + warning (UI-P1)"
  - "Participant shell /p/[participantUrlId] with no adminUrlId in payload (P2)"
  - "Global 404 not-found.tsx; copy-to-clipboard button (success only on resolved write, UI-P2)"
  - "Pure absolute-URL builders (urls.ts) with NEXT_PUBLIC_BASE_URL + host-header fallback"
  - "Component test infra: jsdom + @testing-library for .test.tsx"
affects: [01-03 Vercel/Neon deploy, phase-2 voting (participant route + options), phase-3 dashboard (admin route)]

# Tech tracking
tech-stack:
  added:
    - "jsdom@25.0.1, @testing-library/react@16.3.2, @testing-library/dom@10.4.1 (devDeps — component test infra)"
  patterns:
    - "Server action validation: trim-before-min title, flatten().fieldErrors, lift array-element issue to the 'dates' field"
    - "Two independent generateToken() calls for participant/admin tokens; collision retry on Postgres 23505 (no interactive transaction — neon-http prod safe)"
    - "Chronological option order pinned by ASC NULLS FIRST so date-only (whole-day) precedes timed on the same day, matching insert-time position"
    - "RSC unit testing via await Page({params}) -> renderToStaticMarkup, mocking next/navigation + next/headers"
    - "Participant-safe column projection (omit adminUrlId at the query layer) as the P2 enforcement point"

key-files:
  created:
    - "src/lib/actions/create-poll.ts - createPoll server action"
    - "src/lib/actions/create-poll.test.ts - 12 tests vs live Postgres"
    - "src/lib/db/queries.ts - admin/participant/options read helpers"
    - "src/components/poll-create-form.tsx - client creation form (useActionState)"
    - "src/components/date-row.tsx - native date+time row with past-date warning"
    - "src/components/copy-link-button.tsx - clipboard button (UI-P2)"
    - "src/components/copy-link-button.test.tsx - jsdom UI-P2 tests"
    - "src/components/poll-summary.tsx - shared description/location render"
    - "src/lib/urls.ts - pure absolute-URL builders"
    - "src/app/a/[adminUrlId]/page.tsx - admin page (both links, Keep-private)"
    - "src/app/a/[adminUrlId]/page.test.ts - admin render + 404 tests"
    - "src/app/p/[participantUrlId]/page.tsx - participant shell"
    - "src/app/p/[participantUrlId]/page.test.ts - P2 leak + 404 tests"
    - "src/app/not-found.tsx - 404 page"
  modified:
    - "src/app/page.tsx - replaced scaffold with the creation-form RSC shell"
    - "vitest.config.ts - include .test.tsx for component tests"
    - "package.json, package-lock.json - jsdom + testing-library devDeps"

key-decisions:
  - "Order options ASC NULLS FIRST (not Postgres default NULLS LAST) so a date-only option sorts before a timed one on the same day, keeping stored position and query order in agreement"
  - "Normalize Postgres 'HH:MM:SS' start_time to 'HH:MM' at the page call site rather than modifying the locked 01-01 formatTimeOnly helper"
  - "No interactive DB transaction in createPoll: app-layer dedupe makes the options insert collision-free, so only the poll insert needs the 23505 retry — keeps the action neon-http (production) safe"
  - "Kept the base-nova/neutral shadcn theme from 01-01 rather than churning 5 components to new-york/zinc (cosmetic; per environment note, do not block the slice)"
  - "Installed jsdom + @testing-library to satisfy the mandatory UI-P2 component test (no component test infra existed in 01-01)"

requirements-completed: [POLL-01, POLL-02, POLL-03, POLL-04, LINK-01, LINK-02, LINK-03, PLAT-04]

# Metrics
duration: 14min
completed: 2026-06-30
status: complete
---

# Phase 1 Plan 02: createPoll, Creation Form, Admin/Participant Pages Summary

**The first full vertical slice: a validated `createPoll` server action mints two independent unguessable tokens and persists poll+options, the `/` form (useActionState) drives it, and the organizer lands on `/a/[adminUrlId]` showing both share links — with the participant shell leaking no admin token and dates that never drift across timezones.**

## Performance

- **Duration:** ~14 min
- **Completed:** 2026-06-30
- **Tasks:** 3
- **Files:** 14 created, 4 modified

## Accomplishments
- Built `createPoll` test-first: Zod validation (trim-before-min title, caps 200/2000/200, dates min(1)+regex), app-layer dedupe, two independent `generateToken()` calls, poll+options insert with chronological position, and redirect to the admin page — 12 tests passing against the live Docker Postgres.
- Delivered the `/` creation form exactly per UI-SPEC Surface 1: locked field order/copy, dynamic add/remove date rows with focus management, title counter at 180+, inline `role="alert"` errors with `aria-describedby`, non-blocking amber past-date warning, and a full pending/disabled state.
- Built the admin page (both share links, amber-bordered admin card with the "Keep private" badge AND the do-not-share warning), the participant shell (participant-safe query omitting `adminUrlId`, voting placeholder), the global 404, and the copy-link button (success only on a resolved clipboard write).
- Proved all five mandatory prohibition tests pass (P1/P2/P3/UI-P1/UI-P2); full suite is 34/34 green and `next build` + `tsc --noEmit` are clean.

## Task Commits

1. **Task 1: createPoll server action (test-first) + read helpers** - `809cb3b` (feat)
2. **Task 2: creation form at / wired to createPoll** - `6a20d3c` (feat)
3. **Task 3: admin page, participant shell, 404, copy-link button** - `fd08abd` (feat)

## Prohibition Test Coverage (MANDATORY)

| Prohibition | Test | Status |
|-------------|------|--------|
| P1 — admin token not derivable from participant | `create-poll.test.ts` "two independent 21-char tokens" (+ 01-01 `tokens.test.ts`) | pass |
| P2 — no adminUrlId in any participant surface | `p/[participantUrlId]/page.test.ts` "NEVER exposes admin_url_id" + "query result has no adminUrlId key" | pass |
| P3 — no `new Date()` on date-only input | render via `formatDateWithTime`; grep guard over src/app/a, src/app/p, src/components (+ 01-01 dual-TZ `format-date.test.ts`) | pass |
| UI-P1 — admin link always shows Keep-private badge + warning | `a/[adminUrlId]/page.test.ts` "renders ... Keep private badge, and the warning copy" | pass |
| UI-P2 — no "Copied!" when clipboard write rejects | `copy-link-button.test.tsx` "does NOT show 'Copied!' when the clipboard write rejects" | pass |

## Decisions Made
- **Option ordering (NULLS FIRST):** Postgres `ORDER BY ... ASC` defaults to NULLS LAST, which contradicted the insert-time `position` (date-only first). Pinned `getOptionsForPoll` to `start_time ASC NULLS FIRST` so a whole-day (date-only) option precedes a timed one on the same day, and stored order matches query order.
- **Time normalization at the edge:** Postgres returns `start_time` as `'HH:MM:SS'`; the locked 01-01 `formatTimeOnly` expects `'HH:MM'`. Sliced to 5 chars at the page call site instead of altering the tested helper.
- **No interactive transaction:** `db.transaction` is unsupported on neon-http (production). Since app-layer dedupe makes the options insert collision-free, only the poll insert carries the 23505 retry loop — keeping `createPoll` identical across dev (node-postgres) and prod (neon-http).
- **Theme:** Kept base-nova/neutral from 01-01; reconciling to new-york/zinc would churn 5 installed components for a purely cosmetic gain the environment note flagged as non-blocking.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Option ordering disagreed between insert position and page query**
- **Found during:** Task 1
- **Issue:** `createPoll` assigned `position` with date-only (null time) first, but `getOptionsForPoll` used plain `asc(startTime)` which Postgres evaluates NULLS LAST — so the admin/participant pages would render same-day options in a different order than stored.
- **Fix:** `getOptionsForPoll` now orders `start_time ASC NULLS FIRST` (raw `sql`), matching the insert-time sort.
- **Files modified:** src/lib/db/queries.ts
- **Verification:** `create-poll.test.ts` mixed date+time ordering assertion passes.
- **Committed in:** 809cb3b

**2. [Rule 3 - Blocking] Postgres TIME serialized as 'HH:MM:SS', breaking the time formatter**
- **Found during:** Task 3
- **Issue:** `formatTimeOnly` (01-01) validates `/^\d{2}:\d{2}$/` and throws on the `'14:00:00'` Postgres returns, which would crash both pages on any timed option.
- **Fix:** Slice `startTime` to `'HH:MM'` at the admin/participant page call sites before passing to `formatDateWithTime` (avoids modifying the locked 01-01 helper).
- **Files modified:** src/app/a/[adminUrlId]/page.tsx, src/app/p/[participantUrlId]/page.tsx
- **Verification:** admin/participant render tests assert "Sunday, July 19 at 2:00 PM".
- **Committed in:** fd08abd

**3. [Rule 3 - Blocking] No component-test infrastructure for the mandatory UI-P2 test**
- **Found during:** Task 3
- **Issue:** The UI-P2 prohibition test renders a React client component, but 01-01 set up only a node-env vitest (no jsdom, no Testing Library, include limited to `.test.ts`).
- **Fix:** Installed `jsdom`, `@testing-library/react`, `@testing-library/dom` (devDeps); widened the vitest `include` to `.test.{ts,tsx}`; the component test opts into jsdom via a per-file `// @vitest-environment jsdom` pragma (DB tests stay node).
- **Files modified:** package.json, package-lock.json, vitest.config.ts
- **Verification:** `copy-link-button.test.tsx` runs under jsdom; full suite 34/34.
- **Committed in:** fd08abd

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking). No architectural changes; no scope creep.
**Impact on plan:** All necessary for correctness (ordering, time rendering) and for satisfying the mandatory UI-P2 test.

## Issues Encountered
- **shadcn theme (carried from 01-01):** components remain base-nova/neutral rather than the UI-SPEC's new-york/zinc. All required components render correctly; reconciliation deferred as cosmetic per the environment note. Flag for a later polish pass if the exact preset is required.
- **Pre-existing moderate npm advisories:** transitive `esbuild`/`postcss` moderates (via drizzle-kit and tailwind tooling) surfaced during the devDep install; not introduced by the new test packages and dev/build-time only (threat register T-01-SC disposition: accept).

## Known Stubs
- The participant route is an intentional shell — it renders a resolved poll plus a "Voting isn't available yet" placeholder. Voting UI is explicitly Phase 2 (SPEC boundary). Not a defect; documented in the plan and UI-SPEC Surface 3.

## Threat Flags
None — no new trust boundaries beyond the plan's threat model. createPoll input is Zod-validated, the participant route omits `adminUrlId` at the query layer, token lookups 404 on miss, and all interpolated strings are React-escaped.

## User Setup Required
None for local dev — `docker compose up` (db) is sufficient. Vercel/Neon credentials are required only for the 01-03 cloud deploy.

## Next Phase Readiness
- The create -> admin flow is proven locally against Docker Postgres; the participant route resolves polls without leaking the admin token.
- 01-03 (Vercel/Neon deploy) can proceed: the action is neon-http-safe (no interactive transactions), URLs fall back to the host header when `NEXT_PUBLIC_BASE_URL` is unset, and the schema is unchanged.
- Phase 2 can build voting on `/p/[participantUrlId]` and the `getOptionsForPoll`/`getPollByParticipantUrlId` helpers.

## Self-Check: PASSED

All 14 created key files exist on disk; all 3 task commits (809cb3b, 6a20d3c, fd08abd) are present in git history. Full test suite 34/34; `next build` and `tsc --noEmit` clean.

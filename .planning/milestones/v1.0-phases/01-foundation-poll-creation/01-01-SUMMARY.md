---
phase: 01-foundation-poll-creation
plan: 01
subsystem: infra
tags: [nextjs, drizzle, postgres, docker, nanoid, zod, shadcn, vitest, timezone]

# Dependency graph
requires: []
provides:
  - "Next.js 16 App Router scaffold (TS, Tailwind v4, shadcn/ui) at locked versions"
  - "Dual-driver Drizzle client (node-postgres dev / neon-http prod) selected by NODE_ENV"
  - "polls + options schema with DATE-as-string and options_dedup UNIQUE NULLS NOT DISTINCT, migrated into live Postgres"
  - "generateToken() = nanoid(21) with no derivation (participant vs admin independence)"
  - "Timezone-safe date formatter (formatDateOnly / formatDateWithTime) proven under UTC+14 and UTC-12"
  - "Two-service Docker Desktop dev stack (db + web) reachable at localhost:3000"
  - "Typed env (@t3-oss/env-nextjs), drizzle-kit migration workflow, Vitest with @/ alias"
affects: [01-02 createPoll + pages, 01-03 Vercel/Neon deploy, phase-2 voting, phase-3 dashboard]

# Tech tracking
tech-stack:
  added:
    - "next@16.2.9, react@19.2.7, react-dom@19.2.7, typescript@6.0.3, tailwindcss@4.3.2"
    - "drizzle-orm@0.45.2, drizzle-kit@0.31.10, @neondatabase/serverless@1.1.0, pg@8.22.0, @types/pg@8.20.0"
    - "nanoid@5.1.16, zod@4.4.3, @t3-oss/env-nextjs@0.13.11, vitest@3.2.6, dotenv@17.2.3"
    - "shadcn/ui (button, input, label, textarea, card), lucide-react, @base-ui/react"
  patterns:
    - "Env-switched single Drizzle client typed as one concrete driver type (avoids union overload collapse)"
    - "DATE stored/returned as YYYY-MM-DD string; never new Date() on date-only input"
    - "NULLS NOT DISTINCT composite unique for date-only dedupe at the DB layer"
    - "Schema migrated into the live DB and verified via psql before asserting any read/write (schema-push gate)"

key-files:
  created:
    - "src/lib/db/index.ts - dual-driver Drizzle client"
    - "src/lib/db/schema.ts - polls + options tables + inferred types"
    - "src/lib/tokens.ts - generateToken() nanoid(21) wrapper"
    - "src/lib/format-date.ts - timezone-safe date/time formatters"
    - "src/lib/format-date.test.ts - dual-TZ date test"
    - "src/lib/tokens.test.ts - token independence/entropy test"
    - "src/lib/env.ts - typed env (DATABASE_URL, NEXT_PUBLIC_BASE_URL)"
    - "drizzle.config.ts, docker-compose.yml, Dockerfile.dev, .dockerignore, .env.example, vitest.config.ts"
    - "src/app/health/{page.tsx,actions.ts,skeleton-check.tsx} - walking-skeleton probe"
    - "drizzle/0000_amusing_tarot.sql - generated migration"
  modified:
    - ".gitignore - merged Next.js scaffold ignores onto existing entries"
    - "src/app/layout.tsx - Inter via next/font, app metadata"

key-decisions:
  - "Typed the dual-driver db export as a single NodePgDatabase type (cast the neon-http branch) because the union type collapsed Drizzle's overloaded query signatures and broke every call at compile time"
  - "Added @/ path alias to vitest.config so tests can import app modules the way the Next bundler resolves them"
  - "Added a token independence test (P1 prohibition is node-test-verified) though no test file was named in the plan"

patterns-established:
  - "Single env-switched Drizzle client: node-postgres in dev, neon-http in prod, one schema"
  - "Timezone-immune date-only formatting via explicit UTC component construction + timeZone:UTC formatting"
  - "Schema-push gate: generate + migrate into live Docker Postgres, verify with psql, before asserting reads/writes"

requirements-completed: [PLAT-01, PLAT-03, PLAT-04, LINK-02, LINK-03, POLL-03, POLL-04]

coverage:
  - id: D1
    description: "Next.js 16 + Drizzle + Dockerized two-service dev stack scaffolded at locked versions; docker compose up serves the app at localhost:3000"
    requirement: "PLAT-01"
    verification:
      - kind: integration
        ref: "docker compose up --build; curl -sf http://localhost:3000/health (HTTP 200)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Dual-driver Drizzle client selects neon-http in production and node-postgres otherwise"
    requirement: "PLAT-03"
    verification:
      - kind: integration
        ref: "grep node-postgres/neon-http src/lib/db/index.ts; tsc --noEmit clean; live node-postgres round-trip against Docker Postgres"
        status: pass
    human_judgment: false
  - id: D3
    description: "polls + options tables physically migrated into live Docker Postgres with options_dedup UNIQUE NULLS NOT DISTINCT and poll_id index"
    requirement: "POLL-03"
    verification:
      - kind: integration
        ref: "drizzle-kit generate+migrate; psql \\dt shows polls/options; \\d options shows NULLS NOT DISTINCT"
        status: pass
    human_judgment: false
  - id: D4
    description: "options schema supports date-only and date+time (DATE mode:string + nullable TIME)"
    requirement: "POLL-04"
    verification:
      - kind: integration
        ref: "drizzle/0000_amusing_tarot.sql (date NOT NULL, start_time time nullable); skeleton insert of date-only option"
        status: pass
    human_judgment: false
  - id: D5
    description: "generateToken() emits 21-char URL-safe crypto-random IDs; participant and admin tokens are independent (not derivable)"
    requirement: "LINK-02"
    verification:
      - kind: unit
        ref: "src/lib/tokens.test.ts#two independent calls are never equal"
        status: pass
    human_judgment: false
  - id: D6
    description: "Identifiers are non-enumerable nanoid(21) (>=126-bit entropy), unique across many calls"
    requirement: "LINK-03"
    verification:
      - kind: unit
        ref: "src/lib/tokens.test.ts#produces unique values across many calls"
        status: pass
    human_judgment: false
  - id: D7
    description: "Date-only value renders the same calendar day under UTC+14 and UTC-12 (no new Date() on date-only input)"
    requirement: "PLAT-04"
    verification:
      - kind: unit
        ref: "TZ=Pacific/Kiritimati vitest + TZ=Etc/GMT+12 vitest run src/lib/format-date.test.ts (identical pass)"
        status: pass
    human_judgment: false
  - id: D8
    description: "Walking-skeleton /health performs a real DB write + read against Docker Postgres and renders the live result in the browser"
    requirement: "PLAT-01"
    verification:
      - kind: e2e
        ref: "RSC reads polls count (rendered 'polls currently in the database: 4'); runSkeletonCheck write+read round-trip verified against live DB"
        status: pass
    human_judgment: true
    rationale: "Button-click round-trip in the browser is a human-verify deliverable (UI interaction); automated proof covers the underlying write/read path but the in-browser click is end-of-phase human verification"

# Metrics
duration: 13min
completed: 2026-06-30
status: complete
---

# Phase 1 Plan 01: Foundation & Walking Skeleton Summary

**Next.js 16 + Drizzle dual-driver client + polls/options schema migrated into live Docker Postgres, with nanoid token + timezone-safe date helpers, proven end-to-end via a /health write+read round-trip in Docker Desktop.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-06-30T17:15:17Z
- **Completed:** 2026-06-30T17:28:21Z
- **Tasks:** 3
- **Files modified:** ~46 (scaffold + handwritten)

## Accomplishments
- Scaffolded Next.js 16 (App Router, TS, Tailwind v4, shadcn/ui) at all locked versions without clobbering existing `.planning/.claude/.git`
- Wrote the dual-driver Drizzle client and the `polls` + `options` schema, then migrated it into the live Docker Postgres and verified the tables + `NULLS NOT DISTINCT` constraint via psql
- Implemented `generateToken()` (nanoid(21), no derivation) and timezone-safe date formatters; both proven by tests (token independence; identical render under UTC+14 and UTC-12)
- Stood up the two-service Docker Desktop dev stack and proved the full stack with a `/health` route that performs a real DB write + read rendered in the browser

## Task Commits

1. **Task 1: Scaffold Next.js + deps + Dockerized dev env + tooling** - `d79fb89` (feat)
2. **Task 2: Schema + migrate into live Postgres + token + TZ-safe date helpers** - `d57e2b7` (feat)
3. **Task 3: Walking-skeleton DB round-trip in Docker Desktop** - `0b1e44e` (feat)

**Plan metadata:** (final docs commit — see git log)

## Files Created/Modified
- `src/lib/db/index.ts` - Env-switched Drizzle client (node-postgres dev / neon-http prod)
- `src/lib/db/schema.ts` - polls + options tables, DATE-as-string, options_dedup NULLS NOT DISTINCT, poll_id index, inferred types
- `src/lib/tokens.ts` + `src/lib/tokens.test.ts` - nanoid(21) wrapper + independence/entropy tests
- `src/lib/format-date.ts` + `src/lib/format-date.test.ts` - timezone-immune date/time formatters + dual-TZ test
- `src/lib/env.ts` - typed env via @t3-oss/env-nextjs
- `drizzle.config.ts`, `drizzle/0000_amusing_tarot.sql` - migration config + generated SQL
- `docker-compose.yml`, `Dockerfile.dev`, `.dockerignore`, `.env.example` - Docker Desktop dev stack (secrets injected at runtime, never baked)
- `vitest.config.ts` - node env + `@/` alias
- `src/app/health/{page.tsx,actions.ts,skeleton-check.tsx}` - walking-skeleton probe
- `src/app/layout.tsx` - Inter font + metadata; `.gitignore` - merged scaffold ignores

## Decisions Made
- **Dual-driver type:** RESEARCH Pattern 1 suggested typing `db` as a union of both driver types, but that collapses Drizzle's overloaded `.values()`/`.select()` call signatures and fails compilation on every query. Typed the export as a single `NodePgDatabase<typeof schema>` and cast the neon-http production branch — runtime driver switch is unchanged, both imports remain.
- **Vitest `@/` alias:** Added `resolve.alias` so tests can import app modules via `@/` (matches tsconfig + Next bundler).
- **Token test added:** Prohibition P1 is specified as node-test-verified, so a `tokens.test.ts` was added even though the plan named no token test file.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dual-driver client union type broke all queries**
- **Found during:** Task 3 (typecheck before Docker build)
- **Issue:** `type DB = NodePgDatabase | NeonHttpDatabase` (per RESEARCH Pattern 1) collapsed the overloaded query-builder signatures; `db.insert(options).values(...)` failed with TS2554 "Expected 0 arguments".
- **Fix:** Typed `db` as a single `NodePgDatabase<typeof schema>` and cast the production neon-http branch; runtime NODE_ENV switch and both driver imports retained.
- **Files modified:** src/lib/db/index.ts
- **Verification:** `tsc --noEmit` clean; Task 1 verify still greps both `node-postgres` and `neon-http`.
- **Committed in:** 0b1e44e (Task 3 commit)

**2. [Rule 3 - Blocking] Vitest could not resolve the `@/` path alias**
- **Found during:** Task 3 (running the live round-trip check that imports the action)
- **Issue:** actions.ts imports `@/lib/db`; vitest had no alias mapping, so the test failed to collect.
- **Fix:** Added `resolve.alias` (`@` -> `./src`) to vitest.config.ts.
- **Files modified:** vitest.config.ts
- **Verification:** Round-trip test collected and passed against live DB.
- **Committed in:** 0b1e44e (Task 3 commit)

**3. [Rule 2 - Missing Critical] Added token independence test**
- **Found during:** Task 2
- **Issue:** Prohibition P1 (admin token not derivable) and threat T-01-02/T-01-03 (mitigate) are node-test-verified, but no token test file was listed in the plan.
- **Fix:** Added src/lib/tokens.test.ts asserting 21-char URL-safe output, uniqueness across 10k calls, and participant/admin independence.
- **Files modified:** src/lib/tokens.test.ts
- **Verification:** `vitest run` — 11 tests pass.
- **Committed in:** d57e2b7 (Task 2 commit)

**4. [Rule 2 - Security] Bumped vitest to patched 3.2.6**
- **Found during:** Task 1 (post-install audit)
- **Issue:** vitest 3.2.4 carried a critical advisory (GHSA-5xrq-8626-4rwp, vitest UI server arbitrary file read/exec).
- **Fix:** Installed vitest@3.2.6 (patch), clearing the critical.
- **Files modified:** package.json, package-lock.json
- **Verification:** `npm audit` reports no critical.
- **Committed in:** d79fb89 (Task 1 commit)

---

**Total deviations:** 4 auto-fixed (2 blocking, 1 missing-critical test, 1 security patch)
**Impact on plan:** All necessary for compilation, verification, prohibition coverage, and security. No scope creep.

## Issues Encountered
- **shadcn defaults drift:** `npx shadcn@latest init --defaults` (the exact command the UI-SPEC prescribed) now produces the `base-nova` style with the `neutral` base color rather than the `new-york`/`zinc` the UI-SPEC anticipated — the CLI's defaults have evolved. All 5 required components installed correctly. Visual theming is owned by plan 01-02; flag for that plan if the new-york/zinc look is required (re-run `shadcn init` with explicit style/base-color, or adjust CSS variables).
- React serializes `{pollCount}` as a separate text node (HTML-comment separator), so a naive `grep "...: 4"` on the raw HTML misses the number; the value is present (`polls currently in the database: 4` after stripping comment markers). No code issue.

## Known Stubs
- `src/app/health/*` is a deliberate, documented diagnostic stub (hardcoded "Skeleton check" poll + fixed date string, no validation). It is the MVP walking-skeleton probe; the real validated createPoll + form lands in 01-02. Plan 01-03 already carries an edge-probe finding to remove/guard `/health` before the prod deploy.

## User Setup Required
None for local dev — `docker compose up` is self-contained. Vercel/Neon credentials are required only for the 01-03 cloud deploy (out of scope for this plan).

## Next Phase Readiness
- Schema, dual-driver client, token + date helpers, typed env, and the Docker Desktop dev stack are in place for 01-02 to build the real createPoll action, creation form, admin page, and participant shell.
- The `interfaces` contract in the plan (schema exports, `db`, `generateToken`, `formatDateOnly/formatDateWithTime`) is implemented and importable.
- Note for 01-02: shadcn theme is base-nova/neutral, not new-york/zinc — reconcile if the UI-SPEC look is strict.

## Self-Check: PASSED

All 18 created/modified key files exist on disk; all 3 task commits (d79fb89, d57e2b7, 0b1e44e) are present in git history.

---
*Phase: 01-foundation-poll-creation*
*Completed: 2026-06-30*

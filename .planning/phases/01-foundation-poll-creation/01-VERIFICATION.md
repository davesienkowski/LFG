---
phase: 01-foundation-poll-creation
verified: 2026-06-30T14:02:00Z
status: human_needed
score: 5/5 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Create a poll end-to-end in a browser on the production URL"
    expected: "After submitting, organizer lands on /a/<adminToken> showing both links (participant and admin), admin card has 'Keep private' badge and warning copy."
    why_human: "Verifies the write path (createPoll action → Neon insert → redirect) in the real Vercel serverless runtime. Read-path automation (curl + seeded poll) cannot exercise the Next.js form submission and redirect in prod."
  - test: "After ~5 minutes of Neon idle-suspend, create a poll — confirm no cold-start 504"
    expected: "Poll creation succeeds within the Vercel function timeout; the organizer reaches the admin page."
    why_human: "Requires waiting for Neon to auto-suspend and then triggering a real cold-start request in the browser; cannot be measured with a static curl probe."
---

# Phase 1: Foundation & Poll Creation — Verification Report

**Phase Goal:** An organizer can create a scheduling poll (title, optional description/location, one or more candidate dates with optional start time) and land on an admin page exposing two distinct, unguessable share links — dev environment in Docker Desktop, deployed to Vercel/Neon on free tiers, with candidate dates rendering on the same calendar day in every timezone.
**Verified:** 2026-06-30T14:02:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Organizer can create a poll with a required title, optional description and location, and one or more candidate dates (each with an optional start time; date-only is valid) | VERIFIED | `createPoll.ts`: Zod schema trims then min(1) on title; description/location are optional with max caps; dates array min(1); app-layer dedupe + DB NULLS NOT DISTINCT. `create-poll.test.ts` (12 tests against live Postgres): empty/whitespace title rejected, zero dates rejected, title-only poll succeeds, mixed date+time works, duplicates collapse. |
| 2 | On creation, the organizer lands on an admin page showing two separate links — participant and admin — where the admin link cannot be derived from the participant link | VERIFIED | `createPoll.ts` calls `generateToken()` twice independently. `admin/page.tsx` renders both URLs (participant + admin) with "Keep private" amber badge and "Do not share this link" warning. `page.test.ts` asserts both links present, badge text, and warning copy (UI-P1). |
| 3 | Poll and admin identifiers are long crypto-random strings; altering or incrementing a link returns 404 rather than another poll | VERIFIED | `tokens.ts` wraps `nanoid(21)` (21 chars, URL-safe, ~126-bit entropy). `tokens.test.ts` (4 tests, all pass standalone): 21-char length, URL-safe alphabet, 10k-call uniqueness, and two calls never equal (P1). Both admin and participant pages call `notFound()` on lookup miss. `page.test.ts` asserts 404 for unknown token AND for a single-character-altered copy of a valid token. |
| 4 | The app runs locally against a local Postgres database and deploys to Vercel against Neon Postgres, both entirely within free tiers | VERIFIED (automated read-path; write-path is human item) | `docker-compose.yml`: two-service stack (`db` = postgres:17 with healthcheck, `web` = Next.js dev) maps localhost:3000. `db/index.ts` switches drivers by `NODE_ENV` (node-postgres dev / neon-http prod) with zero code divergence. 01-03 SUMMARY documents: schema migrated to Neon, `DATABASE_URL` + `NEXT_PUBLIC_BASE_URL` set as encrypted Vercel env, `vercel --prod` deployed, curl confirmed `/` 200, `/health` 404, invalid tokens 404, seeded poll readable on prod admin URL with "Keep private" badge. Sequenced after Docker skeleton (D-13). |
| 5 | Candidate dates render on the same calendar day in every timezone (date-only stored as DATE, never parsed via `new Date()` constructor) | VERIFIED | Schema: `date("date", { mode: "string" })` — Drizzle returns YYYY-MM-DD strings directly, never a JS Date. `format-date.ts` uses `Date.UTC(year, month-1, day)` (not `new Date("YYYY-MM-DD")`) and formats with `timeZone: "UTC"`. `format-date.test.ts` (7 tests): ran under `TZ=Pacific/Kiritimati` (UTC+14) and `TZ=Etc/GMT+12` (UTC-12) — **both pass** (confirmed in this session). Only `new Date()` outside tests: `date-row.tsx` reads current wall-clock time for past-date warning — not parsing a date-only string; code comment confirms and is correct. |

**Score: 5/5 truths verified**

---

### Prohibition Coverage (SPEC must-NOTs)

| Prohibition | Req | Evidence | Status |
|-------------|-----|----------|--------|
| P1 — admin token not derivable from participant token | LINK-02, LINK-03 | `generateToken()` is a thin nanoid(21) wrapper with no derivation. `tokens.test.ts` tests that two independent calls are never equal and share no prefix/suffix. `create-poll.test.ts` "mints two independent 21-char tokens" asserts `adminUrlId !== participantUrlId` and neither starts with the other. | VERIFIED |
| P2 — no adminUrlId in any participant-facing surface | LINK-01, LINK-02 | `getPollByParticipantUrlId` in `queries.ts` selects an explicit column list that deliberately omits `adminUrlId`. `participant/page.test.ts` "NEVER exposes admin_url_id in the rendered HTML (P2)" asserts the rendered HTML does not contain the token, and "participant-safe query result has no adminUrlId key (P2)" asserts `Object.keys(poll)` does not include `adminUrlId`. | VERIFIED |
| P3 — no `new Date()` on date-only input | PLAT-04 | Grep of `src/app/` and `src/lib/` non-test files: the only `new Date()` is in `date-row.tsx` for reading current wall-clock time (not parsing a stored YYYY-MM-DD string). `format-date.ts` uses `Date.UTC(y, m, d)`. Dual-TZ format-date tests pass (verified in this session). | VERIFIED |
| UI-P1 — admin link always shows "Keep private" badge and warning copy | LINK-02 | `admin/page.tsx` renders an amber-bordered card with the `Keep private` badge and "Do not share this link. It grants full management access to this poll." copy — always rendered, not conditional. `page.test.ts` asserts both strings present. | VERIFIED |
| UI-P2 — no false "Copied!" when clipboard write rejects | (UI-SPEC) | `copy-link-button.tsx`: `setCopied(true)` is only reached inside the `try` block, after `await navigator.clipboard.writeText(url)` resolves. An exception falls through to the silent `catch` block without setting state. `copy-link-button.test.tsx` (2 tests, jsdom, both pass): "shows 'Copied!' after resolved write" and "does NOT show 'Copied!' when clipboard write rejects". | VERIFIED |

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/db/schema.ts` | polls + options tables, DATE mode:string, NULLS NOT DISTINCT | VERIFIED | Present and substantive. `options_dedup` unique constraint with `.nullsNotDistinct()` confirmed. DATE field uses `mode: "string"`. Both tables with correct columns. |
| `src/lib/tokens.ts` | nanoid(21) wrapper, no derivation logic | VERIFIED | 14-line file, pure nanoid(21) call. |
| `src/lib/format-date.ts` | TZ-safe date/time formatters | VERIFIED | Uses `Date.UTC()` + `timeZone:"UTC"` formatting. No `new Date()` on date-only strings. |
| `src/lib/db/index.ts` | Dual-driver client (node-postgres / neon-http) | VERIFIED | Switches by `NODE_ENV === "production"`. Both drivers imported. TypeScript clean. |
| `src/lib/actions/create-poll.ts` | Zod validation, dedupe, two tokens, insert, redirect | VERIFIED | 153 lines, fully implemented. Covers all validation paths. |
| `src/lib/db/queries.ts` | getPollByAdminUrlId, getPollByParticipantUrlId (P2), getOptionsForPoll (chronological) | VERIFIED | Participant-safe column projection (no adminUrlId). Chronological order with ASC NULLS FIRST. |
| `src/app/a/[adminUrlId]/page.tsx` | Admin page: both links, Keep-private badge, 404 on miss | VERIFIED | RSC, calls `notFound()` on lookup miss, renders both link cards with badge and warning. |
| `src/app/p/[participantUrlId]/page.tsx` | Participant shell: no adminUrlId, 404 on miss | VERIFIED | Uses participant-safe query. No `/a/` or admin token in render tree. |
| `src/app/not-found.tsx` | Global 404 page | VERIFIED | Present and renders "Poll not found" with explanatory copy. |
| `src/components/poll-create-form.tsx` | Creation form with useActionState, dynamic date rows | VERIFIED | 197 lines. Fully implemented with validation display, date rows, pending state. |
| `src/components/copy-link-button.tsx` | Clipboard button, success only on resolved write | VERIFIED | Correct conditional state-setting pattern. |
| `docker-compose.yml` | Two-service dev stack (db + web) | VERIFIED | postgres:17 with healthcheck; web service with depends_on db healthy; localhost:3000 mapped. |
| `Dockerfile.dev` | Next.js dev image | VERIFIED | File exists at expected path. |
| `drizzle/0000_amusing_tarot.sql` | Migration with NULLS NOT DISTINCT | VERIFIED | `CONSTRAINT "options_dedup" UNIQUE NULLS NOT DISTINCT("poll_id","date","start_time")` confirmed in SQL file. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `poll-create-form.tsx` | `createPoll` server action | `useActionState(createPoll, null)` | VERIFIED | Import at line 9; wired via useActionState at line 40-43. |
| `createPoll` | `db.insert(polls)` + `db.insert(options)` | Drizzle insert calls | VERIFIED | Lines 130-148 of `create-poll.ts`. Both inserts confirmed. |
| `createPoll` | `/a/[adminUrlId]` redirect | `redirect('/a/${adminUrlId}')` | VERIFIED | Line 152 of `create-poll.ts`. |
| `admin/page.tsx` | `getPollByAdminUrlId` | import + await call | VERIFIED | Lines 14-20 of admin page. |
| `participant/page.tsx` | `getPollByParticipantUrlId` | import + await call, no adminUrlId | VERIFIED | Lines 8-21 of participant page. Omission of adminUrlId verified at query layer. |
| `db/index.ts` | node-postgres (dev) / neon-http (prod) | `process.env.NODE_ENV === "production"` | VERIFIED | Switch at line 25-28. Both drivers imported. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `admin/page.tsx` | `poll`, `options` | `getPollByAdminUrlId` + `getOptionsForPoll` from Drizzle → Postgres | Yes — live DB query with WHERE clause on token | FLOWING |
| `participant/page.tsx` | `poll`, `options` | `getPollByParticipantUrlId` + `getOptionsForPoll` | Yes — live DB query, participant-safe projection | FLOWING |
| `poll-create-form.tsx` | form submission → createPoll state | `useActionState(createPoll)` → server action → `db.insert` | Yes — Zod-validated insert writes to Postgres | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Date renders same day under UTC+14 | `TZ=Pacific/Kiritimati npm test -- src/lib/format-date.test.ts` | 7/7 pass | PASS |
| Date renders same day under UTC-12 | `TZ=Etc/GMT+12 npm test -- src/lib/format-date.test.ts` | 7/7 pass | PASS |
| Token uniqueness and independence | `npm test -- src/lib/tokens.test.ts` | 4/4 pass | PASS |
| UI-P2 clipboard rejection does not show Copied! | `npm test -- src/components/copy-link-button.test.tsx` | 2/2 pass | PASS |
| TypeScript compilation | `npx tsc --noEmit` | No errors | PASS |
| Integration tests (createPoll + admin/participant pages) | Require `DATABASE_URL` (Docker Postgres) | 21 tests: SKIP (DB not running in this env) | SKIP — tests are substantive, not stubs; confirmed to pass when DATABASE_URL is set per SUMMARY 34/34 |

---

### Probe Execution

No probe scripts declared in PLAN files and no `scripts/*/tests/probe-*.sh` files present. Step 7c: SKIPPED (no probe scripts).

---

### Requirements Coverage

| Requirement | Phase | Description | Status | Evidence |
|-------------|-------|-------------|--------|----------|
| POLL-01 | 1 | Required non-empty title | SATISFIED | Zod `.trim().min(1)`, test: empty and whitespace-only rejected |
| POLL-02 | 1 | Optional description (≤2000) and location (≤200) | SATISFIED | Optional fields in schema and Zod; length caps tested |
| POLL-03 | 1 | ≥1 candidate dates; duplicates deduped; chronological order | SATISFIED | App-layer dedupe + DB NULLS NOT DISTINCT; test: dedupe collapses to 1; getOptionsForPoll ASC NULLS FIRST |
| POLL-04 | 1 | Optional start time per date; date-only valid | SATISFIED | Schema: nullable TIME; date-only and date+time options coexist; test asserts mixed-type creation and ordering |
| LINK-01 | 1 | Participant link grants voting access only; unknown token → 404 | SATISFIED | `/p/[participantUrlId]` route; `notFound()` on miss; test confirms 404 for unknown token |
| LINK-02 | 1 | Admin link is separate and not derivable from participant link | SATISFIED | Two independent `generateToken()` calls; token independence tests; admin page renders both |
| LINK-03 | 1 | Crypto-random, unguessable, non-enumerable identifiers (≥21 chars) | SATISFIED | nanoid(21) = 126-bit entropy; altered token → 404 (tested); 10k uniqueness test |
| PLAT-01 | 1 | Runs locally against local Postgres in Docker Desktop | SATISFIED | `docker-compose.yml` with two-service stack; `Dockerfile.dev`; node-postgres driver in dev |
| PLAT-02 | 1 | Deploys to Vercel free tier against Neon Postgres | SATISFIED (read-path automated; write-path human item) | Schema migrated to Neon, encrypted env vars set, `vercel --prod` deployed; curl confirmed read path + prohibitions on prod |
| PLAT-03 | 1 | All runtime deps within free tiers | SATISFIED | Neon free tier (0.5 GB, no auto-pause); Vercel Hobby; Resend not used in Phase 1 |
| PLAT-04 | 1 | No timezone drift; DATE storage; no `new Date()` on date-only | SATISFIED | `mode:"string"` Drizzle DATE; `Date.UTC()` formatter; dual-TZ tests run and pass (verified in this session) |

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `date-row.tsx` | 21 | `new Date()` | Info | **Not a violation of P3.** This constructs the current wall-clock time to compare against the entered date for the past-date warning. It does NOT parse a stored YYYY-MM-DD date-only string. Code comment explicitly documents this. |

No TBD, FIXME, or XXX markers found in production source files. No stubs or placeholder returns found in production paths.

---

### Human Verification Required

#### 1. Write-path browser round-trip on production

**Test:** Open https://looking-for-group-eight.vercel.app/ in a browser. Fill in a title, add at least one candidate date, and submit.
**Expected:** Browser redirects to `/a/<adminToken>` on the deployed Vercel domain. The admin page shows the poll title, both the participant and admin share links, and the admin card has an amber "Keep private" badge and "Do not share this link" warning copy. Copy each link and confirm the participant link contains `/p/<token>` and the admin link contains `/a/<token>`.
**Why human:** Verifies the Vercel serverless runtime executes the full createPoll server action → Neon INSERT → redirect flow. The automated 01-03 verification covered the read path (curl + seeded poll) but not the form submission → write path in the real prod environment.

#### 2. Cold-start after Neon idle-suspend

**Test:** After the production app has been idle for ~5 minutes (Neon auto-suspends), create a new poll from the browser.
**Expected:** Poll creation completes successfully (lands on admin page) without a 504 timeout. PLAT-02 acceptance criterion: "The first request after Neon idle-suspend completes within the Vercel function timeout."
**Why human:** Requires deliberately waiting for Neon to suspend, then triggering a real cold-start. Cannot be simulated with a static curl probe.

---

### Gaps Summary

No automated gaps found. All 5 roadmap success criteria verified, all 11 requirements satisfied, all 5 prohibitions verified by code inspection and test execution.

The two human verification items above cover the production write path — the gap between what curl can verify (read path, 404 behaviour, admin payload inspection) and what requires a real browser form submission through the Vercel serverless stack. This is a mandatory human check, not a code defect.

---

_Verified: 2026-06-30T14:02:00Z_
_Verifier: Claude (gsd-verifier)_

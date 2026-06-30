# Phase 1: Foundation & Poll Creation — Specification

**Created:** 2026-06-30
**Ambiguity score:** 0.13 (gate: ≤ 0.20)
**Requirements:** 11 locked

## Goal

An organizer can create a scheduling poll (required title; optional description and location; one or more candidate dates, each with an optional start time) and land on an admin page exposing two distinct, unguessable share links — with the app running on Postgres locally and deployed to Vercel/Neon, both on free tiers, and candidate dates rendering on the same calendar day in every timezone.

## Background

Greenfield — the repository contains only `.planning/` artifacts and the edge-probe hook; there is no application code, database schema, or framework scaffold yet. This phase establishes the foundation (Next.js 16 App Router + Drizzle ORM + Postgres-everywhere + nanoid tokens) and delivers the first vertical slice: poll creation through to an admin page with the two share links. All later phases (voting, dashboard, email, finalize) depend on the schema, token model, and date-handling decisions locked here.

## Requirements

1. **Required title**: A poll must have a non-empty title.
   - Current: No poll model or creation form exists.
   - Target: The creation form requires a title; empty or whitespace-only titles are rejected with a validation message and no poll is created.
   - Acceptance: Submitting with an empty/whitespace title returns a validation error and creates no DB row; submitting with a valid title creates exactly one poll.

2. **Optional description & location**: A poll may carry an optional description/notes and an optional location.
   - Current: No such fields exist.
   - Target: Both fields are optional free text; absent values are stored as NULL/empty and render without error; each is length-capped (description ≤ 2000 chars, location ≤ 200 chars).
   - Acceptance: A poll created with neither field renders its pages without error; values over the cap are rejected.

3. **Candidate dates**: A poll has one or more candidate dates.
   - Current: No date/option model exists.
   - Target: Creation requires at least one candidate date; identical duplicate dates are rejected/deduped; dates are displayed in chronological order regardless of input order.
   - Acceptance: Creating with zero dates is rejected; creating with the same date twice yields one option; options render oldest-to-newest.

4. **Optional start time per date**: A candidate date may optionally include a start time; date-only is valid.
   - Current: No option fields exist.
   - Target: Each option stores a date (DATE) and an optional start time; date-only and date+time options may coexist in one poll.
   - Acceptance: A poll with one date-only option and one date+time option is created and both render correctly.

5. **Participant link (voting-only)**: Creation yields a shareable participant link granting voting access only.
   - Current: No links exist.
   - Target: A `/p/[participantUrlId]` route resolves a poll for voting; an unknown/garbage token returns 404.
   - Acceptance: The participant URL loads the poll; a tampered/random participant token returns HTTP 404.

6. **Admin link (separate, non-derivable)**: Creation yields a separate admin link, not derivable from the participant link.
   - Current: No admin link exists.
   - Target: A `/a/[adminUrlId]` route exposes management; `adminUrlId` is an independent crypto-random value (not derived from `participantUrlId`); an unknown admin token returns 404.
   - Acceptance: The admin URL loads the admin page; the admin token cannot be computed from the participant token; a random admin token returns 404.

7. **Crypto-random, non-enumerable identifiers**: Poll/admin identifiers are long crypto-random strings.
   - Current: No identifiers exist.
   - Target: Identifiers use nanoid (≥ 21 chars / ≥ 126 bits entropy); they are not sequential or enumerable.
   - Acceptance: Incrementing or altering any character of a valid link returns 404 rather than another poll; generated IDs are ≥ 21 chars.

8. **Admin page renders both links**: The post-creation admin page shows both share links.
   - Current: No admin page exists.
   - Target: After creation the organizer lands on the admin page showing the participant link and the admin link, clearly labelled and copyable.
   - Acceptance: The admin page displays both URLs; the participant URL contains only `participantUrlId`, the admin URL only `adminUrlId`.

9. **Runs locally in Docker Desktop**: The dev environment runs in Docker Desktop (app + Postgres).
   - Current: No app, no DB config.
   - Target: A `docker-compose.yml` defines a `db` (Postgres) service and a `web` (Next.js dev server) service; `docker compose up` brings up the whole dev stack, runs migrations, and serves poll creation end-to-end with the app reachable on a mapped localhost port.
   - Acceptance: From a clean checkout + documented setup, `docker compose up` brings up app + Postgres in Docker Desktop and creates a poll successfully. (PLAT-01)

10. **Deploys to Vercel/Neon (free tier) — after local Docker works**: The app deploys to Vercel against Neon Postgres, within free tiers, sequenced AFTER the local Docker Desktop skeleton works.
    - Current: No deploy.
    - Target: Once the local Docker dev stack works end-to-end, a Vercel deployment connected to Neon (pooled connection) serves poll creation; the first request after Neon idle-suspend completes within the Vercel function timeout. Same single Drizzle schema, Neon driver selected by env — no code divergence.
    - Acceptance: The deployed URL creates a poll successfully, including a cold-start request after Neon has auto-suspended. (PLAT-02)

11. **No timezone date drift**: Candidate dates render on the same calendar day in every timezone.
    - Current: No date handling.
    - Target: Date-only values are stored as Postgres `DATE` and rendered as date strings; they are never parsed via the `new Date()` constructor on date-only input.
    - Acceptance: A date entered as `YYYY-MM-DD` renders as the same calendar day with the runtime `TZ` set to `Pacific/Kiritimati` (UTC+14) and `Etc/GMT+12` (UTC−12).

## Boundaries

**In scope:**
- Next.js 16 (App Router + Server Actions) + Drizzle ORM scaffold
- Dockerized dev environment in Docker Desktop: `docker-compose.yml` with `web` (Next.js dev) + `db` (Postgres) services, plus a `Dockerfile`/`Dockerfile.dev` for the web image
- Postgres-everywhere: local Postgres (Docker Desktop) + Neon (pooled) for Vercel
- Vercel/Neon deploy sequenced as the FINAL step, after the local Docker skeleton works
- `Poll` and `Option` schema with DATE storage and crypto-random `participantUrlId` / `adminUrlId`
- `createPoll` server action + creation form (`/`) with title, description, location, dates (+ optional time)
- Admin page (`/a/[adminUrlId]`) rendering both share links
- Participant route shell (`/p/[participantUrlId]`) that resolves a poll (voting UI is Phase 2)
- Vercel + Neon deployment

**Out of scope:**
- Participant voting / three-state selection — Phase 2 (this phase only resolves the participant route, no vote UI)
- Results grid / tallies / best-day / sort-filter — Phase 3
- Email invitations, confirmation emails, "Book it" finalize — Phase 4
- Participant accounts / auth — permanently out of scope (link-based access)
- Editing/deleting a poll after creation — not required for v1 foundation

## Constraints

- **Free tier only**: All runtime dependencies (DB, hosting) operate within free tiers — Neon free Postgres, Vercel Hobby. No paid services.
- **Postgres everywhere**: No SQLite-local/Postgres-prod split — the SQL-dialect divergence causes production-only bugs (per PITFALLS.md).
- **Neon over Supabase**: Neon's ~1–3s resume vs Supabase's ~30s 7-day-inactivity pause, which would exceed the Vercel function timeout for a sporadically-used poll.
- **Vercel Hobby limits**: Serverless function execution (~10s) — no long-running work in the create path; use a pooled Neon connection (serverless-safe).
- **Date handling**: Date-only options stored as `DATE`; never construct `new Date("YYYY-MM-DD")` (UTC-parse footgun).

## Acceptance Criteria

- [ ] Submitting the create form with an empty/whitespace title is rejected and creates no poll
- [ ] A poll can be created with title only (no description, no location)
- [ ] Creating a poll with zero candidate dates is rejected; ≥1 date succeeds
- [ ] Duplicate identical candidate dates collapse to one option; options render chronologically
- [ ] A poll supports a mix of date-only and date+time options
- [ ] After creation the admin page shows both a participant link and a separate admin link
- [ ] The admin token is independent crypto-random — not derivable from the participant token
- [ ] Altering/incrementing any valid participant or admin link returns HTTP 404
- [ ] Generated identifiers are ≥ 21 chars (nanoid, ≥126-bit entropy)
- [ ] `docker compose up` brings up the app + Postgres in Docker Desktop and creates a poll end-to-end (local dev environment)
- [ ] AFTER local Docker works, the app creates a poll end-to-end on Vercel against Neon, including a post-idle cold-start request
- [ ] A `YYYY-MM-DD` date renders as the same calendar day under TZ `Pacific/Kiritimati` (UTC+14) and `Etc/GMT+12` (UTC−12)

## Edge Coverage

**Coverage:** 10/14 applicable edges resolved (covered) · 4 dismissed-with-reason · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| idempotency | POLL-01 | ✅ covered | Rapid double-submit yields independent polls (each its own crypto IDs); no corruption — AC "creates exactly one poll" per submit |
| concurrency | POLL-01 | ✅ covered | Concurrent creates get distinct crypto-random IDs; no collision (ties LINK-03) |
| unclassified | POLL-02 | ✅ covered | Optional fields nullable; empty renders cleanly; length caps (desc ≤2000, location ≤200) — AC added |
| unclassified | POLL-03 | ✅ covered | ≥1 date required (zero rejected); duplicate dates deduped; chronological render — AC added |
| unclassified | POLL-04 | ✅ covered | Date-only and date+time options coexist; time requires its date — AC added |
| unclassified | LINK-01 | ✅ covered | Unknown/garbage participant token → 404 — AC added |
| unclassified | LINK-02 | ✅ covered | Admin token independent random; unknown admin token → 404 — AC added |
| unclassified | LINK-03 | ✅ covered | nanoid ≥126-bit; altering/incrementing a link → 404 (success criterion 3) |
| unclassified | PLAT-02 | ✅ covered | Neon post-idle cold-start resume must complete within Vercel function timeout — AC added (backstop) |
| unclassified | PLAT-04 | ✅ covered | Date renders same calendar day under UTC+14 and UTC−12 (DATE storage, no `new Date()`) — AC added |
| unclassified | PLAT-01 | ⛔ dismissed | Environment/parity requirement, not a data-shape edge; verified by AC "creates a poll against local Postgres" |
| adjacency | PLAT-03 | ⛔ dismissed | Free-tier cost/procurement constraint — no data-shape semantics; category is a false positive from the word "dependencies" |
| empty | PLAT-03 | ⛔ dismissed | Same — cost constraint, not a data shape |
| ordering | PLAT-03 | ⛔ dismissed | Same — cost constraint, not a data shape |

## Prohibitions (must-NOT)

**Coverage:** 3/3 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT make the admin token derivable from the participant token (no hash/transform/shared seed) | LINK-02, LINK-03 | resolved | verification: test — assert `adminUrlId` is independent of `participantUrlId` (no derivation; generated by separate nanoid calls). check_kind: node-test |
| MUST NOT expose the admin link/token in any participant-facing surface (the `/p/...` page, its payloads, or shared link) | LINK-01, LINK-02 | resolved | verification: test — assert the participant page HTML/JSON never contains `adminUrlId`. check_kind: node-test |
| MUST NOT shift a candidate date's calendar day via timezone conversion (no `new Date()` on date-only input) | PLAT-04 | resolved | verification: test — render a date under UTC+14 and UTC−12 and assert identical calendar day. check_kind: node-test |

*Canon referred out (not minted here): generic ID enumeration / IDOR is canon security — owned by `/gsd:secure-phase` + tooling; secret-committing (DB URL, Resend key) is owned by secret scanning. Breadcrumbs only.*

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                            |
|--------------------|-------|------|--------|--------------------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | Precise measurable goal + 5 roadmap criteria     |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | Voting/dashboard/email explicitly later phases   |
| Constraint Clarity | 0.85  | 0.65 | ✓      | Free-tier, Postgres-everywhere, crypto IDs, DATE |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 12 pass/fail criteria                            |
| **Ambiguity**      | 0.13  | ≤0.20| ✓      | Gate passed on initial assessment                |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

`--auto` mode: initial ambiguity (0.13) passed the gate from ROADMAP + REQUIREMENTS, so the Socratic interview was skipped. Edge probe (Step 5.5) and prohibition probe (Step 5.6) were run and resolved.

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| — | (auto) | Initial ambiguity ≤ 0.20 with all minimums met | Interview skipped; SPEC derived from roadmap + requirements |
| 5.5 | Edge probe | 14 applicable edges across 11 reqs | 10 covered (new ACs), 4 dismissed-with-reason, 0 unresolved |
| 5.6 | Prohibition probe | must-NOT recall→precision | 3 resolved (test-tier), 2 canon items referred out |

---

*Phase: 01-foundation-poll-creation*
*Spec created: 2026-06-30*
*Next step: /gsd:discuss-phase 1 — implementation decisions (how to build what's specified above)*

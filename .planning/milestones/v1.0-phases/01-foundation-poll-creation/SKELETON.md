# Walking Skeleton — Looking For Group (LFG)

**Phase:** 1
**Generated:** 2026-06-30

## Capability Proven End-to-End

A developer runs `docker compose up` (Docker Desktop) and, at http://localhost:3000/health, clicks "Run database check" — the app performs one real write and one real read against the Dockerized Postgres and shows the live result, proving Next.js 16 (RSC + Server Action) + Drizzle (dual-driver) + Postgres all work together in the local dev environment.

> The skeleton's "dev deployment" IS the local Docker Desktop stack (D-12). The Vercel/Neon cloud deploy is sequenced as the final step of Phase 1, AFTER this local stack works end-to-end (D-13).

## Running the Walking Skeleton (proven in 01-01)

From a clean checkout, with Docker Desktop running:

```bash
# 1. Bring up the full dev stack (Postgres + Next.js dev server)
docker compose up --build

# 2. (first run / after schema changes) apply migrations to the live DB.
#    drizzle-kit runs on the HOST and reaches Postgres via the mapped port:
DATABASE_URL=postgres://postgres:password@localhost:5432/lfg npm run db:migrate

# 3. Visit the health route in the browser:
#    http://localhost:3000/health
#    - the page performs a real server-side READ on load (polls count)
#    - click "Run database check" to perform a real WRITE + READ round-trip
```

The `/health` route is a temporary diagnostic proving Next.js 16 (RSC + Server
Action) + Drizzle (dual-driver) + Postgres work together in Docker Desktop. It
does NOT touch the surfaces plan 01-02 owns (`/`, `/a/[adminUrlId]`,
`/p/[participantUrlId]`) and is expected to be removed once createPoll lands.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16.2.9, App Router + Server Actions + RSC (React 19.2.7, TS 6.0.3) | Vercel-native; Server Actions remove a separate API layer for CRUD at this scale (D-01) |
| Styling / UI | Tailwind CSS 4.3.2 + shadcn/ui (new-york, zinc, CSS variables); Inter via next/font | Code-copied components, no runtime bundle bloat; UI-SPEC locks new-york/zinc (UI-SPEC) |
| Data layer | Postgres everywhere + Drizzle ORM 0.45.2 / drizzle-kit 0.31.10 | Avoids SQLite/Postgres dialect divergence (PITFALLS); single schema both envs (D-02) |
| DB driver | Dual-driver in `src/lib/db/index.ts`: node-postgres (pg 8.22.0) locally, @neondatabase/serverless (neon-http 1.1.0) when NODE_ENV=production | Vercel serverless needs HTTP, not TCP; one schema, driver switches by env (D-03) |
| Dev environment | Docker Desktop via `docker-compose.yml`: `db` (postgres:17) + `web` (Next.js dev, source bind-mounted, DATABASE_URL -> db) + `Dockerfile.dev` | Primary dev workflow; whole stack via `docker compose up` (D-12) |
| Schema | `polls` (uuid PK, participant_url_id unique, admin_url_id unique, title, description?, location?, status, created_at) + `options` (uuid PK, poll_id FK cascade, date DATE mode:string, start_time TIME?, position) with `(poll_id,date,start_time)` UNIQUE NULLS NOT DISTINCT + index on poll_id | Rallly-validated model; DATE-as-string avoids TZ drift; NULLS NOT DISTINCT dedupes date-only options (D-05/D-06) |
| Migrations | drizzle-kit `generate` + `migrate` (committed SQL in `drizzle/`); applied to the live DB BEFORE any read/write is asserted | Schema-push gate — types passing is not enough (D-04) |
| Tokens | `src/lib/tokens.ts` `generateToken()` = nanoid(21), ~126-bit entropy; participant and admin IDs are two INDEPENDENT calls (never derived) | Non-enumerable, unguessable links; admin token not derivable from participant token (D-07 / P1 / LINK-02/03) |
| Date handling | `src/lib/format-date.ts` formats date-only strings WITHOUT `new Date("YYYY-MM-DD")`; TZ test asserts identical day under UTC+14 and UTC-12 | No calendar-day drift (D-11 / P3 / PLAT-04) |
| Validation | Zod 4.4.3 in server actions; @t3-oss/env-nextjs for typed env (DATABASE_URL, NEXT_PUBLIC_BASE_URL) | Server-side validation; env fails loudly at build |
| Routing | `/` (create form), `/a/[adminUrlId]` (admin, both links), `/p/[participantUrlId]` (participant shell); unknown token -> notFound() 404 | URL shape matches filesystem; 404 satisfies non-enumerability (D-08) |
| Auth | None — link-based access only; the admin token IS the management credential; participant queries never select admin_url_id | No accounts by design (D-09 / P2) |
| Test runner | Vitest (node env); TZ-sensitive tests run under explicit TZ env vars | Lightweight, TS-native; enables the schema/token/date/prohibition tests |
| Deployment target | Vercel Hobby + Neon Postgres (free tier), pooled connection (-pooler.neon.tech) | Free; Neon over Supabase (no 7-day pause); deploy is the FINAL Phase 1 step (D-13) |
| Directory layout | `src/app/*` routes; `src/components/*`; `src/lib/db/{index,schema,queries}.ts`; `src/lib/{actions,tokens,format-date,urls,env}.ts`; `drizzle/` migrations; root `docker-compose.yml` + `Dockerfile.dev` | Mirrors RESEARCH.md recommended structure (RESEARCH lines 201-228) |

## Stack Touched in Phase 1

- [x] Project scaffold (Next.js 16, Tailwind, shadcn, ESLint, Vitest) — 01-01 Task 1
- [x] Routing — `/health` skeleton (01-01), then `/`, `/a/[adminUrlId]`, `/p/[participantUrlId]`, `not-found` (01-02)
- [x] Database — real write AND real read against Docker Postgres (01-01 Task 3 skeleton; full createPoll in 01-02)
- [x] UI — interactive element wired to a Server Action (01-01 skeleton button; full creation form in 01-02)
- [x] Deployment — local Docker Desktop stack first (01-01); Vercel/Neon cloud deploy last (01-03)

## Out of Scope (Deferred to Later Slices)

- Participant three-state availability voting + token-verified self-editing — Phase 2
- Results grid, tallies, best-day highlight, sort/filter — Phase 3
- Email invites, edit-link confirmation emails, "Book it" finalize — Phase 4
- Editing/deleting a poll after creation — not in v1 foundation
- Participant accounts / authentication — permanently out of scope (link-based access)
- Dark mode, mobile-specific grid optimizations — v2

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions (schema is additive — Participant + Vote tables join the existing polls/options):

- Phase 2: A participant opens the participant link, records three-state availability without an account, and returns via a per-participant edit token to change only their own response.
- Phase 3: The organizer reads everyone's availability in a participant x date grid with per-date tallies and a highlighted best day, plus sort/filter by status.
- Phase 4: The organizer emails invites (free-tier Resend/SMTP with copy-link fallback), participants get edit-link confirmation emails, and "Book it" finalizes a winning date and notifies all voters.

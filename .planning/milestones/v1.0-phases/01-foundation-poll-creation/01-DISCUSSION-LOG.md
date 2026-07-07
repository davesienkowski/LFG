# Phase 1: Foundation & Poll Creation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 1-foundation-poll-creation
**Mode:** `--auto --chain` (autonomous discussion; recommended defaults selected, then auto-advance to plan)
**Areas discussed:** Scaffold, DB driver strategy, Schema shape, Token strategy, Routing, Link URLs, Date handling

---

## Scaffold & Project Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Next.js 16 App Router + TS + Tailwind (create-next-app) | STACK.md recommendation; Server Actions remove a separate API layer | ✓ |
| Next.js Pages Router | Older paradigm; not recommended | |

**Choice:** Next.js 16 App Router + TypeScript + Tailwind, `src/` dir, Drizzle under `src/lib/db`.

---

## DB Driver Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| One schema, dual driver by env (pg local / Neon prod) | Postgres-everywhere; avoids dialect divergence | ✓ |
| SQLite local + Postgres prod | Cheaper local, but production-only bugs (PITFALLS) | |
| Neon for both (local Neon branch) | Works but needs network for local dev | |

**Choice:** One Drizzle schema; `node-postgres` on local Docker, Neon serverless (pooled) on Vercel. Neon over Supabase (resume latency).

---

## Schema Shape

| Option | Description | Selected |
|--------|-------------|----------|
| polls + options (DATE col, unique(poll_id,date,start_time)) | Rallly-validated; DB-level dedupe | ✓ |
| Single denormalized table | Loses option normalization needed for Phase 2/3 | |

**Choice:** `polls` (participant/admin url ids unique, title, description?, location?, status, created_at) + `options` (poll_id fk, date DATE, start_time TIME?, position).

---

## Token Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| nanoid(21), independent participant & admin tokens | ≥126-bit; admin not derivable (prohibition P1) | ✓ |
| UUID v4 | 36-char hyphenated; uglier URLs | |
| Sequential / hashids | Enumerable — rejected (LINK-03) | |

**Choice:** Two independent `nanoid(21)` calls; retry on unique collision.

---

## Routing & Link URLs

| Option | Description | Selected |
|--------|-------------|----------|
| /, /a/[adminUrlId], /p/[participantUrlId]; notFound() on miss | Clear two-link model; 404 satisfies non-enumerability | ✓ |

**Choice:** Three routes; participant payload excludes `admin_url_id` (prohibition P2). Absolute URLs from `NEXT_PUBLIC_BASE_URL` + copy buttons.

---

## Date Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres DATE + 'YYYY-MM-DD' strings, never new Date() | Eliminates UTC off-by-one (PLAT-04, prohibition P3) | ✓ |
| Store as timestamp | Reintroduces timezone drift — rejected | |

**Choice:** DATE storage; string handling; timezone test under UTC+14 and UTC−12.

---

## Claude's Discretion

- Form component breakdown, Tailwind styling, validation lib (zod vs hand-rolled), date-formatting helper — left to planner/executor within the D-11 no-`new Date()` rule.

## Deferred Ideas

- Editing/deleting a poll after creation — not in v1 foundation.
- Organizer availability row (ORG-01) — v2.

<!-- GSD:project-start source:PROJECT.md -->

## Project

**Looking For Group (LFG)**

A free, self-hostable clone of Doodle.com's "Group Poll" feature, focused on the single use case of helping a group agree on which day(s) to meet. The creator proposes a set of candidate dates, sends participants a link (by email), and each participant marks every date as **Available**, **Tentative (if-need-be)**, or **Not available**. A live results dashboard shows everyone's choices in a grid and surfaces the best day(s). Built for a Dungeons & Dragons group to schedule game sessions without paying Doodle's subscription.

**Core Value:** A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — with no login required for participants and no cost to run.

### Constraints

- **Budget**: Must be $0 to build and run — only free tiers / free/open-source tooling. — The whole point is replacing a paid subscription.
- **Hosting**: Must be self-hostable locally on a Windows/WSL PC AND deployable to Vercel free tier. — User's stated deployment options.
- **Email**: Sending invitation emails must work on a free tier (e.g. Resend free tier, or SMTP) without a paid plan. — Email is a required feature but cannot incur cost.
- **Auth**: Participants must not need accounts; access is via unguessable poll links. — Mirrors Doodle group polls; minimizes friction.
- **Simplicity**: Single focused feature; avoid scope creep into a full scheduling suite. — Maintainability for a solo hobby project.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Next.js | 16.2.9 | Full-stack framework (UI + API + Server Actions) | Vercel-native; App Router's Server Actions eliminate a separate API layer for simple CRUD; free to host on Vercel Hobby; `next dev` runs locally on WSL2 with zero config |
| React | 19.2.7 | UI rendering | Bundled with Next.js 16; Server Components reduce client JS; no separate install needed |
| TypeScript | 6.0.3 | Type safety across schema → ORM → UI | Drizzle's schema inference and Zod's type narrowing only pay off with TypeScript; catches ID/token type bugs at compile time |
| Tailwind CSS | 4.3.2 | Utility-first styling | v4 is the current stable; shadcn/ui ships Tailwind v4-compatible components as of Feb 2025; zero runtime cost |
| shadcn/ui | latest (CLI) | Accessible, pre-built UI components (grids, dialogs, buttons, forms) | Code-copied, not a runtime dependency — no bundle bloat; components own the code so there's no version lock; fully compatible with Tailwind v4 and React 19 |

### Database

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Neon (managed Postgres) | N/A (cloud service) | Production database on Vercel | Free tier: 0.5 GB storage, 100 CU-hours/month — far more than a D&D scheduler needs. Available via Vercel Marketplace (no credit card). Projects never pause on inactivity (unlike Supabase). Neon is the official Vercel Postgres recommendation after Vercel deprecated its own Postgres and KV offerings |
| Postgres via Docker | postgres:17 image | Local development database | Standard `docker run` gives a real Postgres instance locally. Same SQL dialect as Neon in prod — no surprises. Drizzle docs provide the exact one-liner (see Installation) |
| Drizzle ORM | 0.45.2 | Type-safe query builder and schema manager | Serverless-native (no native binary), 57 KB bundle vs Prisma 7's 1.6 MB. Cold starts ~75ms vs ~115ms for Prisma 7. `drizzle-orm/neon-http` works in Vercel's serverless runtime; `drizzle-orm/node-postgres` for local Docker. Single schema file defines both environments |
| drizzle-kit | 0.31.10 | Migration generation and schema push | Companion CLI to drizzle-orm; generates SQL migration files from schema diff; `drizzle-kit push` for rapid local iteration, `drizzle-kit migrate` for production |

### Email

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Resend | 6.16.0 (SDK) | Transactional invitation emails | Free tier: 3,000 emails/month, 100/day. Sending ~5 invites per poll session for a 6-person D&D group means this limit is never hit. Official React Email integration. REST API works from Next.js Route Handlers. Domain verification required but the free plan supports 1 custom domain |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @neondatabase/serverless | 1.1.0 | Neon HTTP/WebSocket driver | Required when connecting to Neon from Vercel serverless or edge functions — standard `pg` uses TCP which Vercel doesn't support; this library uses HTTP or WebSockets instead |
| nanoid | 5.1.16 | URL-safe unique token generation | Use for poll share links and admin tokens: 21-char default gives 126 bits of entropy (more than UUID v4's 122 bits), URL-safe alphabet, no hyphens. `crypto.randomUUID()` is a valid zero-dep alternative but produces 36-char hyphenated strings |
| zod | 4.4.3 | Schema validation | Validate all form inputs and Server Action arguments server-side; pairs with `useActionState` in Next.js 16 for inline form errors |
| @t3-oss/env-nextjs | 0.13.11 | Type-safe environment variables | Validates `.env` at build time; fails loudly if `DATABASE_URL` or `RESEND_API_KEY` are missing rather than silently at runtime |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| drizzle-kit | Schema migrations | `npx drizzle-kit generate` creates SQL files; `npx drizzle-kit push` syncs schema directly to local DB without migration files (good for early dev) |
| Docker Desktop (WSL2) | Local Postgres | `docker run --name lfg-postgres -e POSTGRES_PASSWORD=password -d -p 5432:5432 postgres:17` — single command, no Postgres install on host |
| Vercel CLI | Local env management | `vercel env pull .env.local` syncs Vercel environment variables to local for testing against Neon from localhost |

## Installation

# Bootstrap Next.js 16 with TypeScript and Tailwind

# Core ORM and database

# Email

# ID generation and validation

# Type-safe env

# shadcn/ui (code-copies components, not an npm package)

## Environment Variable Strategy

# .env.local (local dev — Docker Postgres)

# Vercel environment (production — Neon)

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Neon (Postgres) | Supabase | Supabase free projects **pause after 1 week of inactivity** — fatal for a hobbyist app used sporadically. Also limited to 2 active free projects. Neon does not pause. |
| Neon (Postgres) | Vercel Postgres / Vercel KV | Vercel discontinued both; they're no longer available as of 2024. New projects must use Vercel Marketplace integrations (Neon, Supabase, etc.) |
| Neon (Postgres) | Turso (SQLite) | Turso is a fine free-tier option but adds an extra service and libSQL dialect. Postgres is simpler when you're already on Neon via Vercel Marketplace |
| Drizzle ORM | Prisma 7 | Prisma 7 (pure TS, no Rust binary) improved cold starts to ~115ms but Drizzle remains at ~75ms and 57 KB vs 1.6 MB. Both work; Drizzle is lighter for a Vercel serverless app |
| Resend | Nodemailer + Gmail SMTP | Gmail SMTP requires App Passwords and has per-day rate limits enforced by Google policy, not a free tier. Resend's API is purpose-built for transactional email and has an official Node SDK |
| Resend | SendGrid free tier | SendGrid's free tier requires business verification and has had a pattern of revoking free plans. Resend is developer-focused and the free tier is stable |
| nanoid | `crypto.randomUUID()` | Both are valid. `crypto.randomUUID()` is built-in (no dep) but returns a 36-char hyphenated UUID. nanoid returns a 21-char URL-safe string — cleaner in share links like `/poll/V1StGXR8_Z5j`. Either works; nanoid is marginally better UX |
| shadcn/ui + Tailwind | Chakra UI / Mantine | shadcn/ui ships as source code, not a runtime package dependency, so there's no external bundle penalty and components are fully customizable. Chakra/Mantine are heavier runtime dependencies |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Vercel Postgres / Vercel KV | Discontinued by Vercel; no longer available for new projects | Neon via Vercel Marketplace |
| Supabase (free tier) | Projects **auto-pause after 1 week of inactivity**; must manually wake them. Kills the experience when checking the site after a week off | Neon (no auto-pause on free tier) |
| SQLite (file-based) | Vercel serverless functions have an ephemeral, read-only filesystem — writes fail. SQLite only works if you self-host a persistent Node.js process, which Vercel is not | Neon (Postgres with HTTP driver) |
| Prisma (before v7) | The Rust query engine binary caused ~1.5s cold starts in Vercel serverless; pre-v7 versions need `prisma generate` to be run in the build step | Drizzle ORM (no binary) |
| NextAuth / Auth.js | The project design explicitly excludes participant authentication; adding Auth.js adds significant complexity for zero benefit here. Admin access is handled via a separate admin token in the URL | No auth library needed; nanoid tokens for poll access |
| PlanetScale | Moved to paid-only MySQL offering; no longer has a free tier | Neon |
| Railway.app | Free tier discontinued in 2024 | Neon |
| Tailwind v3 | shadcn/ui new-york style now defaults to v4; mixing v3 components into a v4 project requires manual class prefix changes | Tailwind CSS v4 |

## Stack Patterns by Variant

- Point `DATABASE_URL` directly at your free Neon database
- No Docker required; `next dev` + Neon free tier + Resend API key is sufficient
- Caveat: requires internet; any schema migrations hit the real DB
- Run `docker run --name lfg-postgres -e POSTGRES_PASSWORD=password -d -p 5432:5432 postgres:17`
- Use `drizzle-kit push` to sync schema to local container
- Swap `DATABASE_URL` to local; `NODE_ENV=development` triggers `node-postgres` driver
- Set `RESEND_API_KEY` to a dummy value and conditional-skip the send call in dev
- Or use Resend's built-in test mode which returns success without delivering

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| next@16.2.9 | react@19.x, typescript@6.x | Next.js 16 requires React 19; create-next-app installs the correct peer deps automatically |
| tailwindcss@4.3.2 | shadcn/ui (Feb 2025+ components) | shadcn/ui updated all components for Tailwind v4 in February 2025; `npx shadcn@latest init` will configure v4 correctly |
| drizzle-orm@0.45.2 | drizzle-kit@0.31.10 | Always keep drizzle-orm and drizzle-kit in sync; mismatches cause migration failures |
| @neondatabase/serverless@1.1.0 | drizzle-orm/neon-http | Drizzle's `neon-http` adapter uses this package as its client; install both together |
| zod@4.4.3 | @t3-oss/env-nextjs@0.13.11 | env-nextjs uses zod schemas for validation; Zod v4 is supported by env-nextjs v0.13+ |

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| Next.js version (16.2.9) | HIGH | Verified via `npm view next version` |
| Neon free tier limits | HIGH | Verified via official Neon docs (neon.com/docs/introduction/plans) |
| Neon no auto-pause | HIGH | Confirmed in Neon docs: free tier does not pause; exceeds compute → suspended until next billing cycle, but data persists |
| Resend free tier (3k/month, 100/day) | HIGH | Verified via Resend pricing page |
| Drizzle vs Prisma recommendation | HIGH | Bundle size and cold start data from multiple independent sources (makerkit.dev, encore.dev, dev.to) |
| Vercel Hobby 10s function timeout | MEDIUM | Reported by multiple sources; verify against current Vercel docs before relying on long-running operations |
| Supabase auto-pause on free tier | HIGH | Confirmed in Supabase docs (supabase.com/docs/guides/platform/billing-on-supabase) |

## Sources

- [Neon Plans Documentation](https://neon.com/docs/introduction/plans) — free tier limits (storage, compute, no auto-pause)
- [Neon + Drizzle Local vs Vercel Guide](https://neon.com/guides/drizzle-local-vercel) — environment-aware connection strategy
- [Resend Pricing](https://resend.com/pricing) — free tier confirmation (3k/month, 100/day)
- [Vercel Hobby Plan Docs](https://vercel.com/docs/plans/hobby) — function limits, bandwidth
- [Drizzle ORM Neon Integration](https://orm.drizzle.team/docs/tutorials/drizzle-with-neon) — official Neon driver setup
- [shadcn/ui Tailwind v4 Changelog](https://ui.shadcn.com/docs/changelog/2025-02-tailwind-v4) — v4 compatibility confirmed Feb 2025
- [Drizzle vs Prisma 2026 — makerkit.dev](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) — bundle size and cold start comparison
- [Vercel Postgres Transition Guide](https://neon.com/docs/guides/vercel-postgres-transition-guide) — confirms Vercel Postgres is discontinued

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->

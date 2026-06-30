# Project Research Summary

**Project:** LFG — Group Availability Poll (Doodle "Group Poll" clone for D&D scheduling)
**Domain:** Free-tier, self-hostable, anonymous group availability scheduling web app
**Researched:** 2026-06-30
**Confidence:** HIGH

## Executive Summary

LFG is a deliberately minimal, single-purpose rebuild of Doodle's "Group Poll" feature, motivated entirely by the fact that Doodle moved its signature three-state (Yes / If-need-be / No) voting behind a ~$7/month paywall in 2026. The product is a no-account, link-based scheduling poll: an organizer proposes candidate dates, shares a link, participants mark availability across three states, and the organizer reads a participants × dates results grid to pick the winning date. Experts build this exact pattern as a thin full-stack Next.js app — the production open-source analog (Rallly) uses Next.js + a normalized relational schema, and our research validates the same shape with a lighter, serverless-native stack.

The recommended approach is Next.js 16 (App Router) with Server Actions as the sole mutation path, Drizzle ORM over Postgres (Neon free tier in production, Dockerized Postgres locally), Resend for transactional email, and nanoid for unguessable URL tokens. There is no auth system: access is governed by three separate unguessable tokens (admin URL, participant URL, per-participant edit token), each validated server-side on every request. The data model is normalized (Poll → Option, Poll → Participant → Vote) so the "best day" calculation is a single SQL GROUP BY rather than client-side aggregation. This keeps the entire app inside free tiers and runnable both on Vercel and locally.

The key risks are almost all free-tier and correctness traps that must be addressed at specific phases, not retrofitted. The biggest are: guessable/sequential poll IDs leaking participant PII (fix in the schema phase with nanoid + separate admin token), email deliverability (must verify a custom Resend domain — the one unavoidable ~$10-12/year cost — before any real invite is sent), participant edit tampering (per-participant edit token verified server-side), date timezone footguns (`new Date("YYYY-MM-DD")` underflows a day), and free-tier infra behavior (Neon cold starts, Resend 100/day cap, Vercel Hobby cron limited to once-daily). Choosing Neon over Supabase is itself a critical decision: Supabase pauses projects after 7 days idle (~30s wake), which is fatal for an app used every few weeks.

## Key Findings

### Recommended Stack

The stack is optimized for $0 cost, Vercel-native deployment, and serverless cold-start performance, with a single schema that works both locally (Docker Postgres) and in production (Neon). All versions were verified against the npm registry and official docs (HIGH confidence). See STACK.md for full detail.

**Core technologies:**
- **Next.js 16.2.9 + React 19**: full-stack framework — Server Actions eliminate a separate API layer; free on Vercel Hobby; runs locally with zero config
- **Drizzle ORM 0.45.2 + Neon (Postgres)**: type-safe queries, serverless-native (57 KB, ~75ms cold start); Neon free tier does NOT auto-pause (unlike Supabase)
- **Resend 6.16.0**: transactional email — 3,000/month, 100/day free; far exceeds a D&D group's needs
- **nanoid 5.1.16**: URL-safe, high-entropy tokens for poll/admin/edit links (prevents enumeration)
- **TypeScript 6 + Tailwind 4 + shadcn/ui + zod 4**: type safety, styling, copy-in components (no runtime bloat), server-side validation

**Explicitly avoid:** Vercel Postgres/KV (discontinued), Supabase free tier (7-day pause), SQLite on Vercel (ephemeral FS), Prisma <v7 (Rust binary cold starts), NextAuth (no accounts by design).

### Expected Features

Doodle's free tier is now binary yes/no only; the entire reason to build LFG is to deliver three-state voting for free. See FEATURES.md.

**Must have (table stakes):**
- Poll creation (title required; description/location optional; candidate date or date+time slots)
- Separate admin link and participant link (distinct tokens, admin never guessable from participant URL)
- Three-state click-cycle voting (Yes / If-need-be / No) with no-account name entry
- Live results grid (participants × dates) with per-column summary counts and best-day highlighting
- Token-based participant response editing (edit link in confirmation email + same-device cookie fallback)
- Email invitations via Resend; Finalize / "Book it" with confirmation email to respondents

**Should have (competitive / D&D-fit):**
- "Not yet responded" indicator and one-click manual nudge email
- Poll deadline (auto-close), organizer-as-participant row, comments thread

**Defer (v2+):**
- Mobile-optimized grid UX, multiple slots per day. Explicit anti-features: accounts, calendar/OAuth sync, billing, native apps, automatic scheduled reminders, hidden polls, timezone detection, CSV export, multi-organizer.

### Architecture Approach

A single Next.js App Router deployment where RSC pages fetch directly from the DB layer (no read API) and all mutations go through Server Actions (no write API). The URL shape maps 1:1 to routes (`/`, `/p/[participantUrlId]`, `/p/[participantUrlId]/edit/[editToken]`, `/a/[adminUrlId]`). The data model is normalized so best-day is a server-side SQL GROUP BY, and the email layer sits behind an environment-switched interface (Resend in prod, Nodemailer/MailHog locally). Validated against Rallly's production schema. See ARCHITECTURE.md.

**Major components:**
1. **Page routes (RSC)** — creation form, participant view/response, edit-response, admin dashboard; each validates its URL token against the DB
2. **Server Actions** — `createPoll`, `submitResponse`, `updateResponse`, `sendInvites`, `closePoll` (only mutation path)
3. **Data layer (`lib/db/`)** — entity-split Drizzle queries; `polls.ts` owns the aggregation query
4. **Email layer (`lib/email/`)** — interface over Resend / SMTP, env-switched
5. **Client islands** — `AvailabilityGrid` (3-state toggle), `ResultsGrid` (matrix), `DatePicker`

### Critical Pitfalls

1. **Guessable/sequential poll IDs** — leaks all participant PII via enumeration. Use nanoid tokens; generate a *separate* admin token (never derived from participant URL). Fix in the schema phase — retrofitting breaks shared links.
2. **Resend default test domain / 100-per-day cap** — `onboarding@resend.dev` lands in spam. Verify a custom domain (DNS DKIM/SPF/DMARC, ~48h propagation) BEFORE writing email code; handle 429 visibly; send individual emails (CC each counts).
3. **Participant edit tampering** — no ownership check lets anyone overwrite a response. Issue a per-participant edit token, verify `(pollId, token)` server-side, never look up by name. Build the check into the first version of the edit endpoint.
4. **Date timezone footgun** — `new Date("YYYY-MM-DD")` underflows a day in negative-offset zones. Store date-only as Postgres `DATE`; parse with `date-fns/parseISO`, never bare `new Date()`. Use `TIMESTAMPTZ` + IANA zone only if time slots are added.
5. **Free-tier infra behavior** — Neon cold starts (use pooled connection string, >=10s timeout, no keepalive pings), Vercel Hobby cron only once-daily (avoid sub-daily scheduled work; use request-time side effects for nudges), and SQLite!=Postgres divergence (run Postgres in all environments, including local Docker).

## Implications for Roadmap

The architecture research already defines clean vertical slices, and the pitfalls map cleanly onto early phases. The dominant constraint: get tokens and database engine right in phase 0/1 (hardest to change later), and get email DNS started early because of propagation delay.

### Phase 1: Foundation + Create Poll + Admin View
**Rationale:** Database engine and token strategy are the highest-cost-to-change decisions and gate everything else. Start the Resend custom-domain DNS verification in parallel here because of the up-to-48h propagation delay.
**Delivers:** Project scaffold, Postgres-everywhere setup (Docker local + Neon), Poll + Option schema with nanoid tokens, `createPoll` action, `/` creation form, `/a/[adminUrlId]` admin page showing share links.
**Addresses:** Poll creation; separate admin/participant links (FEATURES table stakes).
**Avoids:** Sequential poll IDs (Pitfall 3), SQLite/Postgres divergence (Pitfall 5), date timezone storage (Pitfall 8), Supabase pause (choose Neon — Pitfall 9).

### Phase 2: Submit Response + Three-State Voting
**Rationale:** The core differentiator. Depends only on Poll + Option existing. Edit-token ownership must be built into the first version, not bolted on.
**Delivers:** Participant + Vote schema, `AvailabilityGrid` client island, `submitResponse` + `updateResponse` actions, `/p/[participantUrlId]`, `/thanks`, and `/edit/[editToken]` routes; edit token in confirmation + same-device cookie/localStorage.
**Uses:** nanoid edit tokens, zod validation, Server Actions.
**Avoids:** Participant edit tampering / name collisions (Pitfall 4), timezone rendering (Pitfall 8), cookie-only edit limitation.

### Phase 3: Results Dashboard + Best Day
**Rationale:** Needs votes in the DB to display anything; purely additive to the admin page.
**Delivers:** `getResultsAggregation` SQL GROUP BY, `ResultsGrid` + `BestDayBadge` components, summary counts and best-day highlight on the admin route.
**Implements:** Data-layer aggregation; results grid component.
**Avoids:** Client-side aggregation anti-pattern, N+1 queries (index `votes.poll_id`).

### Phase 4: Email Invitations + Finalize
**Rationale:** Depends on poll existing; the email layer is otherwise independent. DNS (started in Phase 1) must be verified before testing real delivery.
**Delivers:** Env-switched email service (Resend / MailHog), React Email invite template, `sendInvites` and `closePoll` actions, admin email UI, finalization confirmation email.
**Addresses:** Email invitation, Finalize / "Book it" (table stakes).
**Avoids:** Test-domain spam (Pitfall 1), 100/day cap + 429 handling (Pitfall 2).

### Phase 5: Polish + v1.x Extras
**Rationale:** Additive enhancements once core is proven in real use.
**Delivers:** Proper multi-select DatePicker, mobile-responsive grid pass, "not yet responded" list, manual nudge email, poll deadline, organizer availability row.
**Addresses:** Differentiators (FEATURES P2).
**Avoids:** Vercel cron limits — implement nudges/deadlines as request-time side effects, not scheduled jobs (Pitfall 7).

### Phase Ordering Rationale

- **Dependency-driven:** Poll creation -> responses -> results -> email mirrors the data dependency chain in FEATURES.md and the vertical slices in ARCHITECTURE.md. Nothing downstream can be tested before its upstream entity exists.
- **Risk-front-loaded:** The two irreversible decisions (token entropy/separation, Postgres-everywhere) live in Phase 1 where they are cheap; pitfalls map almost exactly onto phase boundaries.
- **Latency-aware:** Resend DNS verification is kicked off in Phase 1 even though email isn't built until Phase 4, because propagation can take up to 48 hours.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (Email):** Resend custom-domain DNS (DKIM/SPF/DMARC) specifics and the local MailHog/Nodemailer dev path warrant a focused look; deliverability is easy to get subtly wrong.

Phases with standard patterns (skip research-phase):
- **Phase 1, 2, 3:** Well-documented Next.js App Router + Drizzle + nanoid patterns, with Rallly as a concrete production reference. Architecture research already provides schema, routes, and aggregation SQL.
- **Phase 5:** Purely additive UI/UX work over an established base.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry + official docs; free-tier limits confirmed in vendor docs |
| Features | HIGH | Grounded in Doodle Help Center primary sources + Rallly cross-reference |
| Architecture | HIGH | Validated against Rallly's production open-source schema and Next.js official docs |
| Pitfalls | HIGH | Each pitfall backed by vendor docs (Resend, Neon, Vercel, Supabase) and known JS/SQL footguns |

**Overall confidence:** HIGH

### Gaps to Address

- **Vercel Hobby 10s function timeout (MEDIUM):** Reported by multiple sources but verify against current Vercel docs before relying on synchronous email sends within a request. Handle gracefully — email sends are small and awaited inline at this scale.
- **Custom domain cost:** The only unavoidable cost (~$10-12/year for a domain for Resend deliverability). Confirm domain ownership/registration before Phase 4. Local/self-host can fall back to SMTP/MailHog.
- **Self-host parity:** Project requires both Vercel and local self-host. The env-switched DB/email layers cover this, but validate a clean local-only run (Docker Postgres + MailHog, no internet) as an explicit acceptance check.

## Sources

### Primary (HIGH confidence)
- Doodle Help Center articles — Group Poll mechanics (creation, if-need-be voting, editing, finalization)
- Rallly open-source schema (github.com/lukevella/rallly) — production data model reference
- Next.js App Router docs (Server Actions, Route Handlers) — mutation/data-fetch patterns
- Neon docs (plans, connection pooling) — free-tier limits, no auto-pause, cold-start handling
- Resend docs (quotas, email authentication) — 100/day cap, DKIM/SPF/DMARC requirements
- Vercel Hobby / Functions / Cron docs — function and cron limitations
- Supabase free-project-pausing docs — 7-day pause confirmation

### Secondary (MEDIUM confidence)
- Drizzle vs Prisma comparisons (makerkit.dev, encore.dev) — bundle size / cold-start data
- SyncWhen, meetergo, whocan.org — Doodle 2026 free-vs-paid feature confirmation
- Timezone/timestamp handling guides (Tinybird, Medium) — date footgun prevention

### Tertiary (LOW confidence)
- Vercel free-tier limit blog posts (deploywise.dev) — function timeout figure, verify against official docs

---
*Research completed: 2026-06-30*
*Ready for roadmap: yes*

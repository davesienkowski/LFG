# Phase 4: Email & Finalization - Research

**Researched:** 2026-07-01
**Domain:** Transactional email delivery (Nodemailer SMTP + optional HTTPS-API swap) on Vercel serverless, plus an additive Postgres schema change for poll finalization
**Confidence:** HIGH (transports, Vercel platform behavior, Drizzle migration pattern) / MEDIUM (Gmail SMTP long-term reliability on serverless — no first-party Google SLA for this use case)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** One env-switched `sendEmail()` seam under `src/lib/email/`; transport
  selected by an `EMAIL_PROVIDER` env var. Transport is **Nodemailer SMTP**.
  **Local dev = Mailpit** (`docker run axllent/mailpit`; SMTP :1025, UI :8025 —
  captures, never sends). **Prod default = Gmail SMTP + App Password** — SEED-001's
  ranked-#1 pick: the only truly-free, **no-domain** path with *good*
  deliverability, because mail leaves through Google *as* your gmail so
  SPF/DKIM/DMARC align (not treated as spoofed). SMTP2GO single-sender and
  Resend+domain stay swappable behind the same seam. **Resend + a custom domain is
  an optional deliverability UPGRADE, NOT a prerequisite** — it is no longer a
  blocker (this reverses the old STATE.md "~$10-12/yr domain + ~48h DNS" concern).
- **D-02:** ALL email env vars are **optional** in `src/lib/env.ts` (@t3-oss). An
  unset/`none` `EMAIL_PROVIDER` is a first-class "email not configured" state → the
  MAIL-03 graceful path. The app and EVERY non-email feature MUST run and pass
  with zero email config (no build/runtime failure when email is absent).
- **D-03:** DMARC-trap guard (SEED-001's most important gotcha): **never set `From:`
  to a gmail address on a third-party relay** (SMTP2GO/Brevo/Mailjet/SES/…) — it
  fails DMARC alignment and spam-folders. Only clean froms: `smtp.gmail.com`
  itself (auto-aligns), or a From on a DKIM-signed domain. `EMAIL_FROM` is set
  per provider accordingly; a gmail Reply-To is fine on a relay.
- **D-04:** Additive schema change only: add a **nullable `winning_option_id`**
  (uuid FK → `options`, `on delete set null`) to `polls`. Reuse the existing
  `status` text column (`'open'` → `'closed'`) — no new status vocabulary.
  Finalize is a single `UPDATE polls SET status='closed', winning_option_id=…`
  (neon-http-safe, no interactive transaction; mirrors Phase 2's additive-schema
  discipline). The **local migration gate** applies: generate + push to Docker
  Postgres and verify the column before asserting reads/writes; then prod Neon
  `db:migrate` + redeploy.
- **D-05:** The admin page (`/a/[adminUrlId]`) gains an **"Invite by email"** card:
  a multi-address input + a `sendInvites` server action that sends each recipient
  an **individual** email (loop, **not CC** — MAIL-01) containing the participant
  link. **Best-effort per address**: report per-recipient success/failure inline;
  one failure never aborts the rest. The 100/day-cap `429` and any transport error
  surface **visibly** to the organizer. When email is unconfigured (D-02) the card
  degrades to the existing `CopyLinkButton` + "email isn't set up — copy & share
  manually" (MAIL-03).
- **D-06:** Sends are **synchronous inside the server action** (micro-volume
  ~5–30/poll, a few polls/month — trivially inside every free tier). No queue
  (Vercel Queues is beta; overkill). **Research must verify Vercel serverless-SMTP
  viability** (handshake vs Hobby timeout, no cross-invocation pooling — SEED-001
  caveat); if Gmail-SMTP flakes on Vercel, fall back to an HTTPS-API provider
  behind the same D-01 seam.
- **D-07:** On a successful `submitResponse`, **if** the participant supplied an
  email AND a provider is configured, fire the **edit-link confirmation** email
  (best-effort). A send failure MUST NOT fail the vote — `/thanks` already surfaces
  the edit link as the authoritative fallback (Phase 2 D-09). Fire **on first
  submit only**, not on every edit (edits already hold the link) — avoids spamming.
- **D-08:** "Book it" on the admin page lets the organizer pick the winning date;
  the computed best-day (`computeResults` `isBest`) is **pre-highlighted as the
  default suggestion** but the organizer may choose ANY candidate date. Closing is
  destructive/one-way for v1 → a **confirm step** guards it. On confirm,
  `closePoll(adminUrlId, winningOptionId)` writes status+winning_option_id and
  reuses the Phase-2 status-closed read-only path (participant & edit pages already
  render "Voting is closed"; `updateResponse` already rejects writes to a non-open
  poll). Reopen/undo is deferred (v2).
- **D-09:** On finalize, send a **finalization** email to every participant with a
  stored email (FNL-03) containing the chosen date + event details (title, time,
  location). Best-effort per recipient (same posture as D-05); a mail failure never
  blocks or reverts the close — the poll is authoritatively closed once the DB
  write commits. Participants without an email are simply not notified.
- **D-10:** Three plain-HTML templates in `src/lib/email/templates.ts` (invite /
  edit-link confirmation / finalization). **No `react-email` dependency** (keep the
  bundle minimal, consistent with the project's no-bloat ethos); exact markup left
  to the executor. Dates render via the existing `formatDateWithTime` (timezone-
  safe, D-11/P3) — never `new Date()` on a date-only value.

### Claude's Discretion

- Exact email env-var shape (`SMTP_HOST/PORT/USER/PASS/EMAIL_FROM` vs a single URL
  vs per-provider blocks), template markup/copy, the "Invite by email" card layout
  and the "Book it" control placement, and whether `sendInvites` takes free-text
  addresses or reuses pre-seeded `participants` rows — all left to planner/executor,
  **provided** D-01 (env-switched seam), D-02 (email optional/graceful), D-03 (no
  gmail-From on relays), D-04 (additive `winning_option_id` + reuse `status`), and
  the best-effort non-blocking send posture (D-05/07/09) hold.
- **UI design contract recommended:** the invite card + "Book it" finalize are
  net-new UI (ROADMAP "UI hint: yes"). A `/gsd-ui-phase 4` pass before execution
  would lock the invite/finalize visual language and the "email not configured"
  empty state; plan-phase may insert it per config.

### Deferred Ideas (OUT OF SCOPE)

- **Resend + custom domain** (and the eu.org free-subdomain route) — optional
  deliverability upgrade; adopt only if Gmail-SMTP / SMTP2GO ever spam-folder.
- **RESP-02** one-click "nudge" email to non-respondents — v2.
- **Reopen / undo** a finalized poll — v2 (v1 close is one-way).
- **Rate-limiting / abuse controls** on `sendInvites` — ops concern, not MVP.
- **Organizer's own availability row (ORG-01)** — v2.

None of the above are in scope for Phase 4 — discussion stayed within the ROADMAP
boundary.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOTE-04 | Participant receives a confirmation email with a unique link to review/edit their response | `after()`-scheduled best-effort send from `submitResponse` (Pattern 4); templates section covers copy; existing `/thanks` fallback already carries the same link |
| MAIL-01 | Organizer enters one or more email addresses and sends each an individual invitation | `sendInvites` server action pattern (Pattern 3); individual-loop-not-CC pattern with per-recipient result reporting |
| MAIL-02 | Email delivery works on a free-tier provider (Resend) or SMTP, via env vars | Standard Stack + env-switch shape (Pattern 1); Gmail-SMTP verdict + Resend/SMTP2GO fallback wiring |
| MAIL-03 | Graceful degradation to copy/share when email is not configured | D-02 env-optional pattern; reuse of existing `CopyLinkButton` (already in codebase) |
| FNL-01 | Organizer finalizes by selecting the winning date ("Book it") | Drizzle additive-column migration (Pattern 2); `closePoll` single-UPDATE pattern |
| FNL-02 | Finalizing closes the poll to further voting | Reuses existing Phase-2 `status !== 'open'` read-only enforcement (verified in codebase — no new code needed beyond flipping the value) |
| FNL-03 | Every participant who voted receives a finalization confirmation with chosen date + details | Finalization email loop pattern (same shape as `sendInvites`), fired via `after()` post-UPDATE |
</phase_requirements>

## Summary

Phase 4 adds one new capability domain (outbound transactional email) and one
additive schema change (poll finalization) to an otherwise-stable Next.js 16 +
Drizzle + neon-http codebase. The email domain is architecturally simple — three
plain-HTML templates, one `sendEmail()` seam, one env-switch — but has two
real-world traps that must be handled correctly: (1) Vercel's serverless runtime
does **not** block SMTP (only port 25 is blocked, per Vercel's own KB), but a
raw SMTP connection that isn't fully awaited before the function's response
finishes can be silently killed — Next.js's `after()` API (stable since 15.1,
confirmed supported in the project's Next.js 16.2.9) is the exact fix, because it
explicitly documents running "even when redirect is called" and extends the
invocation via `waitUntil`; and (2) the Gmail-SMTP-via-relay DMARC trap — sending
`From: you@gmail.com` through any third-party relay (SMTP2GO, Brevo, etc.) fails
DMARC alignment and spam-folders; only `smtp.gmail.com` itself (self-authenticates)
or a domain you can DKIM-sign yourself produce a clean From.

All SEED-001 free-tier numbers were re-verified live in this session (2026-07-01):
Gmail SMTP personal-account automated-sending is capped around 100–500
messages/rolling-24h depending on source (100/day is the commonly cited automated-
SMTP figure, matching the ROADMAP's "100/day cap" note); SMTP2GO's free tier is
confirmed at 1,000/month, 200/day, 25/hour (hourly cap lifts after domain
verification); Resend's free tier is 100/day, 3,000/month but `onboarding@
resend.dev` can only email the account owner until a domain is verified — Resend
therefore cannot serve arbitrary-recipient invites without the domain upgrade
D-01 explicitly defers.

The additive schema change (`polls.winning_option_id`) follows the exact pattern
already used twice in this codebase (Phase 2's `participants`/`votes` tables): a
`drizzle-kit generate` diff, review the emitted SQL, push to the local Docker
Postgres, verify with `psql`, only then write code against the new column, and
finally `db:migrate` + redeploy against Neon prod.

**Primary recommendation:** Build one `sendEmail()` seam (Nodemailer as the sole
SMTP client, `EMAIL_PROVIDER` env-switched to `smtp | resend | none`), wire Gmail
App-Password SMTP as the default prod transport and Mailpit as the local dev
transport, fire `sendInvites` synchronously (awaited, per-recipient try/catch,
inline result reporting) and fire the confirmation/finalization emails via
`after()` immediately before each action's `redirect()` call so email latency
never blocks the user-visible response while Next.js still guarantees the send
completes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Invite send (MAIL-01) | API / Backend (Server Action) | Browser (form + inline result display) | Server Action owns the loop-send + credentials; client only submits addresses and renders per-recipient results |
| Email transport abstraction (D-01) | API / Backend | — | `sendEmail()` lives in `src/lib/email/`, invoked only from server actions; never touches the client bundle |
| Graceful no-email fallback (MAIL-03) | Frontend Server (SSR) | Browser | The admin page RSC decides whether to render the invite card or the existing `CopyLinkButton`, based on env; the client component is unchanged from Phase 1 |
| Edit-link confirmation (VOTE-04) | API / Backend (Server Action) | — | Fired from `submitResponse`, the same server action that already sets the edit cookie and redirects |
| Finalize / "Book it" (FNL-01/02) | API / Backend (Server Action) | Frontend Server (SSR admin page for the picker UI) | `closePoll` is a single authoritative DB write; the admin page renders the picker and pre-selects `isBest` |
| Read-only enforcement post-finalize (FNL-02) | API / Backend | Frontend Server (SSR pages already render "Voting is closed") | Already implemented in Phase 2 (`status !== 'open'` guard) — Phase 4 only needs to flip the value, no new enforcement code |
| Finalization notification (FNL-03) | API / Backend (Server Action) | — | Loop-send from `closePoll`, same shape as `sendInvites` |
| Winning-date persistence (D-04) | Database / Storage | API / Backend (single-UPDATE writer) | Additive nullable FK column; Postgres owns referential integrity via `on delete set null` |
| Local email capture (Mailpit) | Dev infra (Docker Compose) | — | Not part of the request path in prod; exists only so `sendEmail()` has a real SMTP endpoint to talk to locally |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| nodemailer | 9.0.3 `[VERIFIED: npm registry, published 2026-06-30]` | SMTP client for the `sendEmail()` seam (Gmail SMTP, Mailpit, SMTP2GO all speak SMTP) | The de-facto Node SMTP library since 2011; ~15-18M weekly downloads across trackers `[CITED: npmtrends.com/nodemailer, Snyk]`; zero native deps, works unmodified in the Node.js (not Edge) runtime that this project already targets |
| resend | 6.16.0 `[VERIFIED: npm registry, published 2026-06-26]` | Optional HTTPS-API fallback transport behind the same `sendEmail()` seam, and the "do it properly" deliverability upgrade path (D-01 deferred item) | Already the project's originally-recommended stack pick (`.claude/CLAUDE.md`); official Node SDK; needed if Gmail-SMTP or SMTP2GO ever spam-folder |
| @types/nodemailer | 8.0.1 `[VERIFIED: npm registry]` | TypeScript types for nodemailer (nodemailer's own package.json does not ship a `types` field) | Nodemailer has historically relied on the community DefinitelyTyped package; required for this project's strict TS setup |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| axllent/mailpit (Docker image) | v1.30 as of 2026-06 `[CITED: hub.docker.com/r/axllent/mailpit, mailpit.axllent.org]` | Local SMTP capture server (SMTP :1025, UI :8025) | Add as a third service in the existing `docker-compose.yml`, alongside `db` and `web` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Gmail SMTP (prod default) | SMTP2GO single-sender | No personal-account risk, no DMARC-trap on the From (SMTP2GO's own verified From), but caps at 200/day and needs a second free account; use if the organizer doesn't want SMTP creds tied to a personal Gmail login |
| Gmail SMTP (prod default) | Resend + custom domain | Best deliverability, needs a paid domain (~$1-12/yr) or a slow-to-approve eu.org free subdomain; explicitly deferred per D-01 |
| Nodemailer raw SMTP | Resend/SMTP2GO HTTPS API | HTTP APIs avoid the SMTP-connection-per-invocation cold-start cost and any residual doubt about serverless SMTP reliability; already wired as the D-06 fallback behind the same seam if Gmail-SMTP flakes |
| Plain-HTML templates (D-10) | react-email | react-email gives component reuse and a preview server, but adds a real dependency + build step the project's no-bloat ethos explicitly rejects (D-10 is locked) |

**Installation:**
```bash
npm install nodemailer resend
npm install -D @types/nodemailer
```

**Version verification:** Confirmed live against the npm registry on 2026-07-01
(`npm view nodemailer version` → 9.0.3, published 2026-06-30; `npm view resend
version` → 6.16.0, published 2026-06-26; `npm view @types/nodemailer version` →
8.0.1). All three are current as of research time — training-data familiarity with
"Nodemailer 6.x/7.x" APIs is stale; **the project must target the 9.x API surface**,
which is unchanged in shape for the basic `createTransport`/`sendMail` calls used
here (verified via the official Nodemailer docs, not training memory).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| nodemailer | npm | ~15 yrs (created 2011-01-21) | ~15-18M/wk `[CITED: npmtrends, Snyk]` | github.com/nodemailer/nodemailer | OK | Approved |
| resend | npm | ~9 yrs registry age / actively maintained SDK (created 2017-02-25, current org release 2026-06-26) | actively maintained official SDK `[ASSUMED: no independent download count verified this session]` | github.com/resend/resend-node | OK | Approved |
| @types/nodemailer | npm | ~10 yrs (created 2016-05-17) | DefinitelyTyped-scale (community types, high install volume by association with nodemailer) `[ASSUMED]` | DefinitelyTyped/DefinitelyTyped | OK | Approved |

No postinstall scripts were found for `nodemailer` or `resend` (`npm view <pkg>
scripts.postinstall` returned empty for both). `resend-node` (a plausible
hallucinated variant name) was checked and confirmed **not to exist** on the npm
registry (404) — `resend` is the correct, sole package name.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

slopcheck (v0.6.1) was installed and run successfully this session
(`python3 -m slopcheck scan --pkg npm <name> --json`); all three packages above
returned `OK`. Note the package-name provenance rule still applies: `nodemailer`
and `resend` are training-data-familiar names independently corroborated by
official docs (nodemailer.com, resend.com) and by this project's own
`.claude/CLAUDE.md` stack table, so they carry `[VERIFIED: npm registry]` in the
Standard Stack table above; `@types/nodemailer` is corroborated only by registry
existence + slopcheck OK, not an official doc citation, and is tagged
`[VERIFIED: npm registry]` here on the strength of DefinitelyTyped's known
maintenance model, but flagged for the planner's awareness that its provenance
chain is registry+slopcheck only.

## Architecture Patterns

### System Architecture Diagram

```
Organizer (admin page /a/[adminUrlId])
        │
        ├─ enters addresses ──▶ sendInvites (Server Action)
        │                           │
        │                           ├─▶ getPollByAdminUrlId (existing read)
        │                           ├─▶ for each address:
        │                           │      sendEmail({ type: "invite", to, participantUrl })
        │                           │            │
        │                           │            ▼
        │                           │      EMAIL_PROVIDER switch
        │                           │       ├─ "smtp"   → Nodemailer → smtp.gmail.com:465 (prod)
        │                           │       │                          → localhost:1025 (Mailpit, dev)
        │                           │       ├─ "resend" → Resend HTTPS API (fallback/upgrade path)
        │                           │       └─ "none"   → no-op, caller renders copy-link fallback (MAIL-03)
        │                           │      each result awaited synchronously (D-06); 429/error caught per-recipient
        │                           ◀─────────── per-recipient { ok | error } list
        ◀─ inline success/failure per address
        │
        └─ clicks "Book it" ──▶ closePoll(adminUrlId, winningOptionId) (Server Action)
                                    │
                                    ├─▶ single UPDATE polls SET status='closed', winning_option_id=$1
                                    ├─▶ getVoterEmailsForPoll (new read: participants with email, this poll)
                                    └─▶ after(() => { for each voter: sendEmail({ type: "finalization", ... }) })
                                             (fires post-response; failures logged, never revert the close)

Participant (participant link /p/[participantUrlId])
        │
        └─ submitResponse (Server Action, existing)
              │
              ├─▶ INSERT participant + votes (existing, unchanged)
              ├─▶ set edit cookie (existing, unchanged)
              ├─▶ after(() => { if email supplied: sendEmail({ type: "confirmation", editUrl }) })
              │        (scheduled before redirect(); runs even though redirect() throws)
              └─▶ redirect(`/p/.../thanks`)   ◀── unblocked by email latency
```

### Recommended Project Structure

```
src/lib/email/
├── send.ts          # sendEmail() — EMAIL_PROVIDER switch, Nodemailer transport
│                     #   construction (Gmail / Mailpit / SMTP2GO all via SMTP
│                     #   transport options), Resend client as the alternate branch
├── templates.ts      # renderInviteEmail / renderConfirmationEmail /
│                     #   renderFinalizationEmail — plain template-literal HTML,
│                     #   dates via formatDateWithTime (never new Date())
└── send.test.ts      # unit tests against a fake transport (see Validation section)

src/lib/actions/
├── send-invites.ts   # sendInvites server action (MAIL-01)
└── close-poll.ts      # closePoll server action (FNL-01/02/03)

src/lib/db/queries.ts  # + getVoterEmailsForPoll, getPollWithWinningOption (extend
                       #   existing file, do not create a new one)

src/lib/db/schema.ts   # + winningOptionId nullable uuid FK on polls (extend
                       #   existing file)

docker-compose.yml     # + mailpit service (SMTP :1025, UI :8025)
```

### Pattern 1: Env-Switched `sendEmail()` Seam (D-01)

**What:** A single async function whose behavior branches on `EMAIL_PROVIDER`,
so every call site (`sendInvites`, `submitResponse`, `closePoll`) is provider-
agnostic.
**When to use:** Every outbound email in this phase — never call Nodemailer or
Resend directly from a server action.
**Example:**
```typescript
// src/lib/email/send.ts
// Source: Nodemailer official docs (nodemailer.com/smtp, nodemailer.com/guides/using-gmail)
//         + Resend official docs (resend.com/docs/send-with-nodejs) — verified 2026-07-01
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

type SendResult =
  | { ok: true }
  | { ok: false; error: string; rateLimited?: boolean };

const PROVIDER = process.env.EMAIL_PROVIDER ?? "none"; // "smtp" | "resend" | "none"

let smtpTransport: Transporter | null = null;
function getSmtpTransport(): Transporter {
  if (smtpTransport) return smtpTransport;
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587/STARTTLS
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined, // Mailpit accepts unauthenticated connections locally
  });
  return smtpTransport;
}

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (PROVIDER === "none") {
    return { ok: false, error: "Email not configured" };
  }
  try {
    if (PROVIDER === "resend") {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: [args.to],
        subject: args.subject,
        html: args.html,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    // "smtp" — Gmail, Mailpit, or SMTP2GO, all speak plain SMTP.
    await getSmtpTransport().sendMail({
      from: process.env.EMAIL_FROM!,
      to: args.to,
      subject: args.subject,
      html: args.html,
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Gmail/SMTP2GO surface a 4xx/"rate" substring on daily-cap rejection;
    // treat as rate-limited so the UI can render distinct copy (D-05/D-06).
    const rateLimited = /rate|quota|too many|421|450/i.test(message);
    return { ok: false, error: message, rateLimited };
  }
}
```

### Pattern 2: Drizzle Additive-Column Migration (D-04)

**What:** Add a nullable FK column to an existing table without touching prior
migrations, following the exact local-push-then-verify gate this codebase already
used for the `participants`/`votes` tables in Phase 2.
**When to use:** Any additive schema change in this codebase.
**Example:**
```typescript
// src/lib/db/schema.ts — extend the existing `polls` table definition in place
export const polls = pgTable("polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  participantUrlId: text("participant_url_id").notNull().unique(),
  adminUrlId: text("admin_url_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  status: text("status").notNull().default("open"),
  // Phase 4 (D-04): nullable — a poll has no winner until finalized. ON DELETE
  // SET NULL so deleting an option never cascades into deleting the poll.
  winningOptionId: uuid("winning_option_id").references(() => options.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```
Migration workflow (mirrors this project's own established Phase 2 pattern):
```bash
npm run db:generate     # drizzle-kit generate — emits drizzle/0002_*.sql
# Read the emitted SQL — expect a single ALTER TABLE "polls" ADD COLUMN
# "winning_option_id" uuid; ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...
# ON DELETE SET NULL. No DROP/ALTER of any pre-existing column.
npm run db:push         # sync to local Docker Postgres (lfg-db-1) for fast iteration
# then verify before writing code against it:
docker exec lfg-db-1 psql -U postgres -d lfg -c '\d polls'
# Prod: npm run db:migrate (against Neon DATABASE_URL) + redeploy
```

### Pattern 3: Best-Effort Individual-Send Loop (D-05/D-06)

**What:** Loop recipients, `await` each `sendEmail()` call in sequence (no
`Promise.all` — a burst of concurrent SMTP connections against Gmail's per-
connection throttling is a needless risk at this volume), collect a per-recipient
result, never throw on an individual failure.
**When to use:** `sendInvites` (organizer-triggered, needs inline UI feedback) and
the finalization-email loop (fire-and-log, no UI feedback needed).
**Example:**
```typescript
// src/lib/actions/send-invites.ts (excerpt)
"use server";
// ...zod-validate `addresses: string[]` from the form...

const results: { email: string; ok: boolean; error?: string }[] = [];
for (const email of addresses) {
  const result = await sendEmail({
    to: email,
    subject: `You're invited: ${poll.title}`,
    html: renderInviteEmail({ title: poll.title, participantUrl }),
  });
  results.push({
    email,
    ok: result.ok,
    error: result.ok
      ? undefined
      : result.rateLimited
        ? "Daily send limit reached — try again tomorrow or share the link manually."
        : "Could not send — try again or share the link manually.",
  });
}
return { results }; // rendered inline per-address by the client card (D-05)
```

### Pattern 4: Non-Blocking Best-Effort Send via `after()` (D-07/D-09, resolves the Vercel-serverless-SMTP caveat)

**What:** Schedule the email send with Next.js's `after()` immediately before the
action's `redirect()` call. Confirmed via the official Next.js docs (fetched
2026-07-01): `after` "will be executed even if the response didn't complete
successfully. Including when an error is thrown or when `notFound` or `redirect`
is called" — and on Vercel it is implemented via `waitUntil`, which explicitly
"extends the lifetime of a serverless invocation" so the SMTP connection is not
silently dropped once the redirect response streams back to the client. This is
the direct answer to the SEED-001-flagged "Vercel serverless + SMTP" caveat: the
risk called out in community reports is an **un-awaited** fire-and-forget send
after the response returns; `after()`/`waitUntil` is precisely the platform
primitive that avoids that failure mode.
**When to use:** `submitResponse` (VOTE-04 confirmation) and `closePoll`
(FNL-03 finalization notices) — anywhere a redirect or UI response should not
wait on email latency, but the send must still reliably complete.
**Example:**
```typescript
// src/lib/actions/submit-response.ts (excerpt — added after the existing
// participant/vote INSERT and cookie-set, before the existing redirect())
import { after } from "next/server";
// ...
if (email) {
  after(async () => {
    const editUrl = buildEditUrl(base, poll.participantUrlId, editToken);
    await sendEmail({
      to: email,
      subject: `Your response to ${poll.title}`,
      html: renderConfirmationEmail({ title: poll.title, editUrl }),
    });
    // best-effort: no throw propagates past here; after() failures are logged
    // by the platform, never surfaced to the already-sent response (D-07).
  });
}
redirect(`/p/${poll.participantUrlId}/thanks`); // unaffected by the above
```
**Platform note:** `after()` requires Node.js runtime (not Edge) — this project
already runs its server actions on the Node.js runtime by default (no `edge`
runtime configured anywhere in `src/`), so no additional configuration is needed.
Vercel Hobby's default function duration was historically 10s but Vercel's own
changelog (fetched 2026-07-01) confirms Hobby functions can now run up to 60s via
`maxDuration`; a Gmail/Mailpit SMTP handshake (typically well under 2s) fits
comfortably inside either limit.

### Anti-Patterns to Avoid

- **Setting `From:` to a gmail address when the transport is SMTP2GO/Brevo/any
  relay:** fails DMARC alignment, spam-folders (D-03). Only `smtp.gmail.com`
  itself may use a gmail From.
- **`Promise.all`-ing the invite-send loop:** unnecessary concurrent-connection
  risk against Gmail's per-connection posture at this volume (~5-30/poll);
  sequential `await` in a loop is simpler and safer (Pattern 3).
- **Fire-and-forget without `after()`:** an un-awaited `sendMail()` call left to
  run after a server action's `redirect()` throws can be silently killed once the
  response is sent — this is the actual failure mode behind the "Vercel SMTP
  flakes" reports, not SMTP itself being blocked.
- **Using `react-email` for the templates:** explicitly locked out by D-10 to
  avoid a new dependency + build step.
- **A new Postgres status vocabulary for finalization:** D-04 locks reuse of the
  existing `status` text column (`open`/`closed`) — do not introduce a third
  status value or a separate boolean.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SMTP protocol handling (MIME, STARTTLS negotiation, connection pooling) | A raw `net`/`tls` socket client | Nodemailer | Nodemailer already handles MIME encoding, STARTTLS upgrade, and provider quirks (Gmail's From-rewrite, SMTP2GO's auth); a hand-rolled client would re-solve 15 years of edge cases |
| Rate-limit/429 detection across providers | Custom per-provider error-code parsing | The `rateLimited` regex heuristic in Pattern 1, scoped narrowly to this app's UI needs (not a general-purpose library) | A full "detect every provider's exact rate-limit signal" library is overkill for one small feature; a narrow heuristic that degrades to a generic error message is sufficient and matches D-05/D-06's "surface visibly" requirement without new dependencies |
| Background job scheduling for email sends | A custom queue/worker (e.g., BullMQ + Redis) | Next.js `after()` (Pattern 4) | The volume (a few sends per poll) never approaches queue-worthy scale; Vercel Queues is explicitly noted as beta/overkill in D-06; `after()` is a zero-infrastructure, framework-native primitive that already solves the exact "don't block the response" problem |

**Key insight:** Every piece of this phase is deliberately built from small,
already-battle-tested primitives (Nodemailer, `after()`, a single additive
column) rather than new infrastructure — this matches the project's own stated
constraint (single focused feature, avoid scope creep) and its $0 budget.

## Common Pitfalls

### Pitfall 1: The Gmail-From-on-a-Relay DMARC Trap
**What goes wrong:** Configuring `EMAIL_FROM=you@gmail.com` while
`EMAIL_PROVIDER` points at SMTP2GO/Brevo/any non-Gmail relay causes DMARC
alignment failure, and Gmail/Yahoo route the mail to spam or reject it outright.
**Why it happens:** DMARC requires the visible `From:` domain to match either the
SPF-authenticated sending domain or the DKIM-signing domain. A relay sending
"from" gmail.com without controlling gmail.com's DNS cannot satisfy either.
**How to avoid:** `EMAIL_FROM` must be derived from the active provider, not a
single global constant — when `EMAIL_PROVIDER=smtp` AND `SMTP_HOST=smtp.gmail.com`,
`EMAIL_FROM` is the same gmail address as `SMTP_USER`; when
`EMAIL_PROVIDER=smtp` AND `SMTP_HOST` is any other relay, `EMAIL_FROM` must be that
relay's own verified/single-sender address (gmail may only appear as
`EMAIL_REPLY_TO`, never `EMAIL_FROM`).
**Warning signs:** Invites/confirmations landing in participants' spam folders
only when the transport is switched away from Gmail SMTP.

### Pitfall 2: Un-Awaited Email Send Silently Dropped Post-Response
**What goes wrong:** Calling `sendEmail()` without `await` and without `after()`
inside a server action that then calls `redirect()` can result in the SMTP
connection being torn down before the message is fully sent, because Vercel may
freeze/terminate the function once the response streams back.
**Why it happens:** Serverless functions are not guaranteed to keep running
after their response is sent unless the platform is explicitly told to extend
the invocation (`waitUntil`).
**How to avoid:** Always route the confirmation/finalization sends through
`after()` (Pattern 4), which is documented to extend the invocation via
`waitUntil` specifically for this purpose. For `sendInvites`, `await` inline
instead (already required by D-06's "synchronous" mandate + the need for
per-recipient UI feedback).
**Warning signs:** Emails work reliably in local dev (long-lived Node process,
no invocation-teardown behavior) but are intermittently missing in the Vercel
production deployment.

### Pitfall 3: Confusing "SMTP is blocked on Vercel" with the Real Constraint
**What goes wrong:** Assuming Gmail-SMTP categorically cannot work on Vercel
(a claim repeated in several 2025-2026 blog posts found during this research)
and jumping straight to an HTTPS-API provider without first verifying the actual
official constraint.
**Why it happens:** Several third-party sources over-generalize "port 587/465
blocked" from real but narrower failure modes (Pitfall 2's un-awaited-connection
issue, or specific hosting providers other than Vercel).
**How to avoid:** Vercel's own knowledge-base article (fetched live this
session) states plainly: "Vercel does not block outgoing SMTP connections
except for port 25." The **official** guidance is a recommendation to prefer
HTTP-based providers for robustness, not a hard technical block. Treat Gmail-SMTP
as viable-with-correct-implementation (Pattern 4), and keep the D-06 HTTPS-API
fallback (Resend/SMTP2GO API) wired behind the same seam as a pre-built escape
hatch if real-world flakiness ever appears — do not pre-emptively abandon the
free, no-domain SMTP path on the strength of unverified blog claims alone.
**Warning signs:** None yet observed in this project — this is a preventive
note; monitor the first production sends after deploy.

### Pitfall 4: Building a New Migration on Top of an Uncommitted One
**What goes wrong:** Running `db:generate` twice without pushing/verifying the
first migration produces a diff against a stale local snapshot, or (worse) an
`ALTER TABLE` that conflicts with a column already added by a different session.
**Why it happens:** `drizzle-kit generate` diffs the schema file against the
`drizzle/meta/_journal.json` snapshot chain, not the live database.
**How to avoid:** Follow the same gate this codebase already used twice: generate
→ read the emitted SQL → `db:push` to the local Docker Postgres → verify via
`psql \d polls` → only then write `closePoll`/query code against the new column.
**Warning signs:** `drizzle-kit push` reporting an unexpected `DROP COLUMN` or a
column already existing.

### Pitfall 5: Treating Resend's `onboarding@resend.dev` as Production-Ready
**What goes wrong:** Wiring `EMAIL_PROVIDER=resend` with the default sandbox
sender and expecting invites to reach arbitrary participants; Resend restricts
`onboarding@resend.dev` to only the account owner's own inbox until a domain is
verified.
**Why it happens:** The sandbox sender is easy to copy from a "quick start" and
looks like a normal address.
**How to avoid:** The Resend branch of `sendEmail()` should only be enabled once
a real domain is verified in the Resend dashboard (the explicitly-deferred D-01
upgrade path) — document this as a precondition in the env var comments so a
future switch to Resend doesn't silently fail for non-owner recipients.
**Warning signs:** Resend API returning a 403/validation error for any `to`
address other than the account's own verified email.

## Code Examples

### Full Env-Var Shape (Claude's Discretion — recommended concrete shape)
```typescript
// src/lib/env.ts — extend the existing createEnv({...}) call.
// ALL of the below are OPTIONAL (D-02): the app must build/run/test with none set.
export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    // "smtp" | "resend" | "none" (default). Unset/invalid -> "none" (MAIL-03).
    EMAIL_PROVIDER: z.enum(["smtp", "resend", "none"]).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_SECURE: z.coerce.boolean().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM: z.string().optional(),
    EMAIL_REPLY_TO: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  },
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event?.startsWith("db:"),
  emptyStringAsUndefined: true,
});
```

### Local Dev Wiring (Mailpit in docker-compose.yml)
```yaml
# Source: mailpit.axllent.org/docs/install/docker, verified 2026-07-01
  mailpit:
    image: axllent/mailpit:v1.30
    ports:
      - "1025:1025" # SMTP — web service connects here as SMTP_HOST=mailpit
      - "8025:8025" # Web UI — open http://localhost:8025 to inspect sent mail
```
Corresponding local `.env`/compose env for the `web` service:
```
EMAIL_PROVIDER=smtp
SMTP_HOST=mailpit
SMTP_PORT=1025
# SMTP_SECURE unset/false; SMTP_USER/SMTP_PASS unset — Mailpit accepts
# unauthenticated connections by default (verified: mailpit.axllent.org/docs/configuration/smtp/)
EMAIL_FROM=dev@localhost
```

### Prod Wiring (Gmail SMTP + App Password)
```
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<your-gmail-address>@gmail.com
SMTP_PASS=<16-character App Password>   # Requires 2-Step Verification enabled
EMAIL_FROM=<your-gmail-address>@gmail.com   # MUST match SMTP_USER (D-03)
```
Precondition (must be confirmed with the account owner before build, per
CONTEXT.md "Specifics"): the Google account has 2-Step Verification enabled so
the App Passwords option is available under Google Account → Security →
"2-Step Verification" → "App passwords."

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| Fire-and-forget async work in a serverless function after `redirect()`/response | Next.js `after()` (built on Vercel `waitUntil`) | `after` stabilized in Next.js 15.1 (this project runs 16.2.9) | Directly resolves the SEED-001-flagged "Vercel serverless + SMTP" caveat — no queue infrastructure needed for best-effort sends |
| Vercel Hobby functions hard-capped at 10s | Hobby functions configurable up to 60s via `maxDuration` | Vercel changelog, confirmed live 2026-07-01 | Removes any residual doubt about an SMTP handshake (~1-2s) fitting inside the Hobby timeout |
| "Buy a domain for any real deliverability" (old STATE.md blocker) | Gmail-SMTP-via-App-Password as a genuinely free, no-domain, self-aligning path | SEED-001 research (2026-07-01), re-confirmed this session | Removes the ~$10-12/yr + ~48h DNS blocker from Phase 4's critical path entirely |

**Deprecated/outdated:**
- SendGrid free tier: retired July 2025 — do not recommend even as an alternative.
- MailChannels' free Cloudflare Workers relay: ended June 2024.
- Amazon SES: no longer perpetually free and gates arbitrary recipients behind a
  manual sandbox-exit request — not viable for this project's "$0, no ops
  overhead" constraint.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Google account intended for prod sending currently has 2-Step Verification enabled and can generate App Passwords (Google has periodically tightened this) | Code Examples / Prod Wiring | If not enabled, Gmail SMTP setup blocks until the account owner enables 2FA — a manual precondition, not a code fix |
| A2 | Resend package download/maintenance-activity figures (`[ASSUMED]` in the Package Legitimacy Audit) were not independently re-verified via a download-count source this session | Package Legitimacy Audit | Low risk — resend is this project's own pre-existing stack pick and its repo/org are independently confirmed via GitHub; only the precise download number is unverified |
| A3 | The "100/day" Gmail SMTP automated-sending figure (vs. the 500/day general-sending figure) is treated as the operative cap for `sendInvites`/confirmation/finalization traffic, matching the ROADMAP's own "100/day cap" phrasing | Summary / Common Pitfalls | If Google's actual automated-SMTP threshold differs from 100/day at build time, the 429/rate-limited UI copy is still safety-net-correct (it degrades gracefully either way), so risk is low |

## Open Questions

1. **Exact Gmail automated-SMTP daily threshold**
   - What we know: Multiple 2026 sources cite ~100/day for automated SMTP
     sending on a personal Gmail account (distinct from the 500/day general
     limit), which matches the ROADMAP's own "100/day cap" language.
   - What's unclear: Google does not publish an exact, stable number for
     third-party SMTP client usage specifically — it varies by account
     reputation and history.
   - Recommendation: Build the `rateLimited` detection generically (Pattern 1's
     regex against the SMTP error text) rather than hard-coding a specific
     numeric threshold in application logic — the volume at this project's
     scale (~5-30/poll, a few polls/month) should rarely approach any plausible
     threshold in practice.

2. **Whether the target Google account already has 2FA/App Passwords enabled**
   - What we know: This is a one-time manual precondition, not a code
     dependency.
   - What's unclear: Not verifiable from this research session (no access to
     the account).
   - Recommendation: Surface as a `checkpoint:human-verify` early in the plan,
     before any Gmail-SMTP-dependent task, so it doesn't block mid-build.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (for Mailpit) | Local email dev/testing (D-01) | ✓ (already used for `lfg-db-1`) | — | — |
| Gmail account + App Password | Prod email transport (D-01 default) | Unverified this session (Open Question 2) | — | SMTP2GO single-sender (no 2FA/App-Password precondition) |
| SMTP2GO account | Fallback transport (D-06) | Not yet created | — | Resend (needs domain — deferred) |
| Resend account + API key | Optional upgrade transport (D-01 deferred) | Not yet created | resend SDK 6.16.0 confirmed on npm | N/A — explicitly optional |
| Vercel Hobby project | Deploy target for `after()`/maxDuration behavior | ✓ (existing deployed project per STATE.md/CLAUDE.md) | — | — |

**Missing dependencies with no fallback:**
- None — every email transport has at least one fallback path behind the D-01
  seam (Gmail SMTP → SMTP2GO → Resend+domain).

**Missing dependencies with fallback:**
- Gmail App Password not yet confirmed enabled on the target account — falls
  back to SMTP2GO single-sender (no 2FA precondition) if unavailable.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No new authentication surface — email sending is triggered by the existing admin-token-gated action (`sendInvites`/`closePoll`) or the existing participant-token-gated action (`submitResponse`), both already covered by Phase 1/2's token model |
| V3 Session Management | No | Unchanged — reuses the existing `lfg_edit_*` httpOnly cookie (Phase 2), no new session concept introduced |
| V4 Access Control | Yes | `sendInvites` and `closePoll` MUST be gated by `getPollByAdminUrlId` (the existing admin-only read helper) exactly as the current admin page already does — never accept a client-supplied poll ID without re-deriving it from the admin token |
| V5 Input Validation | Yes | Zod validation of submitted email addresses (`z.string().email()`, matching the existing `email` field pattern in `submit-response.ts`/`update-response.ts`) before any address reaches `sendEmail()`; reject/flag malformed addresses per-recipient rather than aborting the whole batch |
| V6 Cryptography | No | No new cryptographic material — App Passwords/API keys are opaque provider secrets stored as env vars, not application-managed key material |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Admin-token leakage via email content (accidentally embedding the admin link in an invite/confirmation template) | Information Disclosure | Templates (D-10) must only ever interpolate `buildParticipantUrl`/`buildEditUrl` output, never `buildAdminUrl` — mirrors the existing `getPollByParticipantUrlId` "never select admin_url_id" discipline already enforced in `queries.ts` |
| Email-header injection via unsanitized `name`/`title`/`location` fields interpolated into the `subject` or template HTML | Tampering | `subject` and template fields must not embed raw newlines from user input; Nodemailer's `mailparser`/`sendMail` already strips CR/LF from header fields, but template HTML body content should still not be used to construct the `subject` line directly — build `subject` from a fixed prefix + the already-Zod-validated, length-capped `poll.title` (already enforced at 200 chars in `createPoll`'s schema) |
| Env var / App Password leakage in logs | Information Disclosure | Never log `SMTP_PASS`/`RESEND_API_KEY`; the `sendEmail()` catch block (Pattern 1) returns only `err.message`, which for Nodemailer auth failures does not echo the password back — verify this holds when writing the actual error-logging code |
| Enumeration via per-recipient invite-result timing/response differences | Information Disclosure (minor) | Not a meaningful risk here — the organizer is already the poll owner (admin-token-gated) sending to addresses they typed themselves; no untrusted party observes the per-recipient results |

## Sources

### Primary (HIGH confidence)
- Vercel Knowledge Base — "Can I use SMTP with Vercel?" (vercel.com/kb/guide/serverless-functions-and-smtp) — fetched live 2026-07-01: confirms only port 25 is blocked, recommends HTTP-based providers for robustness
- Next.js official docs — `after()` (nextjs.org/docs/app/api-reference/functions/after) — fetched live 2026-07-01, version 16.2.10 docs snapshot: confirms `after` runs even after `redirect()`, is stable since 15.1, uses `waitUntil` on Vercel, requires Node.js runtime
- Vercel docs — Runtimes (vercel.com/docs/functions/runtimes) — fetched live 2026-07-01
- Nodemailer official docs — "Using Gmail" guide (nodemailer.com/guides/using-gmail) — fetched live 2026-07-01: `service: "gmail"` shorthand, App Password requirement, From-header rewrite behavior
- Resend official docs (resend.com/docs/send-with-nodejs) — fetched live 2026-07-01: current SDK import/send syntax, sandbox `onboarding@resend.dev` restriction
- npm registry — `npm view nodemailer version` (9.0.3, published 2026-06-30), `npm view resend version` (6.16.0, published 2026-06-26), `npm view @types/nodemailer version` (8.0.1) — verified live this session
- Mailpit official docs (mailpit.axllent.org/docs/configuration/smtp/, /docs/install/docker) — fetched via search 2026-07-01: default unauthenticated SMTP on :1025, current version v1.30
- slopcheck v0.6.1 (github.com/0xToxSec/slopcheck) — run live this session against `nodemailer`, `resend`, `@types/nodemailer`: all `OK`, no SLOP/SUS flags

### Secondary (MEDIUM confidence)
- Vercel changelog — "Vercel Functions for Hobby can now run up to 60 seconds" — surfaced via WebSearch, consistent with the official Runtimes doc's `maxDuration` reference
- SMTP2GO official blog/support (smtp2go.com/pricing, support.smtp2go.com/hc/.../Free-Plan) — free tier figures (1,000/mo, 200/day, 25/hr) cross-referenced across 3+ independent aggregator sources in the same search batch
- DMARC alignment mechanics — smtp2go.com/blog/dealing-gmails-dmarc-policy, dmarcreport.com — cross-referenced across 2 independent sources describing the same SPF/DKIM-alignment-via-relay failure mode

### Tertiary (LOW confidence)
- Gmail automated-SMTP "100/day" figure — sourced from aggregator/SEO content (serversmtp.com, prospeo.io, smartlead.ai) rather than an official Google Workspace/Gmail help page; Google's own published limits page (support.google.com/mail/answer/22839) describes the general 500/day figure but does not clearly separate an "automated SMTP" sub-limit in the excerpt surfaced — flagged in Open Questions and Assumptions Log
- nodemailer/resend weekly download counts — varied significantly across aggregator sources (7M-18M/wk for nodemailer) in the same search; directionally "extremely high adoption" is solid, the exact number is not load-bearing for any recommendation here

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — both packages version-verified live against the npm registry and cross-checked against official docs; slopcheck clean
- Architecture (email seam, `after()` pattern, migration pattern): HIGH — the `after()`/Vercel-SMTP verdict was fetched directly from primary sources (Vercel KB, Next.js docs) rather than relying on training data or blog aggregation; the migration pattern is copied directly from this codebase's own prior, already-shipped Phase 2 precedent
- Pitfalls: HIGH for the DMARC trap and the un-awaited-send trap (both corroborated by primary/official sources); MEDIUM for the exact Gmail daily-cap number (tertiary sourcing only, flagged explicitly)

**Research date:** 2026-07-01
**Valid until:** ~30 days for the architecture/migration patterns (stable); ~7-14 days for the free-tier numeric limits (SMTP2GO/Gmail/Resend caps are provider-controlled and have changed multiple times across 2024-2026 per the "State of the Art" deprecated-provider list) — re-verify free-tier numbers again at actual build time if execution is delayed past this window.

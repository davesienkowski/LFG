# Phase 4: Email & Finalization - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 11
**Analogs found:** 9 / 11

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/lib/email/send.ts` | service (transport seam) | event-driven / request-response | `src/lib/db/index.ts` (env-switched dual-driver client) | role-match (config/service hybrid) |
| `src/lib/email/templates.ts` | utility (pure render) | transform | `src/lib/format-date.ts` (pure, no I/O, string-in/string-out) | role-match |
| `src/lib/actions/send-invites.ts` | controller (server action) | batch / request-response | `src/lib/actions/create-poll.ts` (Zod boundary, no-txn write, token-retry loop) | role-match |
| `src/lib/actions/close-poll.ts` | controller (server action) | CRUD (single UPDATE) | `src/lib/actions/update-response.ts` (status guard) + `create-poll.ts` (no-txn write) | exact (status guard) / role-match (write shape) |
| `src/lib/actions/submit-response.ts` (MODIFY) | controller (server action) | event-driven (add best-effort send hook) | itself — extend in place | exact (already read) |
| `src/lib/db/schema.ts` (MODIFY) | model | CRUD | `polls`/`participants` tables in same file (additive-column precedent) | exact |
| `src/lib/env.ts` (MODIFY) | config | config | itself — extend in place | exact |
| `src/app/a/[adminUrlId]/page.tsx` (MODIFY) | component (RSC page) | request-response | itself — extend in place (existing Card sections) | exact |
| Invite-card / Book-it client component(s) (NEW) | component (client island) | request-response | `src/components/vote-form.tsx` (useActionState + hidden-input) and `src/components/copy-link-button.tsx` (small client island) | role-match |
| `src/lib/db/queries.ts` (MODIFY) | model (read helpers) | CRUD | existing helpers in same file (`getResultsForPoll`, `getPollByAdminUrlId`) | exact |
| `docker-compose.yml` (MODIFY) | config | config | existing `db` service block | exact |

## Pattern Assignments

### `src/lib/email/send.ts` (service, event-driven)

**Analog:** `src/lib/db/index.ts` (env-switched dual-driver selection) — same "one exported function/const whose implementation branches on an env var, callers never see the branch" shape.

**Imports pattern** (`src/lib/db/index.ts` lines 1-9):
```typescript
import { drizzle as nodePgDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
```
Apply the same idea in `send.ts`: import `nodemailer` and `Resend` at module top, lazily construct/cache the transport (mirrors the `db` singleton export), branch by `process.env.EMAIL_PROVIDER` (RESEARCH.md Pattern 1 gives the full concrete implementation — copy it directly, it is already codebase-conformant).

**Env-switch pattern** (`src/lib/db/index.ts` lines 20-25):
```typescript
export const db: DB =
  process.env.NODE_ENV === "production"
    ? (neonDrizzle(neon(databaseUrl), { schema }) as unknown as DB)
    : nodePgDrizzle(databaseUrl, { schema });
```
`send.ts` should read `EMAIL_PROVIDER` the same way (module-level constant), not re-check `process.env` per call site, matching this file's single-read-at-module-load style.

**Error handling pattern:** No existing analog throws-and-catches for an external transport in this codebase (DB errors currently propagate uncaught to the action's try/catch-free callers, e.g. `create-poll.ts`'s `isUniqueViolation` helper below). Use RESEARCH.md Pattern 1's `SendResult = { ok: true } | { ok: false; error: string; rateLimited?: boolean }` discriminated-union return instead of throwing — this matches the project's existing `CreatePollState`/`UpdateResponseState` discriminated-result convention used at the action layer (see `create-poll.ts` lines 60-64, `update-response.ts` lines 60-68), just applied one layer lower.

**Unique-violation-style guard precedent** (`src/lib/actions/create-poll.ts` lines 51-58):
```typescript
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}
```
Mirror this narrow-heuristic style (not a library) for the `rateLimited` regex in RESEARCH.md Pattern 1 — the codebase's own convention is "small inline heuristic function next to the thing it guards," not a shared error-classification module.

---

### `src/lib/email/templates.ts` (utility, transform)

**Analog:** `src/lib/format-date.ts` — pure functions, no I/O, throws on malformed input, heavily comment-documented invariants.

**Core pattern** (`src/lib/format-date.ts` lines 60-71, the composition style to imitate):
```typescript
export function formatDateWithTime(
  yyyymmdd: string,
  hhmm: string | null,
): string {
  const datePart = formatDateOnly(yyyymmdd);
  if (!hhmm) {
    return datePart;
  }
  return `${datePart} at ${formatTimeOnly(hhmm)}`;
}
```
`templates.ts` should export three pure `render*Email({ ... }): string` functions built the same way: small composable pieces, each taking already-validated plain data (never a DB row directly — pass `poll.title`, `formatDateWithTime(date, time)` output, and URL strings from `src/lib/urls.ts`, never raw `Date` objects). Import `formatDateWithTime` from `@/lib/format-date` exactly as the admin page does (see below).

**Critical invariant to carry over (from CONTEXT.md D-10 + `src/lib/urls.ts`):** templates must only interpolate `buildParticipantUrl`/`buildEditUrl` output — never `buildAdminUrl`. `src/lib/urls.ts` (already read in full) exposes exactly these three builders; import only the two participant-safe ones into `templates.ts`.

---

### `src/lib/actions/send-invites.ts` (controller, batch)

**Analog:** `src/lib/actions/create-poll.ts` (Zod boundary + no-interactive-transaction + retry-loop shape).

**Imports pattern** (`create-poll.ts` lines 14-19):
```typescript
"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";
```
`send-invites.ts` swaps the last two imports for `getPollByAdminUrlId` (from `@/lib/db/queries`), `sendEmail` (from `@/lib/email/send`), `renderInviteEmail` (from `@/lib/email/templates`), and the URL builders. It returns a per-recipient result array instead of `redirect()`-ing (this is a form-submit-with-inline-feedback action, not a navigate-away action — closer in *shape* to `updateResponse`'s error-return path than to `create-poll`'s always-redirects path).

**Zod boundary pattern** (`create-poll.ts` lines 21-46, the schema-shape convention to copy):
```typescript
const CreatePollSchema = z.object({
  title: z.string().trim().min(1, "Poll title is required").max(200, "..."),
  ...
});
```
`send-invites.ts` needs a `z.array(z.string().email())` (or comma/newline-split free text, per CONTEXT.md's "Claude's Discretion") validated the same way `submit-response.ts`/`update-response.ts` validate `email` (`.max(200).email()`, order matters — max before email so long-string vs malformed-format errors differ, see `submit-response.ts` lines 40-45).

**Access-control precedent (V4, load-bearing):** `src/app/a/[adminUrlId]/page.tsx` line 34 — `const poll = await getPollByAdminUrlId(adminUrlId); if (!poll) notFound();` — `send-invites.ts` MUST re-derive the poll from the admin token the same way (never accept a client-supplied poll id), matching RESEARCH.md's V4 Access Control note.

**Best-effort loop pattern:** copy RESEARCH.md Pattern 3 verbatim (`send-invites.ts` excerpt, sequential `await` in a `for` loop, no `Promise.all`) — it is already written in this project's exact style (matches the sequential-not-parallel discipline the project uses nowhere else yet, but is consistent with `create-poll.ts`'s own sequential poll-then-options inserts).

---

### `src/lib/actions/close-poll.ts` (controller, CRUD)

**Analog 1 — status guard:** `src/lib/actions/update-response.ts` lines 100-103:
```typescript
if (poll.status !== "open") {
  return { errors: { _form: ["Voting is closed for this poll."] } };
}
```
`close-poll.ts` is almost the inverse: it should reject if `poll.status !== "open"` too (can't close an already-closed poll) — same guard, same error-shape convention (`{ errors: { _form: [...] } }`).

**Analog 2 — single-statement neon-http-safe write:** `update-response.ts` lines 127-135 (the onConflictDoUpdate) demonstrates the "entire write is ONE statement, no interactive transaction" discipline; `close-poll.ts`'s write is simpler still — a single `db.update(polls).set({ status: "closed", winningOptionId }).where(eq(polls.adminUrlId, adminUrlId))`. Follow `create-poll.ts`'s comment-documentation style to record *why* it's one statement (neon-http has no interactive transactions — already the established codebase rationale, restated in every action file's header comment).

**Analog 3 — access control:** same `getPollByAdminUrlId` + `notFound()` pattern as `send-invites.ts` above; `close-poll.ts` is admin-token-gated identically.

**Best-effort finalization-notify hook:** copy RESEARCH.md Pattern 4 (`after()` scheduling) verbatim — it is the direct answer to D-09's "never block or revert the close" requirement, and is written in this project's exact comment-and-code style already.

**New query needed:** `getVoterEmailsForPoll` in `src/lib/db/queries.ts` — model it on `getResultsForPoll` (lines 90-135, already read in full): same `LEFT JOIN`-avoidance shape is unnecessary here (a simple `SELECT participants.email FROM participants WHERE poll_id = $1 AND email IS NOT NULL`), but keep the same doc-comment discipline that explains exactly which columns are selected and why (e.g., never select `edit_token` or `admin_url_id` — mirrors `getParticipantByEditToken`'s comment at lines 70-83).

---

### `src/lib/actions/submit-response.ts` (MODIFY — add best-effort confirmation send)

**Analog:** itself. Insert the `after()` block (RESEARCH.md Pattern 4, copy verbatim) immediately before the existing `redirect()` call at the end of the function (currently the last line, `redirect(`/p/${poll.participantUrlId}/thanks`);`). Add `import { after } from "next/server";` to the existing import block (lines 20-29). Gate the send with the existing `email` variable already destructured at line 76 (`const { name, email, votes: votesInput } = parsed.data;`) AND a "first submit only" check — this action is INSERT-only (per its own header comment, lines 1-17), so every call to `submitResponse` IS a first submit by construction; no extra guard needed here (the "not on every edit" requirement is automatically satisfied because edits route through `updateResponse`, a different file, which must NOT gain this hook).

---

### `src/lib/db/schema.ts` (MODIFY — additive column)

**Analog:** the `participants`/`votes` tables already in this same file (Phase 2's additive-migration precedent, documented inline at lines 55-66).

**Exact pattern to copy** (RESEARCH.md Pattern 2, which itself paraphrases this file's own existing `polls` table at lines 24-34):
```typescript
export const polls = pgTable("polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  participantUrlId: text("participant_url_id").notNull().unique(),
  adminUrlId: text("admin_url_id").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  status: text("status").notNull().default("open"),
  // Phase 4 (D-04): nullable — a poll has no winner until finalized.
  winningOptionId: uuid("winning_option_id").references(() => options.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```
Note: `options` is declared AFTER `polls` in the current file (line 36 onward), so the FK reference `() => options.id` (a thunk) is required to avoid a use-before-define error — Drizzle's `references()` API already supports this, and the codebase already relies on forward-thunk references elsewhere (e.g. `options.pollId` references `() => polls.id` at line 40, `participants.pollId` at line 71) — same pattern, just inverted direction.

**Migration workflow to follow exactly (already twice-established in this codebase):**
```bash
npm run db:generate     # emits drizzle/000X_*.sql
# read the emitted SQL — expect ONE ALTER TABLE ADD COLUMN + ADD CONSTRAINT ... ON DELETE SET NULL
npm run db:push         # local Docker Postgres (lfg-db-1)
docker exec lfg-db-1 psql -U postgres -d lfg -c '\d polls'   # verify gate
# only then write closePoll/query code against the column
# prod: npm run db:migrate (Neon) + npx vercel@latest deploy --prod --yes
```

---

### `src/lib/env.ts` (MODIFY — add optional email vars)

**Analog:** itself, extend in place.

**Current full file** (baseline to extend):
```typescript
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  },
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event?.startsWith("db:"),
  emptyStringAsUndefined: true,
});
```
Add every new var as `.optional()` inside `server`, and mirror each into `runtimeEnv` (both blocks currently kept in 1:1 sync — do not add a var to one without the other, this file has zero drift between the two objects today). RESEARCH.md's "Full Env-Var Shape" code block gives the exact var list (`EMAIL_PROVIDER`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_API_KEY`) — copy it, all optional, preserving D-02 (app boots with zero email config).

---

### `src/app/a/[adminUrlId]/page.tsx` (MODIFY — mount new Card sections)

**Analog:** itself — the file already establishes the exact Card-section pattern to replicate twice more (invite card, book-it control).

**Section pattern to copy** (lines 71-88, the participant-link Card — this is the direct template for the new "Invite by email" card):
```tsx
<Card className="flex flex-col gap-2 p-6">
  <span className="text-sm font-semibold">Participant link</span>
  <span className="text-base text-muted-foreground">
    Share this link with your group
  </span>
  <span className="font-mono text-sm truncate">{participantUrl}</span>
  <div>
    <CopyLinkButton url={participantUrl} label="Copy participant link" />
  </div>
</Card>
```
New sections should follow the same `<div className="flex flex-col gap-4"><h2 className="text-2xl font-semibold leading-snug">...</h2> ... </Card>...</div>` nesting already used for "Share your poll" (lines 68-98) and "Results" (lines 100-107). Insert the "Invite by email" card as a sibling within (or after) the "Share your poll" block, and the "Book it" control as a new top-level section, likely placed near "Results" since it consumes `results`/`computeResults` output (`isBest`) already computed at line 40 (`const results = computeResults(participants, options);`) — no new computation needed, just pass `results` (or the `isBest` option id) down as a prop.

**Data already available for the new UI** (no new queries needed for these two specific pieces): `poll.status` (for conditionally hiding "Book it" once closed), `options` + `results` (for pre-selecting the best day), `participantUrl` (embed in invite emails via the server action, not passed to the client for that purpose).

---

### Invite-card / Book-it client component(s) (NEW)

**Analog:** `src/components/vote-form.tsx` (useActionState + hidden-input serialization) and `src/components/copy-link-button.tsx` (small client island, local state, no server action).

**useActionState + hidden-input pattern** (`vote-form.tsx` lines 1-19, 63-79):
```tsx
"use client";
import { useActionState, useId, useState } from "react";
...
export function VoteForm({ action, ... }: { action: VoteAction; ... }) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(action, null);
  ...
  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="participantUrlId" value={participantUrlId} />
      ...
    </form>
  );
}
```
The invite-card component (e.g. `InviteByEmailForm`) should follow this exact shape: `"use client"`, `useActionState` bound to `sendInvites`, a serialized-array hidden input (mirrors `vote-form.tsx`'s `<input type="hidden" name="votes" value={votesPayload} />` at line 78) for the address list, and inline per-recipient result rendering driven by the action's returned `results` array (RESEARCH.md Pattern 3's return shape).

**Small stateful client island pattern** (`copy-link-button.tsx` full file, already read) — if the "Book it" control is a simple confirm-then-submit button rather than a full form, model it on this file's `useState` + async-handler shape instead of pulling in `useActionState` machinery.

**MAIL-03 graceful fallback:** per CONTEXT.md D-05, when email is unconfigured the invite card must degrade to the existing `<CopyLinkButton url={participantUrl} label="Copy participant link" />` (already rendered on the page, lines 76-83) plus a line of copy — this is a conditional render in the RSC page (`page.tsx`), branching on whether `process.env.EMAIL_PROVIDER` (or an equivalent server-only flag) is configured, NOT a client-side check.

---

### `src/lib/db/queries.ts` (MODIFY — new read helpers)

**Analog:** existing helpers in the same file, particularly `getResultsForPoll` (lines 90-135) for the doc-comment/column-selection discipline, and `getPollByAdminUrlId` (lines 15-21) for the simplest read shape.

**Simple-read pattern to copy** (`getPollByAdminUrlId`, lines 15-21):
```typescript
export async function getPollByAdminUrlId(adminUrlId: string) {
  const [poll] = await db
    .select()
    .from(polls)
    .where(eq(polls.adminUrlId, adminUrlId))
    .limit(1);
  return poll ?? null;
}
```
`getPollWithWinningOption` (needed by `close-poll.ts`'s notify step, to read the finalized date/time for the email body) should follow this exact shape, likely a `select()` plus a join to `options` on `winningOptionId`, or two sequential single-table reads (matching the codebase's no-multi-table-transaction discipline already established).

**Voter-email read** (`getVoterEmailsForPoll`) — model the doc comment on `getParticipantByEditToken`'s (lines 70-83) explicit "selects X, DELIBERATELY OMITS Y, and why" discipline: select only `participants.name`/`participants.email` (or whatever the finalization template needs), explicitly note `edit_token` and `admin_url_id` are never selected — same security note RESEARCH.md's V4/V5 section already calls out.

---

### `docker-compose.yml` (MODIFY — add mailpit service)

**Analog:** the existing `db` service block (lines 6-16, already read in full).

**Pattern to copy** — RESEARCH.md's own "Local Dev Wiring" snippet is already written to match this file's exact YAML style (image + ports, no healthcheck needed for mailpit since it has no startup dependents):
```yaml
  mailpit:
    image: axllent/mailpit:v1.30
    ports:
      - "1025:1025"
      - "8025:8025"
```
Add corresponding `EMAIL_PROVIDER`/`SMTP_HOST=mailpit`/`SMTP_PORT=1025`/`EMAIL_FROM` entries to the existing `web` service's `environment:` block (lines 20-25), following the exact `KEY: value` style already used for `DATABASE_URL`/`NEXT_PUBLIC_BASE_URL`/`NODE_ENV`.

## Shared Patterns

### Admin-token access control (V4)
**Source:** `src/app/a/[adminUrlId]/page.tsx` lines 33-34 — `const poll = await getPollByAdminUrlId(adminUrlId); if (!poll) notFound();`
**Apply to:** `send-invites.ts`, `close-poll.ts` — both MUST re-derive the poll row from the server-validated `adminUrlId` argument (never trust a client-supplied poll id/uuid).

### Zod-boundary + discriminated error-state return
**Source:** `src/lib/actions/create-poll.ts` lines 60-64 (`CreatePollState`), `src/lib/actions/update-response.ts` lines 100-103 (`{ errors: { _form: [...] } }`)
**Apply to:** `send-invites.ts` (per-address validation before any `sendEmail()` call — reject/flag malformed addresses per-recipient, matching RESEARCH.md's V5 note), `close-poll.ts` (status-guard error return).

### No-interactive-transaction single-statement writes
**Source:** every existing action file's header comment (`create-poll.ts`, `submit-response.ts`, `update-response.ts` — all explicitly document "neon-http does not support interactive/callback transactions").
**Apply to:** `close-poll.ts` (one `UPDATE`), `send-invites.ts`/finalization loop (read once, then loop sends — never wrap the loop in a transaction).

### Never construct `new Date()` from a date-only string
**Source:** `src/lib/format-date.ts` full-file comment header (lines 1-11) — the UTC-explicit-components technique.
**Apply to:** `templates.ts` — all three templates render dates via `formatDateWithTime` imported from `@/lib/format-date`, never raw `Date`.

### Participant-safe column selection (never leak admin_url_id / edit_token)
**Source:** `src/lib/db/queries.ts` `getPollByParticipantUrlId` (lines 24-38) and `getParticipantByEditToken` (lines 70-83) doc comments.
**Apply to:** new `getVoterEmailsForPoll` query — select only what the finalization template needs (name/email), never `admin_url_id`/`edit_token`.

### `after()` for non-blocking best-effort sends before `redirect()`
**Source:** RESEARCH.md Pattern 4 (not yet in codebase, but written to match this project's action-file comment style).
**Apply to:** `submit-response.ts` (confirmation email), `close-poll.ts` (finalization notify loop).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/email/send.ts` (Resend/SMTP transport-construction internals) | service | event-driven | No prior outbound-network-call code exists in this codebase (only DB reads/writes so far) — follow RESEARCH.md Pattern 1 directly, it is the closest thing to an analog available and is already codebase-conformant in style |
| `src/lib/email/templates.ts` (HTML string composition) | utility | transform | No prior HTML-templating code exists; `format-date.ts` is the best structural analog (pure, string-returning, throws on malformed input) but has no direct precedent for multi-field HTML composition |

## Metadata

**Analog search scope:** `src/lib/`, `src/lib/actions/`, `src/lib/db/`, `src/app/a/[adminUrlId]/`, `src/components/`, root `docker-compose.yml`
**Files scanned:** `env.ts`, `db/index.ts`, `db/schema.ts`, `db/queries.ts`, `actions/create-poll.ts`, `actions/submit-response.ts`, `actions/update-response.ts`, `urls.ts`, `format-date.ts`, `tokens.ts`, `results.ts`, `app/a/[adminUrlId]/page.tsx`, `components/copy-link-button.tsx`, `components/vote-form.tsx`, `docker-compose.yml`
**Pattern extraction date:** 2026-07-01

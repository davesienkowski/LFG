# Phase 2: Participant Voting - Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 13
**Analogs found:** 13 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/db/schema.ts` (+ `participants`, `votes`) | model | CRUD | `src/lib/db/schema.ts` (existing `polls`/`options`) | exact (same file, additive) |
| `src/lib/actions/submit-response.ts` | service/controller | CRUD (write) | `src/lib/actions/create-poll.ts` | exact |
| `src/lib/actions/update-response.ts` | service/controller | CRUD (upsert) | `src/lib/actions/create-poll.ts` (shape) + Drizzle `onConflictDoUpdate` (new primitive) | role-match |
| `src/lib/db/queries.ts` (+ `getParticipantByEditToken`, `getVotesForParticipant`) | service | CRUD (read) | `src/lib/db/queries.ts` (existing `getPollByParticipantUrlId`) | exact (same file, additive) |
| `src/components/availability-grid.tsx` | component | event-driven (client state) | `src/components/calendar-date-picker.tsx` | exact |
| `src/components/vote-form.tsx` | component | request-response (form) | `src/components/poll-create-form.tsx` | exact |
| `src/app/p/[participantUrlId]/page.tsx` (modify) | route (RSC) | request-response | itself (current placeholder) + `src/app/a/[adminUrlId]/page.tsx` (cookie/headers RSC pattern) | exact + role-match |
| `src/app/p/[participantUrlId]/thanks/page.tsx` | route (RSC) | request-response | `src/app/a/[adminUrlId]/page.tsx` (link-card + `CopyLinkButton` pattern) | role-match |
| `src/app/p/[participantUrlId]/edit/[editToken]/page.tsx` | route (RSC) | request-response | `src/app/p/[participantUrlId]/page.tsx` (current) | exact |
| `src/lib/tokens.ts` (reused, no change) | utility | — | n/a (already exists) | exact |
| `src/lib/format-date.ts` (reused, no change) | utility | transform | n/a (already exists) | exact |
| `src/lib/actions/submit-response.test.ts` | test | CRUD (DB-backed) | `src/lib/actions/create-poll.test.ts` | exact |
| `src/lib/actions/update-response.test.ts` | test | CRUD (DB-backed) | `src/lib/actions/create-poll.test.ts` | exact |

## Pattern Assignments

### `src/lib/db/schema.ts` (model, CRUD)

**Analog:** same file — extend the existing `polls`/`options` pattern (`/home/dave/repos/LFG/src/lib/db/schema.ts`)

**Existing table shape to mirror** (lines 23-55):
```typescript
export const polls = pgTable("polls", {
  id: uuid("id").primaryKey().defaultRandom(),
  participantUrlId: text("participant_url_id").notNull().unique(),
  ...
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const options = pgTable(
  "options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    startTime: time("start_time"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    unique("options_dedup").on(t.pollId, t.date, t.startTime).nullsNotDistinct(),
    index("options_poll_id_idx").on(t.pollId),
  ],
);
```

**Apply to `participants`/`votes` (per D2-01/D2-02):**
```typescript
export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email"),
  editToken: text("edit_token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pollId: uuid("poll_id").notNull().references(() => polls.id, { onDelete: "cascade" }),
    participantId: uuid("participant_id").notNull().references(() => participants.id, { onDelete: "cascade" }),
    optionId: uuid("option_id").notNull().references(() => options.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
  },
  (t) => [
    unique("votes_participant_option_unique").on(t.participantId, t.optionId),
    index("votes_poll_id_idx").on(t.pollId),
    index("votes_participant_id_idx").on(t.participantId),
  ],
);

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
export type Vote = typeof votes.$inferSelect;
export type NewVote = typeof votes.$inferInsert;
```
**Critical detail (RESEARCH Pitfall 1):** the `updateResponse` action's `onConflictDoUpdate({ target: [...] })` MUST name exactly `[votes.participantId, votes.optionId]` to match `votes_participant_option_unique` — verify with `psql \d votes` after migrating.

---

### `src/lib/actions/submit-response.ts` (service/controller, CRUD write)

**Analog:** `/home/dave/repos/LFG/src/lib/actions/create-poll.ts`

**Imports pattern** (lines 15-21):
```typescript
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";
```
Add: `import { cookies } from "next/headers";`, `participants, votes` to schema import, `getPollByParticipantUrlId, getOptionsForPoll` from queries.

**Zod schema pattern** (lines 23-48) — mirror trim-before-min, optional-with-max:
```typescript
const CreatePollSchema = z.object({
  title: z.string().trim().min(1, "Poll title is required").max(200, "..."),
  description: z.string().max(2000, "...").optional(),
  ...
  dates: DateOptionSchema.array().min(1, "Add at least one candidate date"),
});
```
Apply to submit-response per D2-10: `name` (trim, 1-100), `email` (optional, valid format, ≤200), `votes` array `{ optionId, state: z.enum(["yes","ifneedbe","no"]) }`.

**Unique-violation retry helper** (lines 56-63) — copy verbatim, reused by both submitResponse for `editToken` collision:
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

**Token-collision retry + insert pattern** (lines 120-140) — mirror exactly for the participant insert:
```typescript
let pollId: string | null = null;
let adminUrlId = "";
for (let attempt = 0; ; attempt++) {
  const participantUrlId = generateToken();
  adminUrlId = generateToken();
  try {
    const [poll] = await db.insert(polls).values({...}).returning({ id: polls.id });
    pollId = poll.id;
    break;
  } catch (error) {
    if (isUniqueViolation(error) && attempt < 4) continue;
    throw error;
  }
}
```
→ for `submitResponse`, replace with single `editToken` mint/retry (RESEARCH Pattern 1, lines 200-215):
```typescript
let participantId: string | null = null;
for (let attempt = 0; ; attempt++) {
  const editToken = generateToken();
  try {
    const [participant] = await db
      .insert(participants)
      .values({ pollId: poll.id, name, email: email || null, editToken })
      .returning({ id: participants.id });
    participantId = participant.id;
    break;
  } catch (error) {
    if (isUniqueViolation(error) && attempt < 4) continue;
    throw error;
  }
}
```

**Batched second insert + gap-fill** (RESEARCH Pattern 1, mirrors `create-poll.ts` lines 142-149 `db.insert(options).values(...)`):
```typescript
const submittedByOption = new Map(votesInput.map((v) => [v.optionId, v.state]));
const rows = pollOptions.map((opt) => ({
  pollId: poll.id,
  participantId: participantId as string,
  optionId: opt.id,
  state: submittedByOption.get(opt.id) ?? "no",
}));
await db.insert(votes).values(rows);
```

**Poll-status guard (NEW for this action, no Phase 1 analog — add before any write):**
```typescript
const poll = await getPollByParticipantUrlId(participantUrlId);
if (!poll) notFound();
if (poll.status !== "open") {
  return { errors: { _form: ["Voting is closed for this poll."] } };
}
```

**Cookie set + redirect pattern (NEW primitive, RESEARCH Pattern 3)** — set inside the action before `redirect()`, exactly like `create-poll.ts`'s `redirect(`/a/${adminUrlId}`)` at line 152 but preceded by a cookie write:
```typescript
const cookieStore = await cookies();
cookieStore.set({
  name: `lfg_edit_${poll.participantUrlId}`,
  value: editToken,
  httpOnly: true,
  sameSite: "lax",
  path: `/p/${poll.participantUrlId}`,
  maxAge: 60 * 60 * 24 * 365,
});
redirect(`/p/${poll.participantUrlId}/thanks`);
```

**Error handling pattern:** same as `create-poll.ts` — `safeParse`, flatten `fieldErrors`, return `{ errors }` (no throw) on validation failure; DB/unique-violation errors only retried for the token case, otherwise rethrown (let Next.js error boundary handle it).

---

### `src/lib/actions/update-response.ts` (service/controller, CRUD upsert)

**Analog:** `src/lib/actions/create-poll.ts` for shape/imports/Zod/error-handling; Drizzle official upsert docs for the new atomic-replace primitive (no Phase 1 file does an upsert).

**Core upsert pattern (RESEARCH Pattern 2, verified against drizzle-orm@0.45.2):**
```typescript
import { sql } from "drizzle-orm";
...
const rows = pollOptions.map((opt) => ({
  pollId: poll.id,
  participantId: participant.id,
  optionId: opt.id,
  state: submittedByOption.get(opt.id) ?? "no",
}));

await db
  .insert(votes)
  .values(rows)
  .onConflictDoUpdate({
    target: [votes.participantId, votes.optionId],
    set: { state: sql`excluded.state` },
  });
```

**Token-verified ownership lookup (RESEARCH Pattern 5)** — mirrors `getPollByParticipantUrlId`'s exact-equality select-shape in `src/lib/db/queries.ts` lines 29-44:
```typescript
const participant = await getParticipantByEditToken(editToken);
if (!participant || participant.pollId !== poll.id) {
  notFound();
}
```
**Anti-pattern to avoid (per RESEARCH):** never accept a client-submitted `participantId` field as authoritative — always re-derive from the server-validated `editToken`.

Reuse the same poll-status guard and cookie-set-before-redirect blocks as `submitResponse` (re-set the cookie here too per RESEARCH Pitfall 4 recommendation, so editing via the link also refreshes the same-device cookie).

---

### `src/lib/db/queries.ts` (service, CRUD read — additive to existing file)

**Analog:** same file, `getPollByParticipantUrlId` (lines 24-44) — participant-safe column selection pattern:
```typescript
export async function getPollByParticipantUrlId(participantUrlId: string) {
  const [poll] = await db
    .select({
      id: polls.id,
      participantUrlId: polls.participantUrlId,
      title: polls.title,
      description: polls.description,
      location: polls.location,
      status: polls.status,
      createdAt: polls.createdAt,
    })
    .from(polls)
    .where(eq(polls.participantUrlId, participantUrlId))
    .limit(1);
  return poll ?? null;
}
```
**Apply to new helpers (D2-11 — never select `editToken` back out beyond what's needed; never select another participant's email into a multi-row payload):**
```typescript
export async function getParticipantByEditToken(editToken: string) {
  const [participant] = await db
    .select({
      id: participants.id,
      pollId: participants.pollId,
      name: participants.name,
      email: participants.email,
    })
    .from(participants)
    .where(eq(participants.editToken, editToken))
    .limit(1);
  return participant ?? null;
}

export async function getVotesForParticipant(participantId: string) {
  const rows = await db
    .select({ optionId: votes.optionId, state: votes.state })
    .from(votes)
    .where(eq(votes.participantId, participantId));
  return Object.fromEntries(rows.map((r) => [r.optionId, r.state]));
}
```
Existing `getOptionsForPoll` (lines 54-65) is reused as-is to get the authoritative option list for gap-filling.

---

### `src/components/availability-grid.tsx` (component, event-driven client state)

**Analog:** `/home/dave/repos/LFG/src/components/calendar-date-picker.tsx`

**Client-island state + emit-on-change pattern** (lines 1-54):
```typescript
"use client";
import { useEffect, useMemo, useState } from "react";
...
export function CalendarDatePicker({ disabled = false, onChange }: {...}) {
  const [days, setDays] = useState<Date[]>([]);
  const sorted = useMemo(() => buildDatesPayload(days, times), [days, times]);
  useEffect(() => {
    onChange(sorted);
  }, [sorted, onChange]);
  ...
```
**Apply to `AvailabilityGrid` (RESEARCH Pattern 4) — own a `Record<optionId, VoteState>` map, cycle/bulk-set it, emit via `onChange`:**
```typescript
"use client";
type VoteState = "yes" | "ifneedbe" | "no";
const CYCLE: VoteState[] = ["yes", "ifneedbe", "no"];

export function AvailabilityGrid({ options, initial, disabled, onChange }: {
  options: { id: string; date: string; startTime: string | null }[];
  initial?: Record<string, VoteState>;
  disabled?: boolean;
  onChange: (votes: { optionId: string; state: VoteState }[]) => void;
}) {
  const [cellState, setCellState] = useState<Record<string, VoteState>>(
    () => Object.fromEntries(options.map((o) => [o.id, initial?.[o.id] ?? "no"])),
  );
  useEffect(() => {
    onChange(Object.entries(cellState).map(([optionId, state]) => ({ optionId, state })));
  }, [cellState, onChange]);

  function cycleCell(optionId: string) {
    setCellState((prev) => {
      const next = CYCLE[(CYCLE.indexOf(prev[optionId]) + 1) % CYCLE.length];
      return { ...prev, [optionId]: next };
    });
  }
  function setAll(state: VoteState) {
    setCellState(Object.fromEntries(options.map((o) => [o.id, state])));
  }
  // bulk buttons: setAll("yes") / setAll("no") [Set all Not available] / setAll("no") [Clear]
  // per-cell <button onClick={() => cycleCell(o.id)} aria-label="...">
}
```

**Disabled-state pattern** — mirror `calendar-date-picker.tsx`'s `disabled` prop threading into `Calendar`/`Input`/`Button` (lines 95, 110, 117, 150, 159) for the read-only "voting closed" rendering.

**Date label rendering** — use `formatDateWithTime` exactly as `calendar-date-picker.tsx` uses `formatDateOnly` (line 24, 137): `formatDateWithTime(opt.date, opt.startTime ? opt.startTime.slice(0, 5) : null)` (matches the slicing already done in both `page.tsx` files, lines 39-41 of `src/app/p/[participantUrlId]/page.tsx`).

---

### `src/components/vote-form.tsx` (component, request-response form)

**Analog:** `/home/dave/repos/LFG/src/components/poll-create-form.tsx`

**`useActionState` + hidden-input serialization pattern** (lines 1-54):
```typescript
"use client";
import { useActionState, useId, useState } from "react";
import { createPoll, type CreatePollState } from "@/lib/actions/create-poll";
...
export function PollCreateForm() {
  const [state, formAction, isPending] = useActionState<CreatePollState, FormData>(createPoll, null);
  const [dates, setDates] = useState<DatePayloadEntry[]>([]);
  const datesPayload = JSON.stringify(dates);
  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="dates" value={datesPayload} />
      ...
```

**`FieldError` helper** (lines 19-26) — copy verbatim for both `submitResponse`/`updateResponse` field errors:
```typescript
function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  );
}
```

**Apply to `VoteForm` (RESEARCH Open Question 2 — single shared component parameterized by action/initial/readOnly):**
```typescript
"use client";
const [votes, setVotes] = useState<{ optionId: string; state: VoteState }[]>([]);
const votesPayload = JSON.stringify(votes);
// <input type="hidden" name="votes" value={votesPayload} />
// <AvailabilityGrid options={options} initial={priorVotes} disabled={isPending || readOnly} onChange={setVotes} />
// name/email <Input> fields styled exactly like poll-create-form.tsx's title/description fields (lines 56-118)
// <Button disabled={isPending}>{isPending ? "Saving..." : "Submit"}</Button> (mirrors line 128-136)
```
Parameterize over `action: typeof submitResponse | typeof updateResponse`, `initialVotes`, `initialName`, `initialEmail`, `readOnly: boolean` so both the participant page and the edit page reuse one component (per RESEARCH Open Question 2 recommendation).

---

### `src/app/p/[participantUrlId]/page.tsx` (route RSC, request-response — MODIFY)

**Analog A (current file, keep the shell):** `/home/dave/repos/LFG/src/app/p/[participantUrlId]/page.tsx` — keep the `getPollByParticipantUrlId` + `notFound()` + `getOptionsForPoll` + `formatDateWithTime` lines 1-45 verbatim; **replace** the static "Voting isn't available yet" block (lines 47-54) with `<VoteForm>`.

**Analog B (cookie-read + headers pattern):** `/home/dave/repos/LFG/src/app/a/[adminUrlId]/page.tsx` lines 9-10, 37-38 for the `await cookies()` / `await headers()` async-RSC pattern:
```typescript
import { headers } from "next/headers";
...
const h = await headers();
const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
```
**Apply (RESEARCH Pattern 3 read side):**
```typescript
import { cookies } from "next/headers";
...
const cookieStore = await cookies();
const editToken = cookieStore.get(`lfg_edit_${participantUrlId}`)?.value;
let priorVotes: Record<string, VoteState> | null = null;
let priorName = "", priorEmail = "";
if (editToken) {
  const participant = await getParticipantByEditToken(editToken);
  if (participant && participant.pollId === poll.id) {
    priorVotes = await getVotesForParticipant(participant.id);
    priorName = participant.name; priorEmail = participant.email ?? "";
  }
}
```
**Closed-poll guard:** check `poll.status !== "open"` and pass `readOnly` to `VoteForm`, with a notice block mirroring the existing "Voting isn't available yet" card markup (lines 47-54) repurposed as "Voting is closed for this poll."

---

### `src/app/p/[participantUrlId]/thanks/page.tsx` (route RSC, request-response — NEW)

**Analog:** `/home/dave/repos/LFG/src/app/a/[adminUrlId]/page.tsx` — the `headers()`/`resolveBaseUrl`/`buildParticipantUrl`/`CopyLinkButton` card pattern (lines 9-22, 36-40, 63-97):
```typescript
import { headers, cookies } from "next/headers";
import { resolveBaseUrl } from "@/lib/urls";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Card } from "@/components/ui/card";
...
const h = await headers();
const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
```
**Apply:** build the edit URL per D2-09: `${base}/p/${participantUrlId}/edit/${editToken}` (note: NOT `buildAdminUrl`/`buildParticipantUrl` — add a new `buildEditUrl(base, participantUrlId, editToken)` helper to `src/lib/urls.ts`, mirroring `buildAdminUrl`'s shape, lines 21-23):
```typescript
export function buildEditUrl(base: string, participantUrlId: string, editToken: string): string {
  return `${base.replace(/\/+$/, "")}/p/${participantUrlId}/edit/${editToken}`;
}
```
Read the just-set `editToken` from the cookie (`cookieStore.get(`lfg_edit_${participantUrlId}`)?.value`) — fall back to `notFound()` if absent (no direct-navigation-without-submit case). Render a `Card` exactly like the admin-link card (lines 81-97) with `<CopyLinkButton url={editUrl} label="Copy edit link" />` plus "bookmark this to change your answer" copy (D2-09).

---

### `src/app/p/[participantUrlId]/edit/[editToken]/page.tsx` (route RSC, request-response — NEW)

**Analog:** `/home/dave/repos/LFG/src/app/p/[participantUrlId]/page.tsx` (current shell) for the `notFound()` + poll-fetch RSC structure, combined with RESEARCH Pattern 5 token-verified lookup:
```typescript
const poll = await getPollByParticipantUrlId(participantUrlId);
if (!poll) notFound();
const participant = await getParticipantByEditToken(editToken);
if (!participant || participant.pollId !== poll.id) notFound();
const priorVotes = await getVotesForParticipant(participant.id);
const options = await getOptionsForPoll(poll.id);
```
Render the same `VoteForm` shared component, action=`updateResponse`, `initialVotes=priorVotes`, `readOnly={poll.status !== "open"}`.

## Shared Patterns

### No-interactive-transaction two-statement write
**Source:** `src/lib/actions/create-poll.ts` lines 120-149 (comment at lines 120-123 explains the constraint)
**Apply to:** `submitResponse` (insert participant with retry, then batched `insert(votes).values(rows)`)

### Unique-violation detection + bounded retry
**Source:** `src/lib/actions/create-poll.ts` lines 56-63, 126-140
**Apply to:** `submitResponse`'s `editToken` mint loop (attempt cap 4, same as poll/admin token loop)

### Zod safeParse → flattened field errors, no row created on failure
**Source:** `src/lib/actions/create-poll.ts` lines 84-98
**Apply to:** `submitResponse`/`updateResponse` (`{ errors: fieldErrors }` return shape consumed by `useActionState`)

### Participant-safe column selection (never select `admin_url_id`/excess fields)
**Source:** `src/lib/db/queries.ts` lines 29-44 (`getPollByParticipantUrlId`)
**Apply to:** `getParticipantByEditToken`, `getVotesForParticipant` — explicit `.select({...})` column lists, never `.select()` bare

### Timezone-safe date rendering
**Source:** `src/lib/format-date.ts` `formatDateWithTime` (lines 58-67), used identically in both `page.tsx` files (admin lines 55-58, participant lines 39-41)
**Apply to:** `AvailabilityGrid` cell labels — always `formatDateWithTime(opt.date, opt.startTime ? opt.startTime.slice(0,5) : null)`, never `new Date(opt.date)`

### Absolute URL construction (env-first, header fallback)
**Source:** `src/lib/urls.ts` (whole file) + usage in `src/app/a/[adminUrlId]/page.tsx` lines 37-40
**Apply to:** `/thanks` edit-link construction — add `buildEditUrl` following `buildAdminUrl`'s exact shape

### Copy-to-clipboard with success-only-on-resolve
**Source:** `src/components/copy-link-button.tsx` (whole file, 44 lines)
**Apply to:** `/thanks` edit-link surfacing — reused as-is, no modification needed

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `updateResponse`'s `onConflictDoUpdate` upsert call | service | CRUD (atomic replace) | No Phase 1 action performs an upsert; pattern sourced from Drizzle official docs (orm.drizzle.team/docs/guides/upsert) instead of a codebase analog — see RESEARCH.md Pattern 2 |
| Cookie set/read split (Server Action write → RSC read) | cross-cutting | event-driven | No Phase 1 code sets cookies; pattern sourced from Next.js official docs (nextjs.org/docs/app/api-reference/functions/cookies) — see RESEARCH.md Pattern 3 |

## Metadata

**Analog search scope:** `src/lib/`, `src/components/`, `src/app/p/`, `src/app/a/`
**Files scanned:** 10 (schema.ts, create-poll.ts, queries.ts, tokens.ts, poll-create-form.tsx, calendar-date-picker.tsx, format-date.ts, copy-link-button.tsx, urls.ts, both page.tsx route files) + create-poll.test.ts
**Pattern extraction date:** 2026-06-30

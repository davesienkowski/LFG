# Phase 2: Participant Voting - Research

**Researched:** 2026-06-30
**Domain:** Next.js 16 Server Actions + Drizzle (neon-http/node-postgres dual driver) upsert patterns; httpOnly cookie read/write across RSC + Server Action; client-island form state for a 3-state grid
**Confidence:** HIGH

## Summary

Phase 2 is a pure extension of patterns Phase 1 already established and proved in production — no new libraries, no new architectural shape. The two genuinely new techniques are (1) a Postgres `INSERT ... ON CONFLICT (participant_id, option_id) DO UPDATE` upsert for `updateResponse`, and (2) writing an httpOnly cookie inside a Server Action and reading it back in a Server Component on a subsequent navigation. Both are verified against official sources at the exact installed versions (Drizzle 0.45.2, Next.js 16.2.9) and require no new dependencies.

The write-strategy constraint carried from Phase 1 (`neon-http` has no interactive/callback transactions) is **not actually a transaction problem here**: `onConflictDoUpdate` compiles to a single atomic SQL statement (`INSERT ... ON CONFLICT ... DO UPDATE`), which Postgres executes atomically without an app-level transaction wrapper. This is the correct replace-semantics tool for `updateResponse` and is fully compatible with both drivers. `submitResponse` mirrors `createPoll` exactly: one row insert (with the existing token-collision retry) followed by one batched `values([...])` insert — no upsert needed there because the participant is brand new and cannot conflict.

**Primary recommendation:** Add `participants`/`votes` to the existing single `schema.ts`, run `drizzle-kit generate` + `drizzle-kit migrate` against local Docker Postgres (and, before any production deploy of this phase's code, against the already-live Neon database — see Pitfall 6), build `submitResponse`/`updateResponse` as two-statement no-transaction actions mirroring `create-poll.ts`, and reuse every existing UI/data-access pattern (hidden-input + `useActionState`, participant-safe column selection, `notFound()` for bad tokens, `format-date.ts` for rendering).

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D2-01:** `participants` table: `id` (uuid PK), `poll_id` (uuid FK → polls, cascade delete), `name` (text not null), `email` (text, nullable — collected for Phase 4, not sent now), `edit_token` (text not null, **unique**), `created_at` (timestamptz default now).
- **D2-02:** `votes` table: `id` (uuid PK), `poll_id` (uuid FK → polls, cascade — denormalized so Phase 3 can aggregate by poll with a single index), `participant_id` (uuid FK → participants, cascade), `option_id` (uuid FK → options, cascade), `state` (text not null). **Unique `(participant_id, option_id)`**. Indexes on `votes(poll_id)` and `votes(participant_id)`.
- **D2-03:** `state` is stored as **text** constrained to `'yes' | 'ifneedbe' | 'no'` by Zod at the action boundary — NOT a Postgres enum.
- **D2-04:** `submitResponse` mirrors `createPoll`: insert the `participants` row (retry on edit-token unique collision, same pattern as `createPoll`'s token retry), then insert ALL vote rows in **one batched insert**. Two statements, no interactive transaction. Untouched options written `state = 'no'`.
- **D2-05:** `updateResponse` uses a **single `insert(votes).values(allRows).onConflictDoUpdate({ target: [participant_id, option_id], set: { state } })`** upsert. One atomic statement → idempotent and race-safe without an interactive transaction.
- **D2-06:** Per-cell **click-to-cycle**: Available (`yes`) → If-need-be (`ifneedbe`) → Not available (`no`) → back. VOTE-07 bulk buttons ("Set all Available", "Set all Not available", "Clear" → reset all to `no`) sit above the grid; a later per-cell click overrides only that cell.
- **D2-07:** `AvailabilityGrid` is a `"use client"` island holding state, serialized into a hidden input (mirrors `poll-create-form`'s `dates` input); the form posts via `useActionState`.
- **D2-08:** On successful submit, set an **httpOnly** cookie holding the participant's `edit_token` (e.g. `lfg_edit_<pollId>`), `SameSite=Lax`, long `maxAge`. The participant page (RSC) reads it via `next/headers` `cookies()`; if it resolves to a participant of THIS poll, preload that response into the grid. The cookie is convenience only — **the `edit_token` stored on the row is the sole authority** for edits.
- **D2-09:** `/thanks` reuses `CopyLinkButton` to present the absolute edit URL `${BASE}/p/<participantUrlId>/edit/<editToken>`, built from `NEXT_PUBLIC_BASE_URL` with the header fallback (D-10 pattern), plus "bookmark this to change your answer" guidance.
- **D2-10:** Zod schemas validate `submitResponse`/`updateResponse` server-side: `name` (trim, 1–100), `email` (optional; if present valid + ≤200), and a `votes` array of `{ optionId, state ∈ enum }`. Actions live in `src/lib/actions/` (`submit-response.ts`, `update-response.ts`). Bad/unknown participant or edit token → `notFound()` (404, D-08); a non-`open` poll → read-only render + server-side write rejection.
- **D2-11:** `edit_token` is minted by the existing `generateToken()` (`nanoid(21)`), a third independent token. Edit/thanks queries select participant-safe columns only — `admin_url_id` never reaches these surfaces.

### Claude's Discretion

- Exact grid cell visuals (colors/icons), the hidden-input serialization format, cookie name/maxAge specifics, and whether the edit route reuses the participant page component or is a sibling — left to planner/executor, provided D2-04/05 (no interactive txn), D2-08 (cookie ≠ authority), and the SPEC acceptance criteria + prohibitions hold.
- **UI design contract recommended:** a `/gsd-ui-phase 2` pass before execution would lock the grid's three-state visual language and a11y; plan-phase may insert it per config.

### Deferred Ideas (OUT OF SCOPE)

- Sending the edit link by email (VOTE-04) — Phase 4.
- The "Book it" / close-poll write that flips `status` — Phase 4 (this phase only honors a closed status read-only).
- Vote-spam / rate limiting — ops concern, not MVP.
- Organizer adds their own availability row (ORG-01) — v2.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VOTE-01 | Anonymous access & submit, 404 on unknown participant token | `submitResponse` mirrors `createPoll`'s no-txn write pattern (Code Examples §1); participant page already 404s via `getPollByParticipantUrlId` + `notFound()` |
| VOTE-02 | Exactly one state per `(participant, option)`, untouched = `no` | `votes` unique `(participant_id, option_id)`; server-side gap-fill so every poll option always gets a row even if the client array is incomplete (Pitfall 3) |
| VOTE-03 | Identity capture + independent edit token | Reuse `generateToken()` + the existing unique-violation retry helper (`isUniqueViolation`) from `create-poll.ts` |
| VOTE-05 | Self-edit while open; same-device cookie auto-load | `onConflictDoUpdate` upsert (Code Examples §2) for idempotent replace; `cookies()` read/write verified against Next.js 16.2.9 official docs (Code Examples §3/§4) |
| VOTE-06 | Token-verified ownership, exact match only | `getParticipantByEditToken` exact-equality lookup + cross-check against route's `participantUrlId` (Code Examples §5) |
| VOTE-07 | Bulk row actions (Set all / Clear) | Client-island state pattern (Code Examples §6) — bulk sets local state map, hidden input serializes final per-cell state, no server change needed |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Three-state vote capture (click-to-cycle + bulk) | Browser / Client | API / Backend | `AvailabilityGrid` owns interaction state client-side; `submitResponse`/`updateResponse` are the only writers of record |
| Identity capture (name/email form) | API / Backend | Browser / Client | Zod validation is the authority (server-enforced); the form is presentation only |
| Vote + participant persistence | Database / Storage | API / Backend | `participants`/`votes` tables own the durable state; actions are the only write path |
| Same-device auto-load | Frontend Server (SSR) | Browser / Client | The RSC reads the httpOnly cookie server-side and preloads grid state as initial props; the cookie itself is client-stored but never read by client JS (httpOnly) |
| Token-verified ownership (edit route guard) | API / Backend | — | `updateResponse` and the edit route RSC both perform the exact-token lookup server-side; never trust a client-supplied "I own this" flag |
| Poll-closed read-only enforcement | API / Backend | Frontend Server (SSR) | Server rejects the write regardless of UI state (SPEC: "server-enforced, not UI-only"); the RSC additionally renders a disabled form for UX |
| Routing (`/thanks`, `/edit/[editToken]`) | Frontend Server (SSR) | — | Next.js App Router resolves these server-side before any client code runs |

## Standard Stack

### Core
No new libraries. This phase extends the existing stack with zero new dependencies.

| Library | Version (installed) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | 0.45.2 [VERIFIED: npm registry] | `onConflictDoUpdate` upsert for `updateResponse` | Already the project's ORM; composite-target upsert is a documented, first-class feature, not a workaround |
| next | 16.2.9 [VERIFIED: npm registry] | `cookies()` from `next/headers` for the same-device auto-load | Already the project's framework; `cookies()` is the only supported way to read/write request cookies in App Router |
| zod | 4.4.3 [VERIFIED: npm registry] | `submitResponse`/`updateResponse` validation, vote-state enum | Already the project's validation library (used in `create-poll.ts`) |
| nanoid | 5.1.16 [VERIFIED: npm registry] | `editToken` generation via the existing `generateToken()` wrapper | Already the project's token generator (D-07); reused as-is per D2-11 |

### Supporting
None — no new supporting libraries required.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `onConflictDoUpdate` upsert for edits | Delete-then-insert in an app-level "transaction" | Rejected by D2-05: neon-http has no interactive/callback transactions in production; delete-then-insert without a real transaction has a race window (a concurrent request could read a transient empty state) |
| httpOnly cookie for same-device auto-load | `localStorage` (client-only) | Rejected by D2-08: localStorage requires a client-side fetch to look up the response, costing a network round trip and an extra loading state; the RSC cookie read preloads in the same request that renders the page |
| `state` as Postgres native enum | `state` as text + Zod enum (chosen, D2-03) | Native enum gives DB-level constraint enforcement but `ALTER TYPE ... ADD VALUE` migrations are awkward in Postgres and the project already established the text+Zod precedent with `polls.status` |

**Installation:**
```bash
# No installation needed — all required packages are already in package.json
```

**Version verification:** All four packages were re-confirmed via `npm view <pkg> version` against the live npm registry during this research session (drizzle-orm 0.45.2, next 16.2.9 — both match `package.json` exactly, no drift since Phase 1).

## Package Legitimacy Audit

**Not applicable.** This phase introduces zero new external packages — it extends `participants`/`votes` schema, server actions, and UI components entirely within the existing, already-audited Phase 1 dependency set (`drizzle-orm`, `next`, `zod`, `nanoid`, `@neondatabase/serverless`, `pg`). See `.planning/phases/01-foundation-poll-creation/01-RESEARCH.md` for that audit. No `slopcheck` run was needed.

## Architecture Patterns

### System Architecture Diagram

```
Participant visits /p/[participantUrlId]
        │
        ▼
RSC: getPollByParticipantUrlId(token)  ──404 if miss──▶ notFound()
        │ (poll found, participant-safe columns only)
        ▼
RSC: cookies().get("lfg_edit_<participantUrlId>")
        │
        ├─ cookie present ──▶ getParticipantByEditToken(token)
        │                         │ (verify participant.pollId === poll.id)
        │                         ▼
        │                    getVotesForParticipant(participantId)
        │                         │
        │                         ▼
        │                    preload grid initial state
        │
        └─ cookie absent/invalid ──▶ grid starts blank (all "no" / untouched)
        │
        ▼
Render: <form action={submitResponse}>
          name input, email input,
          <AvailabilityGrid> (client island: per-cell cycle + bulk buttons)
          hidden input "votes" = JSON.stringify(cellStateMap)
        ▼
Submit ──▶ submitResponse(prevState, formData)
              │
              ├─ Zod validate name/email/votes
              ├─ re-fetch poll by participantUrlId, check status === 'open'
              │      (server-enforced; reject write if closed)
              ├─ INSERT participants (retry on edit_token collision)
              ├─ build full vote-row set: every poll option gets a row,
              │      gap-filled to 'no' if the client omitted it
              ├─ INSERT votes (single batched insert — no upsert needed,
              │      participant is brand new, cannot conflict)
              ├─ cookies().set("lfg_edit_<participantUrlId>", editToken,
              │      { httpOnly, sameSite: "lax", path: "/p/<id>", maxAge })
              └─ redirect("/p/[participantUrlId]/thanks")
                     │
                     ▼
              RSC: cookies().get(...) → editToken
                     │
                     ▼
              build absolute edit URL, render <CopyLinkButton>

Participant returns via bookmarked edit link
        │
        ▼
/p/[participantUrlId]/edit/[editToken]
        │
        ▼
RSC: getPollByParticipantUrlId(participantUrlId) ──404 if miss──▶ notFound()
RSC: getParticipantByEditToken(editToken)         ──404 if miss
        OR participant.pollId !== poll.id──────────▶ notFound()
        │
        ▼
getVotesForParticipant(participantId) → preload grid
        ▼
Render: <form action={updateResponse}> (read-only fieldset if poll.status !== 'open')
        ▼
Submit ──▶ updateResponse(prevState, formData)
              │
              ├─ Zod validate
              ├─ re-resolve participant by editToken (server-side, not trusting client)
              ├─ check poll.status === 'open' (reject write if closed)
              ├─ build full vote-row set (gap-filled to 'no')
              └─ INSERT votes ... ON CONFLICT (participant_id, option_id)
                     DO UPDATE SET state = excluded.state
                     (single atomic statement, idempotent, race-safe)
```

### Recommended Project Structure
```
src/
├── lib/
│   ├── db/
│   │   ├── schema.ts        # + participants, votes tables
│   │   └── queries.ts       # + getParticipantByEditToken, getVotesForParticipant
│   └── actions/
│       ├── submit-response.ts   # new — VOTE-01/02/03
│       └── update-response.ts   # new — VOTE-05/06
├── components/
│   ├── availability-grid.tsx    # new — "use client" island (VOTE-02/06/07)
│   └── vote-form.tsx            # new — wraps name/email + AvailabilityGrid + useActionState
└── app/
    ├── p/[participantUrlId]/
    │   ├── page.tsx              # extend — replace placeholder with vote-form
    │   ├── thanks/page.tsx       # new — VOTE-01/05 (edit link + cookie read)
    │   └── edit/[editToken]/
    │       └── page.tsx          # new — VOTE-05/06
```

### Pattern 1: No-Interactive-Transaction Insert (submitResponse)
**What:** Two sequential statements, no callback transaction — exactly the `createPoll` shape.
**When to use:** Any write under the `neon-http` production driver, which has no interactive/callback transaction support.
**Example:**
```typescript
// Source: adapted from src/lib/actions/create-poll.ts (existing, proven pattern)
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

// Gap-fill: every poll option gets exactly one row, defaulting to 'no'.
const submittedByOption = new Map(votesInput.map((v) => [v.optionId, v.state]));
const rows = pollOptions.map((opt) => ({
  pollId: poll.id,
  participantId: participantId as string,
  optionId: opt.id,
  state: submittedByOption.get(opt.id) ?? "no",
}));

await db.insert(votes).values(rows); // single batched insert, new participant cannot conflict
```

### Pattern 2: Atomic Upsert Replace (updateResponse)
**What:** `INSERT ... ON CONFLICT (target) DO UPDATE` as the entire replace operation — one round trip, no transaction wrapper.
**When to use:** Any time an edit must replace a fixed set of rows under `neon-http`.
**Example:**
```typescript
// Source: Drizzle ORM official docs — orm.drizzle.team/docs/guides/upsert
// [CITED: orm.drizzle.team/docs/guides/upsert] verified against drizzle-orm@0.45.2
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
    target: [votes.participantId, votes.optionId], // MUST match the unique() constraint's exact column set
    set: { state: sql`excluded.state` },
  });
```
**Critical detail:** Postgres requires `ON CONFLICT (col_a, col_b)` to name a column set that has an existing unique index/constraint. The Drizzle `target` array must reference the same columns declared in the schema's `unique("votes_participant_option_unique").on(t.participantId, t.optionId)` — if they don't match exactly, Postgres raises `there is no unique or exclusion constraint matching the ON CONFLICT specification` at write time, not at compile time. [VERIFIED: drizzle-orm 0.45.2 docs example uses the identical `target: [colA, colB]` shape for a composite unique constraint]

### Pattern 3: httpOnly Cookie Write in a Server Action, Read in an RSC
**What:** Set the cookie inside the same Server Action that performs the write, before calling `redirect()`; read it in the destination page's Server Component.
**When to use:** Same-device auto-load without trusting client JS to store the credential (VOTE-05's cookie-as-convenience requirement).
**Example:**
```typescript
// Source: nextjs.org/docs/app/api-reference/functions/cookies (Next.js 16.2.9, matches installed version)
// [CITED: nextjs.org/docs/app/api-reference/functions/cookies]
"use server";
import { cookies } from "next/headers";

export async function submitResponse(prevState, formData) {
  // ...validate, insert participant + votes...
  const cookieStore = await cookies(); // cookies() is async in 16.2.9 — must await
  cookieStore.set({
    name: `lfg_edit_${poll.participantUrlId}`, // public token, not the internal pollId (see Pitfall 7)
    value: editToken,
    httpOnly: true,
    sameSite: "lax",
    path: `/p/${poll.participantUrlId}`, // scopes the cookie to this poll's participant path (SPEC constraint)
    maxAge: 60 * 60 * 24 * 365, // 1 year — "long maxAge" per D2-08, exact value at planner discretion
  });
  redirect(`/p/${poll.participantUrlId}/thanks`); // Set-Cookie header ships on this redirect response
}
```
```typescript
// Reading it back — any Server Component on a request that carries the cookie
import { cookies } from "next/headers";

export default async function ParticipantPage({ params }) {
  const { participantUrlId } = await params;
  const poll = await getPollByParticipantUrlId(participantUrlId);
  if (!poll) notFound();

  const cookieStore = await cookies();
  const editToken = cookieStore.get(`lfg_edit_${participantUrlId}`)?.value;
  let priorVotes: Record<string, VoteState> | null = null;
  if (editToken) {
    const participant = await getParticipantByEditToken(editToken);
    if (participant && participant.pollId === poll.id) {
      priorVotes = await getVotesForParticipant(participant.id);
    }
  }
  // pass priorVotes as AvailabilityGrid's initial state
}
```
**Why `cookies().set()` must run inside the Server Action, not the RSC:** Next.js explicitly disallows setting cookies during Server Component rendering — "Setting cookies is not supported during Server Component rendering" — because HTTP cannot set a `Set-Cookie` header after the response has started streaming. [CITED: nextjs.org/docs/app/api-reference/functions/cookies]

### Pattern 4: Client-Island Hidden-Input Serialization (AvailabilityGrid)
**What:** The grid owns a per-option state map in `useState`; bulk buttons overwrite the whole map; a single per-cell click overwrites one key; the map serializes to a hidden JSON input, mirroring `dates` in `poll-create-form.tsx`.
**When to use:** Any client-island form input that needs to post a structured value through a plain HTML form action.
**Example:**
```typescript
// Source: adapted from src/components/poll-create-form.tsx + calendar-date-picker.tsx (existing pattern)
"use client";
type VoteState = "yes" | "ifneedbe" | "no";
const CYCLE: VoteState[] = ["yes", "ifneedbe", "no"];

export function AvailabilityGrid({
  options,
  initial,
  disabled,
  onChange,
}: {
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

  // render: bulk buttons call setAll("yes") / setAll("no") / setAll("no") [Clear],
  // per-cell <button onClick={() => cycleCell(o.id)}> with aria-label describing
  // current state (e.g. "Saturday, July 12: Available. Click to change.")
}
```
The surrounding form (mirroring `poll-create-form.tsx`):
```typescript
const [votes, setVotes] = useState<{ optionId: string; state: VoteState }[]>([]);
const votesPayload = JSON.stringify(votes);
// <input type="hidden" name="votes" value={votesPayload} />
// <AvailabilityGrid options={options} initial={priorVotes} onChange={setVotes} disabled={isPending} />
```

### Pattern 5: Token-Verified Ownership Lookup
**What:** Resolve the participant by exact `edit_token` equality, then cross-check against the route's `participantUrlId` to reject a token used on the wrong poll's edit URL.
**When to use:** Both the edit-route RSC (for 404 / pre-fill) and `updateResponse` (for the write itself) — never trust a client-supplied participant ID; always re-derive ownership from the token server-side.
**Example:**
```typescript
// Source: adapted from src/lib/db/queries.ts getPollByParticipantUrlId pattern
export async function getParticipantByEditToken(editToken: string) {
  const [participant] = await db
    .select({
      id: participants.id,
      pollId: participants.pollId,
      name: participants.name,
      email: participants.email,
      // editToken intentionally NOT re-selected into payloads beyond what's needed
    })
    .from(participants)
    .where(eq(participants.editToken, editToken))
    .limit(1);
  return participant ?? null;
}

// In the edit route RSC AND in updateResponse:
const participant = await getParticipantByEditToken(editToken);
if (!participant || participant.pollId !== poll.id) {
  notFound(); // covers: unknown token, empty token, right token/wrong poll URL
}
```

### Anti-Patterns to Avoid
- **Trusting a client-submitted `participantId` for `updateResponse`:** Always re-derive the participant from the server-validated `editToken`; never accept a hidden `participantId` field as authoritative — that reopens VOTE-06.
- **Wrapping the upsert in a hand-rolled "transaction" via multiple round trips:** `neon-http` has no interactive transactions; `onConflictDoUpdate` is already atomic as a single statement — don't add delete-then-insert logic around it.
- **Setting the cookie from the RSC:** Will throw/no-op silently depending on context; cookies can only be set in a Server Action or Route Handler.
- **Letting the client array of votes be the sole source of which options exist:** Always iterate the server's authoritative `pollOptions` list and gap-fill, never iterate the client-submitted array (a buggy or malicious client could omit options or submit votes for options from a different poll).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Replace-on-edit semantics | Manual delete-then-reinsert with app-level locking | `insert(...).onConflictDoUpdate({ target, set })` | Single atomic SQL statement; correctly race-safe and idempotent without transactions, which the production driver doesn't support |
| Three-state representation | Two booleans (`isAvailable`, `isTentative`) or a 0/1/2 integer | A string union `'yes' \| 'ifneedbe' \| 'no'` validated by Zod | Matches the project's existing `polls.status` text precedent (D-05); self-documenting in SQL and in the wire payload; avoids a 4th invalid combination that two booleans permit |
| Cookie-based credential storage | Hand-rolled signed cookie or JWT for the edit token | Plain httpOnly cookie holding the raw `edit_token`, with the DB row as the sole authority | The token itself is already a 126-bit random opaque secret (nanoid); a signature/JWT wrapper adds complexity without adding security since the DB lookup re-validates on every write regardless |
| Form state → server payload bridge | A client-side fetch/AJAX submit with manual error state | The existing `useActionState` + hidden-input-JSON pattern from `poll-create-form.tsx` | Already proven in this codebase; gets progressive enhancement, built-in pending state, and consistent field-error rendering for free |
| Token-collision retry | A new bespoke retry loop for `editToken` | The exact `isUniqueViolation` + retry-with-attempt-cap loop already in `create-poll.ts` | Same astronomically-improbable collision case (nanoid(21) unique constraint); duplicating the loop verbatim is the path of least risk |

**Key insight:** Every "new" technique this phase needs (atomic upsert, cookie set/read split across action/RSC) is a single, well-documented primitive in the already-installed stack — the temptation to hand-roll usually appears when a developer reaches for a transaction or a client-side state library before checking whether the existing single-statement/RSC-prop pattern already covers the case.

## Common Pitfalls

### Pitfall 1: `ON CONFLICT` target/constraint mismatch
**What goes wrong:** `onConflictDoUpdate({ target: [...] })` silently compiles to valid-looking TypeScript but Postgres rejects it at runtime with `there is no unique or exclusion constraint matching the ON CONFLICT specification` if the named columns don't exactly match an existing unique constraint or index.
**Why it happens:** The schema's `unique()` builder and the action's `target` array are written independently and can drift (e.g., one references `optionId, participantId` and the other `participantId, optionId` — order doesn't matter for matching, but a column actually being part of a *different* index does).
**How to avoid:** Define the migration first (`unique("votes_participant_option_unique").on(t.participantId, t.optionId)`), generate the migration, verify the constraint exists via `psql \d votes`, THEN write the action's `target` referencing the same two columns.
**Warning signs:** A 500 error specifically on `updateResponse` (not `submitResponse`, since that path never hits `onConflictDoUpdate`) that doesn't reproduce in unit tests against a schema that wasn't actually migrated.

### Pitfall 2: Untouched options not gap-filled server-side
**What goes wrong:** If the server trusts the client's submitted `votes` array as complete, a buggy client (or an option added mid-session, or a client bug that drops a row) could submit fewer vote rows than poll options, violating "every option has exactly one vote row" (VOTE-02 AC).
**Why it happens:** It's tempting to do `db.insert(votes).values(votesInput.map(...))` directly off the parsed Zod array.
**How to avoid:** Always iterate the SERVER's authoritative `pollOptions` (from `getOptionsForPoll`), and look up each option's state from the client array, defaulting to `'no'` (Patterns 1 & 2 above already do this).
**Warning signs:** A test that submits a grid with one option left at its default (un-clicked) and asserts `votes.length === options.length` after submit; this fails if the gap-fill logic isn't server-side.

### Pitfall 3: `cookies()` is async in Next.js 16 — forgetting `await`
**What goes wrong:** `cookies()` returns a `Promise` (final non-deprecated behavior as of Next.js 15+); omitting `await` yields a `Promise` object instead of the cookie store, and `.get()`/`.set()` calls on it fail or are silently no-ops depending on TypeScript strictness.
**Why it happens:** Older Next.js (pre-15) had `cookies()` as synchronous; muscle memory or copy-pasted older examples skip the `await`.
**How to avoid:** Always `const cookieStore = await cookies();` in both the Server Action and the RSC. [VERIFIED: nextjs.org/docs/app/api-reference/functions/cookies, version 16.2.9 — "cookies is an asynchronous function that returns a promise"]
**Warning signs:** TypeScript error "Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>'" — a compile-time catch, not a silent runtime bug, if `strict` mode is on (it is, per the project's TypeScript 6.0.3 setup).

### Pitfall 4: Cookie set in the wrong place (RSC instead of Server Action)
**What goes wrong:** Calling `cookieStore.set()` from a Server Component throws at request time ("Cookies can only be modified in a Server Action or Route Handler").
**Why it happens:** It's natural to think "the participant page is where I want to set up the cookie" — but the SET must happen at submit time, in the action, not at render time.
**How to avoid:** Set the cookie inside `submitResponse` (and, for consistency, re-set it inside `updateResponse` too, so editing via the link also refreshes the same-device cookie) — never in `page.tsx`.
**Warning signs:** A runtime error only on the FIRST render after deploy/restart, not caught by `next build` type-checking (this is a documented App Router runtime constraint, not a type error).

### Pitfall 5: Token comparison and timing — already resolved by SPEC, don't re-litigate
**What goes wrong:** A reviewer might flag `WHERE edit_token = $1` as needing a constant-time comparison to prevent timing-based token guessing.
**Why it happens:** General security guidance (OWASP) recommends constant-time comparison for secret-equality checks.
**How to avoid:** SPEC's Edge Coverage table already resolved this explicitly: "Token compared as exact string (DB equality); 126-bit random — constant-time compare unwarranted." A 126-bit random token defeats timing-based brute force regardless of comparison method (the entropy, not the comparison algorithm, is the defense) — implement the lookup as a normal Drizzle `eq()` WHERE clause; do not add a hand-rolled constant-time string compare. This is canon-settled; the planner should not introduce extra complexity here.
**Warning signs:** N/A — flagging only so the planner doesn't second-guess this and add unnecessary complexity.

### Pitfall 6: Production (Vercel/Neon) is already live — new tables need a Neon migration before/at deploy
**What goes wrong:** Phase 1 already deployed to production (`https://looking-for-group-eight.vercel.app`, per STATE.md and the README's documented deploy runbook). If Phase 2's code is deployed without first running `drizzle-kit migrate` against the Neon connection string, every `submitResponse`/`updateResponse` call (and any query referencing `participants`/`votes`) will fail with "relation does not exist" in production, even though local Docker Postgres is fine.
**Why it happens:** Phase 1's plan had an explicit final "deploy" task (01-03); Phase 2's ROADMAP only lists two plans (schema+grid+submit+view+thanks, and edit-route+ownership) with no explicit "deploy" plan step — easy to assume deploy is out of scope for Phase 2 when actually the existing production deployment makes a Neon migration step mandatory before/at the next deploy.
**How to avoid:** Follow the exact runbook already documented in `README.md` §"Deploy (Vercel + Neon, free tier)" step 2: `DATABASE_URL="<neon-pooled-url>" npm run db:migrate` BEFORE the next `vercel --prod` deploy that ships Phase 2 code. The planner should include this as an explicit task (mirroring 01-03's "[BLOCKING] Apply the EXISTING migrations... to Neon BEFORE the app serves traffic" pattern), even if it's the last task of 02-02 rather than its own plan.
**Warning signs:** A 500 on the live site after deploy, with local dev working perfectly — classic "schema drift between environments" signature.

### Pitfall 7: Don't leak the internal `poll.id` (UUID PK) into client-visible artifacts
**What goes wrong:** CONTEXT's D2-08 example cookie name is `lfg_edit_<pollId>` — using the literal internal Drizzle-generated UUID primary key. While not exploitable (it's a random `gen_random_uuid()`, not sequential or derivable), the project's established convention (D-09/P2) is that internal primary keys never appear in any client-visible surface — only `participantUrlId`/`adminUrlId`/`editToken` are meant to be public-facing identifiers.
**Why it happens:** `pollId` is the most readily-available identifier inside the action/RSC code (it's what every query already joins on), so it's the path of least resistance to drop into a cookie name.
**How to avoid:** Use `participantUrlId` (already public — it's literally in the URL the cookie is scoped to) in the cookie name instead: `lfg_edit_${poll.participantUrlId}`, as shown in Code Examples §3. This also makes the cookie's `path` scoping (`/p/${participantUrlId}`) and its name consistent and human-debuggable in browser devtools without exposing an internal-only identifier.
**Warning signs:** None functional — this is a hygiene/consistency recommendation, not a blocking security issue. Flagged because D2-08's "e.g." cookie name example used the internal ID; the planner should follow the corrected example here, not the literal CONTEXT.md example string.

### Pitfall 8: `/thanks` route nesting — must be under `/p/[participantUrlId]/` for the cookie to be sent
**What goes wrong:** SPEC and ROADMAP both refer to the route casually as "`/thanks`" without specifying nesting. If implemented as a bare top-level `/thanks` route, it cannot receive the `path`-scoped cookie (D2-08: "scopes to the participant path") on the redirect navigation, and has no way to know which poll/participant to look up without smuggling identifiers into a query string.
**Why it happens:** The SPEC's prose shorthand ("lands on `/thanks`") doesn't specify the full path; the ROADMAP plan description similarly just says "`/thanks` (edit link + same-device cookie)".
**How to avoid:** Implement as `/p/[participantUrlId]/thanks` (nested, nginx-pattern-route under the existing participant segment). This (a) keeps the cookie's `path` scope (`/p/${participantUrlId}`) actually matching the destination route so the just-set cookie is present on the very next request, (b) gives the RSC the `participantUrlId` it needs to look up the poll and build the absolute edit URL without any query-string parameters, and (c) avoids putting the raw `editToken` in a URL (query string), keeping it confined to the httpOnly cookie and the final bookmarked edit-link body content. This is flagged as a discretionary recommendation, not a locked decision — but it directly satisfies D2-08's "scopes to the participant path" language, so deviating from it would need an explicit justification.
**Warning signs:** None at build time — only surfaces as "the auto-load doesn't work" or "I had to add a query param with the token in it" during implementation, which is itself a sign the route nesting choice should be revisited.

## Code Examples

See Architecture Patterns §1–§5 above for the load-bearing examples (no-transaction insert, atomic upsert, cookie set/read, hidden-input serialization, token-verified lookup) — all five are pulled out there because each directly implements one of D2-04 through D2-11.

### Read helper additions to `src/lib/db/queries.ts`
```typescript
// Source: pattern matches existing getOptionsForPoll / getPollByParticipantUrlId
export async function getVotesForParticipant(participantId: string) {
  const rows = await db
    .select({ optionId: votes.optionId, state: votes.state })
    .from(votes)
    .where(eq(votes.participantId, participantId));
  return Object.fromEntries(rows.map((r) => [r.optionId, r.state]));
}
```

### Poll-status guard (shared by both actions)
```typescript
// Re-fetch the poll's CURRENT status server-side at write time — never trust a
// status value passed through hidden form fields, since the page could have
// been rendered before the organizer closed the poll.
const poll = await getPollByParticipantUrlId(participantUrlId);
if (!poll) notFound();
if (poll.status !== "open") {
  return { errors: { _form: ["Voting is closed for this poll."] } };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `cookies()` synchronous read in Server Components | `cookies()` async, must `await` | Next.js 15.0.0-RC (carried into 16.x) | Every `cookies()` call site in this phase must `await` it; TypeScript catches omissions under `strict` |

**Deprecated/outdated:** None relevant — Drizzle's `onConflictDoUpdate` and Next.js's `cookies()` API shape used here are both current stable APIs at the installed versions, not legacy patterns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `/thanks` should be nested as `/p/[participantUrlId]/thanks` rather than a bare top-level route | Pitfall 8, Recommended Project Structure | Low — if the planner instead chooses a bare `/thanks` with query-string params, the cookie path-scoping and token-in-URL tradeoffs change; doesn't block VOTE-01/05 functionally, just changes the cookie/URL hygiene story |
| A2 | Cookie name should use `participantUrlId` rather than the literal `pollId` example from CONTEXT D2-08 | Pitfall 7, Pattern 3 | Low — functionally cookie name choice doesn't affect any acceptance criterion; this is a hygiene recommendation that deviates from CONTEXT's literal example text (which was explicitly marked "e.g.") |
| A3 | The Neon production migration step for this phase's new tables should be an explicit blocking task before the next prod deploy | Pitfall 6 | Medium — if skipped, the next production deploy of Phase 2 code will 500 on every vote-related request until someone notices and runs the migration; doesn't affect local dev or automated tests |

## Open Questions

1. **Exact route nesting for `/thanks` and cookie `maxAge`/`path` values**
   - What we know: SPEC/ROADMAP name the route "`/thanks`" without full path; D2-08 says "scopes to the participant path" and "long maxAge" without exact values.
   - What's unclear: Whether the planner/UI-phase will choose the nested path recommended in Pitfall 8, and the exact `maxAge` (1 year suggested above is a reasonable default matching "poll stays open indefinitely" semantics, but not locked).
   - Recommendation: Treat as planner/UI-phase discretion within the D2-08 constraint; the nested-path + `participantUrlId`-keyed-cookie-name combination in this document is the recommended default.

2. **Edit-route component reuse vs. sibling**
   - What we know: CONTEXT explicitly leaves "whether the edit route reuses the participant page component or is a sibling" to planner/executor discretion.
   - What's unclear: No strong technical reason favors one over the other — both `AvailabilityGrid` instances need: poll options, optional `initial` votes, a target action (`submitResponse` vs `updateResponse`), and a read-only flag for closed polls. A small shared `<VoteForm>` wrapper component parameterized by `{ action, initial, readOnly }` would minimize duplication.
   - Recommendation: Build one shared `VoteForm` component (per Recommended Project Structure) consumed by both `/p/[participantUrlId]/page.tsx` and `/p/[participantUrlId]/edit/[editToken]/page.tsx`, rather than duplicating the form markup.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | No | No accounts/passwords; access is link+token based by design (REQUIREMENTS "Out of Scope") |
| V3 Session Management | Partial | The httpOnly/SameSite=Lax cookie is a convenience auto-load mechanism, not a session — but should still follow secure-cookie defaults: `httpOnly: true`, `sameSite: "lax"`, and `secure: true` in production (Next.js sets `secure` automatically based on the request protocol in most deployments, but the planner should verify this is true under the Vercel HTTPS termination, not silently assume it) |
| V4 Access Control | Yes | Exact-token equality lookup (Pattern 5) is the sole authorization mechanism for `updateResponse`; the route's `participantUrlId` cross-check is defense-in-depth against using a valid token on the wrong poll's URL |
| V5 Input Validation | Yes | Zod schemas for `name`/`email`/`votes` array, mirroring `create-poll.ts`'s `CreatePollSchema` exactly (trim-before-length, optional-email pattern, max-length caps) |
| V6 Cryptography | Yes (no new work) | `editToken` reuses `generateToken()` (`nanoid(21)`, CSPRNG-backed) — already audited in Phase 1 research; no new cryptographic primitive introduced this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR via guessable/sequential edit token | Tampering / Information Disclosure | Already mitigated by `nanoid(21)` (126-bit entropy) per D2-11 — not sequential, not derivable from any other token |
| Cross-participant write (token confusion) | Tampering / Elevation of Privilege | `updateResponse` MUST re-derive `participantId` from the server-validated `editToken`, never trust a client-submitted ID (Anti-Patterns above; this is VOTE-06's exact must-NOT) |
| Stale read-then-write on poll status (TOCTOU) | Tampering | Both actions MUST re-fetch `poll.status` at write time, not trust a value baked into the rendered form (shown in Code Examples "Poll-status guard") |
| SQL injection via raw `sql` template in `onConflictDoUpdate`'s `set` clause | Tampering | Use `sql\`excluded.state\`` (a fixed literal referencing the Postgres `excluded` pseudo-table, not interpolated user input) exactly as shown in Pattern 2 — never interpolate the submitted `state` string directly into a raw `sql` fragment; Zod's enum validation already constrains `state` to the three literal values before it ever reaches the query, but parameterized/typed Drizzle calls (`.values()`) are the actual SQL-injection defense, not the enum alone |
| Email harvesting via participant-facing payload leak | Information Disclosure | `getVotesForParticipant`/`getParticipantByEditToken` must never be used to render OTHER participants' data on a participant-facing surface — Phase 3's results grid (admin-only) is the only place multi-participant data aggregates; this phase's queries are always scoped to ONE participant (the cookie/token owner) |

*Canon-referral (not re-litigated here): broader injection/XSS/CSRF hardening of the new actions is owned by `/gsd-secure-phase`; vote-spam rate limiting is an ops concern, out of MVP scope — both per SPEC's Prohibitions canon-referral line.*

## Sources

### Primary (HIGH confidence)
- [Drizzle ORM — Upsert Guide](https://orm.drizzle.team/docs/guides/upsert) — confirmed `onConflictDoUpdate` composite `target: [colA, colB]` syntax and batch-insert behavior, fetched directly against the installed `drizzle-orm@0.45.2` API shape
- [Next.js — `cookies()` API Reference](https://nextjs.org/docs/app/api-reference/functions/cookies) — fetched with `version: 16.2.9` in the page frontmatter, matching the project's installed `next@16.2.9` exactly; confirmed async requirement, Server-Action-only `.set()`/`.delete()` constraint, and full options table (`httpOnly`, `sameSite`, `maxAge`, `path`)
- `npm view drizzle-orm version` / `npm view next version` — re-confirmed both packages at their exact `package.json`-pinned versions during this research session, no drift

### Secondary (MEDIUM confidence)
- [Drizzle ORM upsert — WebSearch cross-check](https://github.com/drizzle-team/drizzle-orm/discussions/1555) — corroborates the composite-target upsert pattern independently of the official guide

### Tertiary (LOW confidence)
None — every load-bearing claim in this document was verified against an official source or the project's own existing, working code.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all four reused libraries re-verified at their exact installed versions
- Architecture: HIGH — every pattern is either a direct extension of Phase 1's proven, production-deployed code, or a primitive verified against official Drizzle/Next.js docs matching the exact installed versions
- Pitfalls: HIGH — eight pitfalls identified, six verified against official docs or the project's own existing code/runbook (README deploy steps); two (Pitfall 7, Pitfall 8) are reasoned hygiene/consistency recommendations explicitly flagged as discretionary rather than asserted as fact

**Research date:** 2026-06-30
**Valid until:** 2026-07-30 (30 days — stable stack, no fast-moving dependencies)

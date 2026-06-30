# Architecture Research

**Domain:** Group availability scheduling poll (Doodle Group Poll clone)
**Researched:** 2026-06-30
**Confidence:** HIGH — validated against Rallly (production open-source Doodle clone using Next.js + Prisma), Next.js App Router official docs, and Vercel platform constraints.

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (Client)                            │
│  ┌────────────────┐  ┌───────────────────┐  ┌──────────────────┐   │
│  │  Poll Create   │  │  Availability     │  │  Results Grid    │   │
│  │  Form          │  │  Grid (3-state    │  │  (participant ×  │   │
│  │  (DatePicker)  │  │  toggle island)   │  │   date matrix)  │   │
│  └───────┬────────┘  └────────┬──────────┘  └────────┬─────────┘  │
└──────────┼────────────────────┼─────────────────────┼─────────────┘
           │ Server Action      │ Server Action        │ RSC fetch
           ▼                    ▼                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js App Router (Server)                      │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Page Routes (RSC)                          │   │
│  │  /           → Poll creation form                            │   │
│  │  /p/[pid]    → Participant poll view + response form         │   │
│  │  /p/[pid]/edit/[token] → Edit existing response              │   │
│  │  /a/[aid]    → Admin dashboard (results + manage)            │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Server Actions                              │   │
│  │  createPoll(formData) → {adminUrlId, participantUrlId}       │   │
│  │  submitResponse(pollId, name, votes[]) → {editToken}         │   │
│  │  updateResponse(editToken, votes[]) → void                   │   │
│  │  sendInvites(adminUrlId, emails[]) → void                    │   │
│  │  closePoll(adminUrlId) → void                                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Data Layer (lib/db/)                        │   │
│  │  polls.ts · options.ts · participants.ts · votes.ts          │   │
│  │  aggregation.ts  (best-day SQL query)                        │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                       │
│  ┌──────────────────────────┼───────────────────────────────────┐   │
│  │              Email Layer (lib/email/)                         │   │
│  │  emailService.ts  (interface)                                 │   │
│  │  resend.ts  (production: Resend API)                          │   │
│  │  smtp.ts    (local: Nodemailer / MailHog)                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
           ┌───────────────────┴────────────────┐
           │                                    │
           ▼                                    ▼
┌─────────────────────┐             ┌──────────────────────┐
│   Database          │             │   Email Service       │
│   Neon (Postgres)   │             │   Resend (prod)       │
│   — Vercel          │             │   MailHog (local)     │
│   SQLite (local     │             └──────────────────────┘
│   dev only)         │
└─────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| Page: `/` | Poll creation form, DatePicker | RSC shell + Client Component DatePicker |
| Page: `/p/[pid]` | Participant poll view, loads options + existing votes | RSC (server fetch) + Client AvailabilityGrid |
| Page: `/p/[pid]/edit/[token]` | Edit own response, verified via editToken | RSC (server fetch, validates token) + Client AvailabilityGrid |
| Page: `/a/[aid]` | Admin: results grid, send invites, close poll | RSC (server fetch) + Client ResultsGrid |
| Server Action: `createPoll` | Validate form, insert Poll + Options, return URLs | Server-only, Zod validation |
| Server Action: `submitResponse` | Insert Participant + Votes, generate editToken, set cookie | Server-only |
| Server Action: `sendInvites` | Call email service for each address | Server-only, fire-and-await |
| Data Layer: `polls.ts` | All Poll CRUD, results aggregation query | Drizzle ORM / raw SQL |
| Data Layer: `votes.ts` | Upsert vote records, bulk insert | Drizzle ORM |
| Email Layer: `emailService.ts` | Abstract interface over Resend / SMTP | Environment-switched |
| `AvailabilityGrid` (Client) | 3-state toggle per date (click cycles states) | React Client Component |
| `ResultsGrid` (Client) | Participant × date matrix, colour-coded cells | React Client Component |

## Concrete Data Model

### Entity Relationship

```
Poll 1 ──── n Option
Poll 1 ──── n Participant
Participant 1 ──── n Vote
Option 1 ──── n Vote
```

### Schema (Drizzle / Prisma style — reference Rallly for field names)

```typescript
// Poll — the scheduling event created by the organiser
Poll {
  id              string  PK  CUID            // internal primary key
  participantUrlId string UNIQUE  nanoid(12)  // shared with invitees — e.g. "Vg7f2kNqXwYz"
  adminUrlId       string UNIQUE  nanoid(16)  // creator-only — e.g. "Kx9mPqRtWvYzAbCd"
  title           string
  description     string?
  location        string?
  status          PollStatus  DEFAULT open    // open | closed
  createdAt       datetime
  updatedAt       datetime
}

// Option — one candidate date (or date+time slot)
Option {
  id              string  PK  CUID
  pollId          string  FK → Poll
  startTime       datetime                    // midnight UTC for all-day dates
  duration        int     DEFAULT 0           // 0 = all-day; >0 = duration in minutes
  sortOrder       int                         // display order set by creator
  createdAt       datetime
}

// Participant — one person who has submitted a response
Participant {
  id              string  PK  CUID
  pollId          string  FK → Poll
  name            string                      // entered by participant at submit time
  email           string?                     // optional; used for invite personalisation
  editToken       string  UNIQUE  nanoid(16)  // unguessable; allows editing own response
  createdAt       datetime
  updatedAt       datetime
}

// Vote — one participant's availability for one option (three states)
Vote {
  id              string  PK  CUID
  participantId   string  FK → Participant
  optionId        string  FK → Option
  pollId          string  FK → Poll          // denormalised for fast aggregation
  value           VoteValue                  // available | tentative | unavailable
  createdAt       datetime
  updatedAt       datetime

  UNIQUE (participantId, optionId)            // one vote per participant per option
}

enum VoteValue {
  available     // "Yes" — can attend
  tentative     // "If need be" — can attend but not ideal
  unavailable   // "No" — cannot attend
}

enum PollStatus {
  open          // accepting responses
  closed        // results final, no new responses
}
```

**Key design decisions from Rallly analysis:**
- `participantUrlId` and `adminUrlId` are separate fields on Poll — not derived from each other.
- `Vote.pollId` is denormalised (stored redundantly alongside `optionId` FK) to allow efficient aggregation with a single-table GROUP BY without a join chain.
- `Vote` has a unique constraint on `(participantId, optionId)` — enforced at DB level so upserts are safe.
- `Option.duration = 0` represents all-day dates; non-zero supports future time-slot variants.
- `Participant.editToken` is separate from the poll's participant URL — it is per-person, not per-poll.

## Link and Token Strategy

### Three-Token Model

| Token | Length | Entropy | Who Has It | Purpose |
|-------|--------|---------|------------|---------|
| `adminUrlId` | nanoid(16) | ~95 bits | Creator only | Admin dashboard: see results, send invites, close poll |
| `participantUrlId` | nanoid(12) | ~71 bits | All invitees | Submit response; view results |
| `editToken` (per Participant) | nanoid(16) | ~95 bits | One participant | Return and edit own response |

All three are generated server-side with `nanoid` (crypto-random, URL-safe alphabet `[A-Za-z0-9_-]`).

### URL Structure

```
Creator gets two links on poll creation:
  Admin:       https://lfg.example.com/a/Kx9mPqRtWvYzAbCd
  Participant: https://lfg.example.com/p/Vg7f2kNqXwYz

Participants receive (via email or the shared link):
  View/Respond: https://lfg.example.com/p/Vg7f2kNqXwYz

After submitting, participant sees and can bookmark:
  Edit own:    https://lfg.example.com/p/Vg7f2kNqXwYz/edit/Kx9mPqRtWvYzAbCd
  (+ cookie set for same-device convenience)
```

### Access Rules (enforced server-side)

| Route | Allowed Actions | Check |
|-------|-----------------|-------|
| `/a/[adminUrlId]` | View results, send invites, close poll | `Poll.adminUrlId = param` |
| `/p/[participantUrlId]` | View poll + options, submit new response | `Poll.participantUrlId = param` |
| `/p/[participantUrlId]/edit/[editToken]` | Edit own votes only | `Participant.editToken = param AND Participant.pollId matches poll` |

There is no session/auth system. Every route validates only the token in the URL against the database. A participant cannot see another participant's editToken.

## Recommended Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Poll creation form (RSC)
│   ├── p/
│   │   └── [participantUrlId]/
│   │       ├── page.tsx            # Participant poll + response form (RSC)
│   │       ├── edit/
│   │       │   └── [editToken]/
│   │       │       └── page.tsx    # Edit existing response (RSC)
│   │       └── thanks/
│   │           └── page.tsx        # Post-submit success page
│   └── a/
│       └── [adminUrlId]/
│           └── page.tsx            # Admin dashboard (RSC)
│
├── actions/
│   ├── create-poll.ts              # createPoll server action
│   ├── submit-response.ts          # submitResponse + updateResponse server actions
│   ├── send-invites.ts             # sendInvites server action
│   └── close-poll.ts              # closePoll server action
│
├── components/
│   ├── availability-grid.tsx       # Client: 3-state toggle grid
│   ├── results-grid.tsx            # Client: read-only results matrix
│   ├── date-picker.tsx             # Client: multi-date selector for creation
│   └── best-day-badge.tsx          # Client: highlights best option
│
├── lib/
│   ├── db/
│   │   ├── index.ts                # Drizzle client singleton
│   │   ├── schema.ts               # All table + enum definitions
│   │   ├── polls.ts                # Poll CRUD + aggregation queries
│   │   ├── options.ts              # Option CRUD
│   │   ├── participants.ts         # Participant CRUD
│   │   └── votes.ts                # Vote upsert + bulk operations
│   ├── email/
│   │   ├── index.ts                # emailService factory (env-switched)
│   │   ├── resend.ts               # Production: Resend API
│   │   ├── smtp.ts                 # Local: Nodemailer
│   │   └── templates/
│   │       └── invite.tsx          # React Email invite template
│   └── tokens.ts                   # nanoid helpers for URL IDs
│
└── drizzle/
    ├── schema.ts                   # Drizzle schema (mirrors lib/db/schema.ts)
    └── migrations/                 # Generated migration SQL files
```

### Structure Rationale

- **`app/` routes match URL shape exactly** — `/p/[participantUrlId]` in the filesystem maps to the URL. No ambiguity.
- **`actions/` at top level** — Server Actions co-located with each other, not buried under individual routes. Keeps route files thin.
- **`lib/db/` split by entity** — Each file owns one entity's queries. Cross-entity aggregation goes in `polls.ts` (the aggregate root).
- **`lib/email/` behind interface** — `index.ts` exports one `sendEmail()` function; which implementation runs depends on `EMAIL_PROVIDER` env var. Local dev uses MailHog or Nodemailer, production uses Resend.

## Data Flows

### Flow 1: Create Poll

```
Creator fills in title + dates on /
  ↓
<DatePicker> client component manages selected dates in local state
Creator submits form
  ↓
Server Action: createPoll(formData)
  Validate with Zod (title required, ≥1 date required)
  Generate participantUrlId = nanoid(12)
  Generate adminUrlId = nanoid(16)
  db.insert(polls) + db.insert(options[])
  ↓
redirect('/a/' + adminUrlId)
  ↓
Admin page (RSC): fetch poll by adminUrlId, render share links
Creator copies participant link or clicks "Send email invites"
```

### Flow 2: Submit Response

```
Participant visits /p/[participantUrlId]
  ↓
Page RSC: db.getPollByParticipantUrlId(participantUrlId)
  → 404 if not found or poll.status = closed
RSC renders poll title + options
<AvailabilityGrid> (Client): renders date columns, participant enters name
Participant clicks each cell to cycle: available → tentative → unavailable
Participant submits
  ↓
Server Action: submitResponse(participantUrlId, name, email?, votes[])
  Zod validate (name required, all options must have a vote value)
  Generate editToken = nanoid(16)
  db.insert(participants) → get participantId
  db.batchInsert(votes) with (participantId, optionId, pollId, value)
  ↓
Set cookie: `lfg_edit_${pollId}` = editToken  (httpOnly, SameSite=Strict)
redirect('/p/' + participantUrlId + '/thanks?edit=' + editToken)
  ↓
Thanks page shows: "Bookmark to edit: /p/[pid]/edit/[editToken]"
```

### Flow 3: Edit Existing Response

```
Participant visits /p/[participantUrlId]/edit/[editToken]
  ↓
Page RSC: db.getParticipantByEditToken(editToken)
  → 404 if editToken not found
  → Verify participant.poll.participantUrlId matches URL param (prevents token fishing)
RSC fetches existing votes for this participant
<AvailabilityGrid> pre-populated with existing selections
Participant changes selections + re-submits
  ↓
Server Action: updateResponse(editToken, votes[])
  db.upsertVotes (UPDATE existing votes by participantId+optionId unique constraint)
  ↓
redirect back to /p/[participantUrlId]/edit/[editToken] with success toast
```

### Flow 4: Email Invites

```
Creator on admin page enters comma-separated emails, clicks "Send invites"
  ↓
Server Action: sendInvites(adminUrlId, emails[])
  Validate adminUrlId → fetch poll
  Validate emails (Zod email array)
  For each email:
    emailService.sendInvite({
      to: email,
      pollTitle: poll.title,
      participantUrl: baseUrl + '/p/' + poll.participantUrlId,
      creatorName: (optional)
    })
  ↓
All sends awaited synchronously (small list; no queue needed at this scale)
Return { sent: n, failed: [] }
```

### Flow 5: Results Aggregation (Best Day)

```sql
-- Run on every admin page load; fast for small groups (< 50 participants)
SELECT
  o.id,
  o.start_time,
  o.duration,
  COUNT(CASE WHEN v.value = 'available'   THEN 1 END) AS available_count,
  COUNT(CASE WHEN v.value = 'tentative'   THEN 1 END) AS tentative_count,
  COUNT(CASE WHEN v.value = 'unavailable' THEN 1 END) AS unavailable_count,
  COUNT(DISTINCT v.participant_id)                     AS total_responses
FROM options o
LEFT JOIN votes v ON v.option_id = o.id AND v.poll_id = o.poll_id
WHERE o.poll_id = $pollId
GROUP BY o.id, o.start_time, o.duration
ORDER BY available_count DESC, tentative_count DESC
```

Best day = first row (most "available", then most "tentative" as tiebreak). No JavaScript aggregation needed — SQL handles it. This query runs directly in the RSC page component on the admin route; no API endpoint required.

## Architectural Patterns

### Pattern 1: Server Action as the Only Mutation Path

**What:** All writes go through Next.js Server Actions (`"use server"` functions). No separate REST API for mutations.

**When to use:** Single-app deployments where only the Next.js frontend consumes the backend. Simplifies code: no fetch(), no JSON serialisation, no CORS.

**Trade-offs:** If a mobile app or external webhook consumer is ever added, a Route Handler API will need to be added. For this project (no external consumers in scope), Server Actions are strictly simpler.

```typescript
// src/actions/submit-response.ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { nanoid } from "nanoid";

const schema = z.object({
  participantUrlId: z.string().min(1),
  name: z.string().min(1).max(100),
  email: z.string().email().optional(),
  votes: z.array(z.object({
    optionId: z.string(),
    value: z.enum(["available", "tentative", "unavailable"]),
  })).min(1),
});

export async function submitResponse(formData: FormData) {
  const parsed = schema.parse(Object.fromEntries(formData));
  const editToken = nanoid(16);
  const participant = await db.participants.create({ ...parsed, editToken });
  await db.votes.bulkCreate(parsed.votes.map(v => ({ ...v, participantId: participant.id })));
  revalidatePath(`/p/${parsed.participantUrlId}`);
  return { editToken };
}
```

### Pattern 2: RSC Data Fetch at Route Level, No API Layer for Reads

**What:** Page Server Components fetch data directly from the DB via `lib/db/` functions. No `getServerSideProps`, no fetch to self.

**When to use:** Always, for this project. Eliminates an entire round-trip for every page load.

**Trade-offs:** Tightly couples page to DB layer. Acceptable for a single-team hobby project; would add an API layer if multiple clients needed the data.

```typescript
// src/app/a/[adminUrlId]/page.tsx
import { db } from "@/lib/db";
import { ResultsGrid } from "@/components/results-grid";
import { notFound } from "next/navigation";

export default async function AdminPage({ params }: { params: { adminUrlId: string } }) {
  const poll = await db.polls.getByAdminUrlId(params.adminUrlId);
  if (!poll) notFound();
  const results = await db.polls.getResultsAggregation(poll.id);
  return <ResultsGrid poll={poll} results={results} />;
}
```

### Pattern 3: Token Validated Server-Side on Every Request

**What:** There is no session, no JWT, no cookie-based auth. Each URL carries its own credential (the unguessable ID). Server components and actions validate the token against the DB on every request.

**When to use:** Anonymous, no-account systems. Simpler than a full auth system; correct for this use case.

**Trade-offs:** Revoking access requires deleting or rotating the token in the DB. Tokens in URLs appear in server logs and browser history — acceptable for a private group tool.

### Pattern 4: Email Service Interface with Environment Switch

**What:** `lib/email/index.ts` exports a single `sendInvite()` function that internally selects Resend (production) or Nodemailer/MailHog (local) based on `EMAIL_PROVIDER` env var.

**When to use:** When the same codebase must work in two environments with different transports.

```typescript
// src/lib/email/index.ts
import { resendSend } from "./resend";
import { smtpSend } from "./smtp";

export const emailService = process.env.EMAIL_PROVIDER === "resend"
  ? resendSend
  : smtpSend;
```

## Suggested Build Order (Vertical Slices)

Each slice is independently deployable and testable end-to-end before the next begins.

### Slice 1: Create Poll + Admin View (no votes)

Deliverable: Creator can create a poll and see the admin page with share links.

1. DB schema + migration (Poll + Option tables)
2. `lib/db/polls.ts` + `lib/db/options.ts` (insert + read)
3. `lib/tokens.ts` (nanoid wrappers)
4. Server Action: `createPoll`
5. Page: `/` (creation form with basic date inputs — no fancy DatePicker yet)
6. Page: `/a/[adminUrlId]` (shows poll info + participant URL, no results)

Dependencies: DB must be set up first. All other pieces of Slice 1 are independent after that.

### Slice 2: Submit Response + 3-State Voting

Deliverable: Participant visits link, enters name, marks availability, submits.

1. DB: Participant + Vote tables + migration
2. `lib/db/participants.ts` + `lib/db/votes.ts`
3. Client Component: `<AvailabilityGrid>` (3-state toggle per date cell)
4. Server Action: `submitResponse`
5. Page: `/p/[participantUrlId]` (poll view + response form)
6. Page: `/p/[participantUrlId]/thanks` (post-submit, show editToken URL + set cookie)
7. Page: `/p/[participantUrlId]/edit/[editToken]` + Server Action: `updateResponse`

Dependencies: Slice 1 must exist (Poll + Option tables). The AvailabilityGrid can be built in parallel with the server action.

### Slice 3: Results Dashboard + Best Day

Deliverable: Admin sees participant × date grid, coloured cells, best day highlighted.

1. `lib/db/polls.ts`: add `getResultsAggregation` query (SQL GROUP BY)
2. Client Component: `<ResultsGrid>` (matrix display)
3. Client Component: `<BestDayBadge>` (computed from aggregation results)
4. Update `/a/[adminUrlId]` page to render results

Dependencies: Slices 1 + 2 (needs votes in DB to show anything).

### Slice 4: Email Invites

Deliverable: Admin enters emails, participants receive personalised invite links.

1. `lib/email/index.ts` + `lib/email/resend.ts` + `lib/email/smtp.ts`
2. React Email template: `invite.tsx`
3. Server Action: `sendInvites`
4. Admin page: email input UI + send button

Dependencies: Slice 1 (needs pollId + participantUrlId). Email layer is otherwise independent.

### Slice 5: Polish

Deliverable: Proper DatePicker, responsive layout, close-poll action.

1. `<DatePicker>` multi-select client component
2. Replace basic date inputs on `/` with DatePicker
3. Server Action: `closePoll` (set poll.status = closed)
4. Admin page: close button, closed-poll banner on participant page
5. Mobile-responsive layout pass

Dependencies: All previous slices. DatePicker enhancement is purely additive.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1–10 concurrent polls, < 50 participants | Current design — no changes. SQLite local or Neon free tier. No queue needed. |
| 100 active polls, 500 participants | Current design holds. Add DB indexes on `votes.poll_id` and `options.poll_id`. |
| 1,000+ polls | Current design holds. Consider adding a results cache (Next.js `unstable_cache` or `revalidateTag`) to avoid re-running aggregation SQL on every admin page hit. |
| Multi-tenant / many users | Out of scope. Would require user accounts, which is explicitly excluded. |

This is a hobby project for a D&D group. The "1–10 polls" row is the realistic operating range for the foreseeable future. Do not over-engineer.

## Anti-Patterns

### Anti-Pattern 1: Putting Vote State in JSON / Blob Column

**What people do:** `Poll.responses JSON` storing `{ participantName, votes: { optionId: "yes" } }[]`

**Why it's wrong:** Makes SQL aggregation for "best day" impossible without pulling all data into application memory. Can't add indexes. Schema migration on option changes is a nightmare.

**Do this instead:** Normalised `votes` table with `(participantId, optionId, value)` rows. Best day computed with a single GROUP BY query.

### Anti-Pattern 2: Using the Same Token for Admin and Participant Access

**What people do:** One URL with one ID; admin-specific actions gated by a checkbox or separate "admin" flag.

**Why it's wrong:** If the participant URL leaks (e.g., forwarded by a friend), anyone can close the poll or delete responses.

**Do this instead:** Two separate tokens on the Poll — `participantUrlId` (safe to share) and `adminUrlId` (never included in participant emails or shared links). Each grants a different privilege set, validated server-side.

### Anti-Pattern 3: Computing Best Day in the React Component

**What people do:** Fetch all votes into React state, filter and sort in JavaScript.

**Why it's wrong:** Sends all raw participant data to the client unnecessarily. The SQL GROUP BY is simpler, faster, and keeps computation server-side where it belongs.

**Do this instead:** `getResultsAggregation()` runs the aggregation SQL on the server. RSC passes pre-computed `{ optionId, availableCount, tentativeCount, unavailableCount }[]` to the client component, not raw vote records.

### Anti-Pattern 4: Route Handler for All Mutations

**What people do:** `POST /api/polls`, `POST /api/responses`, `PUT /api/votes` as Route Handlers with manual fetch() on the client.

**Why it's wrong:** Doubles the code surface for no benefit when the only consumer is the same Next.js app. More fetch boilerplate, more error handling, more manual cache invalidation.

**Do this instead:** Server Actions for all mutations. Use Route Handlers only if an external system needs to POST to the app (e.g., email provider webhooks), which is not required for this project.

### Anti-Pattern 5: Skipping the `editToken` and Relying on Device Cookies Alone

**What people do:** After submission, set a cookie with the participantId. Return visits check the cookie.

**Why it's wrong:** Cookie is device-specific. If a participant submits on mobile and wants to edit on desktop, they cannot. Common for a D&D group where members might respond on whichever device they have open.

**Do this instead:** Generate `editToken` per participant. Show the full edit URL on the success page with a "bookmark this" note. Also set the cookie for same-device convenience. The URL is the source of truth; the cookie is a shortcut.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Resend (production email) | HTTP API via `resend` npm package in Server Action | Free tier: 3,000 emails/month, 100/day. Sufficient for a D&D group. |
| Nodemailer + MailHog (local email) | SMTP via `nodemailer` npm package | Run MailHog locally (`docker run mailhog/mailhog`) to catch emails during dev without sending real mail |
| Neon (Postgres, Vercel production) | `@neondatabase/serverless` driver, HTTP mode | Works in Vercel serverless functions without WebSocket issues |
| SQLite (local development) | Drizzle + better-sqlite3 | Local DB file; zero setup required for dev |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Page (RSC) → Data Layer | Direct function call (`await db.polls.getByAdminUrlId(id)`) | No HTTP; same process |
| Server Action → Data Layer | Direct function call | Same process; Zod validates before DB call |
| Server Action → Email Layer | Direct function call (`await emailService.sendInvite(...)`) | Synchronous; acceptable at small scale |
| Client Component → Server Action | `action={serverAction}` on `<form>` or `startTransition(serverAction)` | Next.js RSC wire protocol |
| Participant page → Admin page | No direct communication | Admin page independently fetches from DB |

## Sources

- Rallly open-source schema (production reference, MIT license): https://github.com/lukevella/rallly
- Rallly poll.prisma model reviewed directly: `packages/database/prisma/models/poll.prisma`
- Next.js App Router docs (Server Actions and Mutations): https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations
- Next.js Route Handlers docs: https://nextjs.org/docs/app/getting-started/route-handlers
- Neon / Vercel integration (Vercel Postgres transition): https://neon.com/docs/guides/vercel-postgres-transition-guide
- Resend + Next.js integration: https://resend.com/nextjs
- nanoid vs CUID2 for ID generation: https://www.wisp.blog/blog/uuid-vs-cuid-vs-nanoid-choosing-the-right-id-generator-for-your-application
- Server Actions vs API Routes decision: https://www.verlua.com/blog/server-actions-vs-api-routes

---
*Architecture research for: Group availability scheduling poll (LFG)*
*Researched: 2026-06-30*

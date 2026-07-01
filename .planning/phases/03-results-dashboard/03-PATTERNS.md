# Phase 3: Results Dashboard - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 7
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `src/lib/vote-state.ts` | utility | transform | `src/components/availability-grid.tsx` (STATE_META block, lines 25-56) | exact (extraction source) |
| `src/components/availability-grid.tsx` | component | CRUD (client state) | itself — modify imports only | n/a (self-modify) |
| `src/lib/db/queries.ts` (add `getResultsForPoll`) | service/query | CRUD (read, joined) | `getVotesForParticipant` + `getOptionsForPoll` in same file | exact |
| `src/lib/results.ts` (`computeResults`) | utility | transform | `src/lib/format-date.ts` (pure helper + colocated test precedent) | role-match |
| `src/components/results-grid.tsx` | component | request-response (client island over static props) | `src/components/availability-grid.tsx` | exact |
| `src/app/a/[adminUrlId]/page.tsx` | route (RSC) | request-response | itself — modify (additive) | exact (self-modify) |
| `src/lib/results.test.ts` | test | transform (pure) | `src/lib/format-date.test.ts` | exact |
| DB-backed test for `getResultsForPoll` | test | CRUD (DB) | `src/app/a/[adminUrlId]/page.test.ts` | exact |

## Pattern Assignments

### `src/lib/vote-state.ts` (NEW — utility)

**Analog:** `src/components/availability-grid.tsx` lines 1-56 (source of extraction)

**Extract verbatim (module-private today, must become exported):**
```typescript
// src/components/availability-grid.tsx lines 25, 37-56
export type VoteState = "yes" | "ifneedbe" | "no";

const STATE_META: Record<
  VoteState,
  { label: string; className: string; Icon: typeof Check }
> = {
  yes: {
    label: "Available",
    Icon: Check,
    className: "bg-emerald-50 text-emerald-700 border-emerald-300",
  },
  ifneedbe: {
    label: "If-need-be",
    Icon: CircleHelp,
    className: "bg-amber-50 text-amber-700 border-amber-300",
  },
  no: {
    label: "Not available",
    Icon: X,
    className: "bg-muted text-muted-foreground border-border",
  },
};
```

**New addition (not in the original file — D3-03 gap-fill, closes P2 REVIEW #4):**
```typescript
export function normalizeVoteState(state: string | undefined): VoteState {
  return state === "yes" || state === "ifneedbe" ? state : "no";
}
```

**File-header comment convention to follow** (every file in this codebase opens with a load-bearing "why" comment block — mirror `format-date.ts` lines 1-10 style: explain the invariant, not just what the code does). Import `Check`, `CircleHelp`, `X` from `lucide-react` (same import used in `availability-grid.tsx` line 21) — do **not** import `RotateCcw` (cycle-only, stays in `availability-grid.tsx`).

---

### `src/components/availability-grid.tsx` (MODIFY)

**Analog:** self (surgical edit)

Replace the local `STATE_META` const + `VoteState` type declaration (current lines 25, 37-56) with an import:
```typescript
import { STATE_META, VoteState, normalizeVoteState } from "@/lib/vote-state";
```
Keep `CYCLE`, `cycleCell`, `setAll`, and the `Check/CircleHelp/X/RotateCcw` icon import (still needed locally for the bulk-action buttons at lines 118-138) — only the STATE_META map + VoteState type move out. Existing `availability-grid.test.tsx` (if present) must still pass unchanged since the exported surface (`AvailabilityGrid`, `VoteState`, `GridOption`) is preserved.

---

### `src/lib/db/queries.ts` (MODIFY — add `getResultsForPoll`)

**Analog:** same file — `getVotesForParticipant` (lines 94-107) for column-safety discipline + JSDoc style; `getOptionsForPoll` (lines 46-65) for the ordering/JSDoc convention.

**Imports pattern** (lines 10-12, extend the existing `drizzle-orm` import):
```typescript
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { eq, asc, sql, and } from "drizzle-orm"; // add `and`
```

**Participant-safe column discipline** (mirror `getPollByParticipantUrlId` lines 29-44 and `getVotesForParticipant` lines 94-107 — select an explicit column list, never `select()` with no args, and document the omission in a JSDoc comment):
```typescript
/**
 * Admin-only results read (DASH-01..04). Returns every participant for the
 * poll (ordered by createdAt asc — submission order) with a
 * Record<optionId, state> of their votes. Selects participant-safe columns
 * only: id/name — NEVER email/editToken/adminUrlId (SPEC Prohibitions).
 * LEFT JOIN so a participant with zero vote rows still appears (Pitfall 3 —
 * do not start the query FROM votes).
 */
export async function getResultsForPoll(pollId: string) {
  const rows = await db
    .select({
      participantId: participants.id,
      participantName: participants.name,
      optionId: votes.optionId,
      state: votes.state,
    })
    .from(participants)
    .leftJoin(
      votes,
      and(eq(votes.participantId, participants.id), eq(votes.pollId, pollId)),
    )
    .where(eq(participants.pollId, pollId))
    .orderBy(asc(participants.createdAt));

  const byParticipant = new Map<
    string,
    { id: string; name: string; votes: Record<string, string> }
  >();
  for (const r of rows) {
    let p = byParticipant.get(r.participantId);
    if (!p) {
      p = { id: r.participantId, name: r.participantName, votes: {} };
      byParticipant.set(r.participantId, p);
    }
    if (r.optionId && r.state) p.votes[r.optionId] = r.state;
  }
  return [...byParticipant.values()];
}
```
Do **not** select `participants.createdAt` into the returned shape (only use it in `ORDER BY`) — avoids passing a `Date` object across the RSC→client boundary (RESEARCH.md Pitfall 2).

**Error handling pattern:** none of the existing query helpers try/catch — they return `null`/`[]` on miss and let the caller (`notFound()` in the RSC) handle absence. `getResultsForPoll` follows the same convention: no throw, empty array on no participants.

---

### `src/lib/results.ts` (NEW — `computeResults`)

**Analog:** `src/lib/format-date.ts` (pure-helper-with-header-comment precedent) — no direct algorithmic analog exists in the codebase; this is new pure logic per D3-02.

**Header-comment convention** to follow (mirror `format-date.ts` lines 1-10 — state the invariant up front):
```typescript
// Pure results aggregation (DASH-03/04, D3-02). No DB, no I/O — takes
// getResultsForPoll's output + getOptionsForPoll's chronological order and
// returns per-option tallies + best-day flags in one pass. The tie-break is
// the highest-risk correctness surface in this phase — keep it unit-testable
// in isolation, never re-derive it in SQL or in ResultsGrid.
```

**Core transform pattern:**
```typescript
import { normalizeVoteState } from "@/lib/vote-state";

export type ResultsParticipant = {
  id: string;
  name: string;
  votes: Record<string, string>;
};

export type OptionResult = {
  optionId: string;
  yes: number;
  ifneedbe: number;
  isBest: boolean;
};

export function computeResults(
  participants: ResultsParticipant[],
  options: { id: string }[],
): OptionResult[] {
  const tallies = options.map((opt) => {
    let yes = 0;
    let ifneedbe = 0;
    for (const p of participants) {
      const state = normalizeVoteState(p.votes[opt.id]);
      if (state === "yes") yes++;
      else if (state === "ifneedbe") ifneedbe++;
    }
    return { optionId: opt.id, yes, ifneedbe };
  });

  const maxYes = tallies.reduce((m, t) => Math.max(m, t.yes), 0);
  const bestIds = new Set<string>();
  if (maxYes > 0) {
    const yesLeaders = tallies.filter((t) => t.yes === maxYes);
    const maxIfNeedBe = yesLeaders.reduce((m, t) => Math.max(m, t.ifneedbe), 0);
    for (const t of yesLeaders) {
      if (t.ifneedbe === maxIfNeedBe) bestIds.add(t.optionId);
    }
  }

  return tallies.map((t) => ({ ...t, isBest: bestIds.has(t.optionId) }));
}
```
No error handling needed (pure function, no I/O) — matches `format-date.ts`'s only-throw-on-malformed-input convention (only `normalizeVoteState`, imported, has a fallback path; `computeResults` itself never throws).

---

### `src/components/results-grid.tsx` (NEW — client island)

**Analog:** `src/components/availability-grid.tsx` (full file — client island, STATE_META cells, bulk/filter controls, `aria-live` announcement pattern)

**Imports pattern** (mirror lines 1-23 of `availability-grid.tsx`):
```typescript
"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { formatDateWithTime } from "@/lib/format-date";
import { STATE_META, VoteState, normalizeVoteState } from "@/lib/vote-state";
import { Button } from "@/components/ui/button";
import type { OptionResult } from "@/lib/results";
```

**Cell rendering pattern** (mirror the read-only `<span>` branch at `availability-grid.tsx` lines 158-163 — this is the exact chip pattern to reuse for every `<td>`, since results cells are always read-only, never the interactive `<button>` branch):
```tsx
<span className={cellClasses}>
  <Icon aria-hidden className="size-4" />
  <span>{meta.label}</span>
</span>
```

**`aria-live` announcement pattern** (mirror lines 79, 95, 100-101, 106-108 of `availability-grid.tsx` — same `useState` + `sr-only` div convention, reused for filter-change announcements per UI-SPEC "Interaction States"):
```tsx
const [announcement, setAnnouncement] = useState("");
// ...
<div aria-live="polite" className="sr-only">{announcement}</div>
```

**Bulk/filter control button pattern** (mirror lines 111-141 — `Button variant="outline" className="h-11"` for the filter's "Clear filter" button, though UI-SPEC specifies `variant="ghost"` for this phase — same `h-11` touch-target convention either way).

**No-re-sort convention:** render `options` and `participants` in the array order received as props (never re-sort) — mirrors `availability-grid.tsx` line 143 comment ("One row per option, in getOptionsForPoll order (no re-sort)") applied here to both rows (participants, `getResultsForPoll` order) and columns (options, `getOptionsForPoll` order).

---

### `src/app/a/[adminUrlId]/page.tsx` (MODIFY — additive)

**Analog:** self (current file, full read above)

**Import additions** (extend lines 11-23):
```typescript
import {
  getPollByAdminUrlId,
  getOptionsForPoll,
  getResultsForPoll,
} from "@/lib/db/queries";
import { computeResults } from "@/lib/results";
import { ResultsGrid } from "@/components/results-grid";
```

**Fetch + compute pattern** (append after line 35's `const options = await getOptionsForPoll(poll.id);`, following the same `await` sequential-fetch style already used for `poll`/`options`):
```typescript
const participants = await getResultsForPoll(poll.id);
const results = computeResults(participants, options);
```

**Mount pattern** (append as a new section after the existing "Share your poll" `<div>` block, lines 63-98 — same `<div className="flex flex-col gap-4">` + `<h2 className="text-2xl font-semibold leading-snug">` heading wrapper convention used for "Share your poll" at line 64):
```tsx
<div className="flex flex-col gap-4">
  <h2 className="text-2xl font-semibold leading-snug">Results</h2>
  <ResultsGrid options={options} participants={participants} results={results} />
</div>
```

**404/error handling:** unchanged — `notFound()` already guards the whole page at line 33; no new error path needed since results reads are pure/synchronous over already-validated `poll.id`.

---

### `src/lib/results.test.ts` (NEW — pure test)

**Analog:** `src/lib/format-date.test.ts` (full file pattern — `describe`/`it` blocks, exact-string/exact-value assertions, edge-case-per-`it` structure, no DB, no mocks)

**Structure to copy:**
```typescript
import { describe, it, expect } from "vitest";
import { computeResults } from "./results";

describe("computeResults", () => {
  it("flags the single date with the strictly highest yes count as isBest", () => { /* ... */ });
  it("flags all co-leading dates tied on (yes, ifneedbe)", () => { /* ... */ });
  it("flags no date isBest when max yes count is 0", () => { /* ... */ });
  it("gap-fills a missing (participant, option) vote to 'no' via normalizeVoteState", () => { /* ... */ });
  it("treats an unrecognized state literal as 'no' (never throws)", () => { /* ... */ });
  it("returns all-zero tallies with zero participants, no throw", () => { /* ... */ });
});
```
No `beforeAll`/`afterAll`/`DATABASE_URL` — this is a pure-function test file, same style as `format-date.test.ts` and `date-input.test.ts` (no DB fixtures).

---

### DB-backed test for `getResultsForPoll` (NEW, likely `src/lib/db/queries.test.ts` or colocated with page test)

**Analog:** `src/app/a/[adminUrlId]/page.test.ts` (full file — DB seed helpers, `beforeAll`/`afterAll` cleanup, `DATABASE_URL` guard)

**Structure to copy:**
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getResultsForPoll } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (point at the Docker Postgres)");
  }
});

afterAll(async () => {
  // mirror page.test.ts lines 66-70: cleanup via inArray on created ids
});
```
Seed pattern mirrors `seedPoll()` (`page.test.ts` lines 29-51) — insert `polls` + `options`, then additionally insert `participants` (some with votes, one with zero votes to cover Pitfall 3 — the LEFT JOIN zero-vote-participant edge case) + `votes` rows. Assert: (a) participant order matches `createdAt asc`, (b) zero-vote participant still appears with an empty `votes` record, (c) no `email`/`editToken`/`adminUrlId` field appears anywhere in the returned shape (`JSON.stringify(result)` should not contain those substrings — mirrors the string-presence assertion style at `page.test.ts` lines 77-84).

## Shared Patterns

### Timezone-safe date formatting
**Source:** `src/lib/format-date.ts` — `formatDateWithTime`
**Apply to:** `results-grid.tsx` column headers (`dateLabel`), never `new Date()` on the `'YYYY-MM-DD'` string. Same call pattern as `availability-grid.tsx` line 58-63 (`optionLabel` helper) and `page.tsx` lines 55-58.

### Participant-safe column selection
**Source:** `src/lib/db/queries.ts` — `getPollByParticipantUrlId` (lines 29-44) and `getVotesForParticipant` (lines 94-107)
**Apply to:** `getResultsForPoll` — explicit `select({...})` column list, JSDoc documenting the deliberate omission of `email`/`editToken`/`adminUrlId`.

### `aria-live` sr-only announcement
**Source:** `src/components/availability-grid.tsx` lines 79, 95, 100-101, 106-108
**Apply to:** `results-grid.tsx` filter-change announcements (UI-SPEC "Interaction States" — mirrors the cell-change announcement pattern verbatim).

### Colocated pure-function test (no DB, exact-value assertions)
**Source:** `src/lib/format-date.test.ts`, `src/lib/date-input.test.ts`
**Apply to:** `src/lib/results.test.ts`.

### Colocated DB-backed RSC test (seed + cleanup + notFound assertion)
**Source:** `src/app/a/[adminUrlId]/page.test.ts`
**Apply to:** the `getResultsForPoll` test and any updated `page.test.ts` assertions for the new Results section.

## No Analog Found

None — all 7 files/changes have a strong existing-codebase analog (this phase is explicitly additive over Phase 1/2 conventions, per RESEARCH.md "adds zero new runtime dependencies").

## Metadata

**Analog search scope:** `src/lib/`, `src/lib/db/`, `src/components/`, `src/app/a/[adminUrlId]/`
**Files scanned:** `src/lib/db/queries.ts`, `src/components/availability-grid.tsx`, `src/app/a/[adminUrlId]/page.tsx`, `src/app/a/[adminUrlId]/page.test.ts`, `src/lib/format-date.ts`, `src/lib/format-date.test.ts`
**Pattern extraction date:** 2026-07-01

# Phase 5: Vote-Grid Redesign (Matrix / 1c) - Pattern Map

**Mapped:** 2026-07-02
**Files analyzed:** 8 (1 rewrite, 1 test rewrite, 5 pixel-target, 1 optional email edit) + page mounts
**Analogs found:** 8 / 8 (all in-repo; no external analogs needed)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/components/availability-grid.tsx` (rewrite) | component (client island, form input) | request-response (local state → onChange emit) | (a) `src/components/results-grid.tsx` for **layout** (rows×states grid, column headers, tint) + (b) itself, current version, for **behavior to preserve** (state model, bulk actions, closed read-only, never-blank default, aria-live) | exact (self) + role-match (ResultsGrid layout) |
| `src/components/availability-grid.test.tsx` (rewrite) | test | request-response (DOM assertions) | current `availability-grid.test.tsx` (structure/afterEach/OPTIONS fixture) + `results-grid.test.tsx` (multi-cell/filter/aria assertion idioms) | exact (structure) |
| `src/components/results-grid.tsx` | component | CRUD (read-only render of server-computed props) | itself — pixel-target only, no structural change | exact (unchanged) |
| `src/components/invite-by-email-form.tsx` | component (form) | request-response (Server Action) | itself — pixel-target only | exact (unchanged) |
| `src/components/book-it-control.tsx` | component (form, two-step confirm) | request-response (Server Action) | itself — pixel-target only | exact (unchanged) |
| `src/components/poll-create-form.tsx` | component (form) | request-response (Server Action) | itself — pixel-target only | exact (unchanged) |
| `src/components/calendar-date-picker.tsx` | component (client island) | request-response (local state → serialize) | itself — pixel-target only | exact (unchanged) |
| `src/lib/email/templates.ts` (`calLink` edit) | utility (string-in/string-out render fn) | transform | itself — targeted signature change only | exact (unchanged elsewhere) |
| `src/app/p/[participantUrlId]/page.tsx` (+ edit/thanks) | route (RSC page) | request-response | itself — no change; documents `AvailabilityGrid`/`VoteForm` mount contract | exact (unchanged) |

---

## Pattern Assignments

### `src/components/availability-grid.tsx` (rewrite → radio matrix)

**Analog A — behavior/state to PRESERVE (current `availability-grid.tsx`, full file, 165 lines):**

State model + "never blank" default (lines 60-62):
```typescript
const [cellState, setCellState] = useState<Record<string, VoteState>>(() =>
  Object.fromEntries(options.map((o) => [o.id, initial?.[o.id] ?? "no"])),
);
```
Note for the matrix rewrite: replace `cycleCell` (lines 71-80, the `no→yes→ifneedbe→no` CYCLE walk) with a direct `selectCell(opt, state)` setter — the matrix has no cycling, only direct selection — but KEEP the exact updater shape (functional merge `(prev) => ({ ...prev, [opt.id]: next })`) and KEEP the announcement pattern:
```typescript
setAnnouncement(`${optionLabel(opt)} set to ${STATE_META[next].label}`);
```
set OUTSIDE the updater (comment at lines 77-78 explains why: avoids React 19 Strict/concurrent double-invocation desync — same fix applied in `ResultsGrid`'s `announceFilter`, see below).

Bulk actions to preserve verbatim (lines 82-125), `Button` import from `@/components/ui/button`, `h-11` sizing, `type="button"`, absent when `disabled`:
```typescript
function setAll(state: VoteState) {
  setCellState(Object.fromEntries(options.map((o) => [o.id, state])));
  setAnnouncement(`All dates set to ${STATE_META[state].label}`);
}
```
```tsx
{!disabled ? (
  <div className="flex flex-wrap gap-2">
    <Button type="button" variant="outline" className="h-11" onClick={() => setAll("yes")}>
      <Check aria-hidden /> Set all Available
    </Button>
    {/* ...Set all Not available, Clear... */}
  </div>
) : null}
```

Closed/read-only chip pattern to preserve (lines 142-146) — non-interactive `<span>`, NOT a disabled `<button>`:
```tsx
{disabled ? (
  <span className={cellClasses}>
    <Icon aria-hidden className="size-4" />
    <span>{meta.label}</span>
  </span>
) : ( /* interactive cell */ )}
```

aria-live region to preserve verbatim (lines 90-92):
```tsx
<div aria-live="polite" className="sr-only">
  {announcement}
</div>
```

`onChange` emission effect to preserve verbatim (lines 65-69) — fires on every `cellState` change including mount:
```typescript
useEffect(() => {
  onChange(options.map((o) => ({ optionId: o.id, state: cellState[o.id] ?? "no" })));
}, [cellState, options, onChange]);
```

Date labeling — always via `formatDateWithTime`, never `new Date` (lines 42-47):
```typescript
function optionLabel(opt: GridOption): string {
  return formatDateWithTime(opt.date, opt.startTime ? opt.startTime.slice(0, 5) : null);
}
```

`GridOption`/`VoteState` re-export contract to preserve (lines 26-36) — `vote-form.tsx` and both participant-route pages import these types from this module; do not move them:
```typescript
export type { VoteState };
export type GridOption = { id: string; date: string; startTime: string | null; };
```

**Analog B — grid layout/column/tint pattern to ADOPT from `results-grid.tsx` (results-grid.tsx, full file, 318 lines):**

Column header with icon+text+tint pattern to mirror for the matrix's persistent desktop column headers (lines 228-251 — adapt from a data-tally header to a static state-label header: empty label cell + 3 state header cells, each `<Icon/> {STATE_META[state].label}`):
```tsx
<th scope="col" className={cn("px-3 py-2 align-bottom text-center", isBest && "bg-emerald-50")}>
  <div className="flex flex-col items-center gap-1">
    <span className="text-sm font-semibold whitespace-nowrap">{optionLabel(opt)}</span>
    {isBest ? <BestDayBadge /> : null}
    <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
      {r?.yes ?? 0} yes · {r?.ifneedbe ?? 0} if-need-be
    </span>
  </div>
</th>
```
For the Matrix column headers, the per-state header cell is simpler (icon + label only, no tally/badge — those belong to `ResultsGrid`, not the vote grid):
```tsx
<div className="flex items-center justify-center gap-1 text-sm font-semibold">
  <Icon aria-hidden className="size-4" /> {meta.label}
</div>
```

Cell tint/border/icon class composition pattern to mirror for selected vs. unselected matrix cells (lines 296-306) — `STATE_META[state].className` drives bg/text/border, composed via `cn()`:
```tsx
<span className={cn(
  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
  meta.className,
)}>
  <Icon aria-hidden className="size-3.5" />
  {meta.label}
</span>
```
For the Matrix's 44×44 radio cells, unselected cells override to `bg-white border-border` (empty) per D-07/DESIGN.md §4, rather than reusing `meta.className` for unselected — only the SELECTED cell gets the full `meta.className` tint.

`cn()` import for conditional class composition (line 32):
```typescript
import { cn } from "@/lib/utils";
```

Desktop-only vs. mobile-fallback structural precedent: `ResultsGrid` uses `overflow-x-auto` + a horizontal scroll-fade for narrow viewports rather than a stacked mobile layout (lines 214-215, `SCROLL_FADE_STYLE`) — this is NOT the pattern to copy for the vote grid (D-03 requires a genuinely different mobile layout: stacked segments, not horizontal scroll). Note this distinction explicitly for the planner: Matrix's mobile fallback is a conditional render swap (`hidden sm:block` matrix vs. `sm:hidden` stacked segments), not a scroll-container trick.

**New radio semantics (no existing analog in repo — build from WCAG pattern in DESIGN.md/CONTEXT.md D-06):**
```tsx
<div role="radiogroup" aria-label={label}>
  {(["yes", "ifneedbe", "no"] as VoteState[]).map((s) => {
    const meta = STATE_META[s];
    const Icon = meta.Icon;
    const checked = state === s;
    return (
      <button
        key={s}
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={`${label}: ${meta.label}`}
        onClick={() => selectCell(opt, s)}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
          checked ? meta.className : "bg-white text-transparent border-border",
        )}
      >
        <Icon aria-hidden className="size-4" />
      </button>
    );
  })}
</div>
```

---

### `src/components/availability-grid.test.tsx` (rewrite)

**Analog A — test file structure/idioms (current `availability-grid.test.tsx`, full file, 111 lines):**
```typescript
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { AvailabilityGrid, type GridOption } from "./availability-grid";

afterEach(() => cleanup());

const OPTIONS: GridOption[] = [
  { id: "opt-1", date: "2026-07-12", startTime: null },
  { id: "opt-2", date: "2026-07-19", startTime: "14:00:00" },
];
```
Keep this exact `OPTIONS` fixture and `afterEach(() => cleanup())`. Rewrite the query helper (currently `cellButtons` finds `role: "button"` — must become `screen.getAllByRole("radio", { name: ... })` scoped `within` a `radiogroup`), and rewrite assertions for:
- "renders every untouched cell with... Not available" → now assert `aria-checked="true"` on the "no" radio per row (lines 33-42 pattern retained, role swapped).
- "Set all Available..." (lines 44-63) → same bulk-action + single-override flow, but override now is a direct `fireEvent.click` on the "yes" radio of a row's `radiogroup`, not a cycle-click.
- "seeds cell state from initial prop" (lines 74-84) — unchanged behavior, only the query role changes.
- "emits serialized votes via onChange" (lines 86-96) — unchanged, copy verbatim.
- "renders read-only cells as non-interactive spans" (lines 98-110) — unchanged goal; `queryAllByRole("radio")` should be empty when `disabled`.

**Analog B — aria/role assertion idioms from `results-grid.test.tsx`** (lines 1-60 read; multi-cell + `within()` + `aria-live` conventions):
```typescript
import { within } from "@testing-library/react";
// ...
expect(within(cell).getByText("Not available")).toBeTruthy();
```
Use this `within(cell)` idiom for the new column-header-association test (assert each icon-only desktop radio cell's accessible name references the column's state label via `aria-label`, mirroring how `ResultsGrid` colocates icon+label inside one wrapper it queries with `within`).

**New a11y tests to add (no existing analog — synthesize from D-06/D-08):**
1. Column-header association test: render at desktop width assumption (jsdom has no real viewport, so assert via DOM structure — e.g., column header `th`/`div` text content matches each radio's `aria-label` suffix) — pattern: query `getAllByRole("columnheader")` if using a semantic grid, or query the header row's rendered labels directly and cross-check against each `radio`'s `aria-label`.
2. Mobile segmented fallback test: since jsdom doesn't evaluate CSS media queries by default, either (a) render the mobile-only markup unconditionally alongside desktop (both exist in DOM, CSS hides one via `sm:hidden`/`hidden sm:block`) and assert the mobile segment DOM nodes carry both icon and visible text directly (not only `aria-label`), confirming D-03's "no icon-only cells at mobile width" — query via `getAllByRole("radio")` scoped to the mobile container and assert `within(cell).getByText(meta.label)` succeeds (this is the key difference from the desktop cell, which has no visible text child).

---

### `src/components/results-grid.tsx`, `invite-by-email-form.tsx`, `book-it-control.tsx`, `poll-create-form.tsx`, `calendar-date-picker.tsx` (pixel-target only)

No structural change (D-09). These exist and are mounted as follows — planner should target drift fixes only, not rewrites:
- `results-grid.tsx` — mounted from the admin results page (`src/app/a/[adminUrlId]/page.tsx`, not read in this pass but referenced in CONTEXT.md); renders participants × dates table with best-day tint + tallies + Date/Status filter (see full excerpt above).
- `invite-by-email-form.tsx` — single file under `src/components/`; a Textarea + `Send invites` Server Action form with per-recipient chip states.
- `book-it-control.tsx` — has a companion `book-it-control.test.tsx`; two-step confirm pattern (`type="button"` reveal → `type="submit"` commit), per CONTEXT D-05/specifics.
- `poll-create-form.tsx` — single file; Server Action create form (title/description/location + candidate dates).
- `calendar-date-picker.tsx` — single file; client-island month calendar, `mode="multiple"`, mirrors `AvailabilityGrid`'s "client island + serialize" precedent explicitly noted in the current grid's own file header comment (line 8: "the same client-island + serialize pattern calendar-date-picker uses").

Since none of these need structural changes, no deeper excerpt extraction was performed (per the read-first budget); the planner's per-screen drift-fix plans should Read each file directly when doing the visual-adjust pass.

---

### `src/lib/vote-state.ts` (verbatim reuse — palette/label/icon source of truth)

Full file (51 lines) is the load-bearing shared vocabulary. Excerpt the `STATE_META` map to reuse verbatim in the new matrix cell and column headers — do not duplicate or restate these values anywhere else:

```typescript
export type VoteState = "yes" | "ifneedbe" | "no";

export const STATE_META: Record<
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

export function normalizeVoteState(state: string | undefined): VoteState {
  return state === "yes" || state === "ifneedbe" ? state : "no";
}
```
Import convention used by both current consumers: `import { STATE_META, type VoteState } from "@/lib/vote-state";` (availability-grid.tsx line 24) and `import { STATE_META, normalizeVoteState, type VoteState } from "@/lib/vote-state";` (results-grid.tsx line 30). The Matrix rewrite is write-side and does not need `normalizeVoteState` (it holds authoritative in-memory state, not DB-sourced votes) — only `STATE_META`.

---

### `src/lib/email/templates.ts` (D-10 — `calLink` signature change)

Current signature and call sites (lines 162-167) to modify — add a `background` param, threading Google `#1a73e8` vs. neutral `#171717` (== existing `FG` constant) per provider:

```typescript
const calLink = (href: string, label: string) =>
  `<a href="${href}" style="display:inline-block; background-color:${FG}; color:${BG}; font-size:14px; font-weight:600; text-decoration:none; padding:10px 16px; border-radius:8px; margin:0 8px 12px 0;">${label}</a>`;
const calendarLinks = [
  googleCalendarUrl ? calLink(googleCalendarUrl, "Add to Google Calendar") : "",
  icsUrl ? calLink(icsUrl, "Add to Apple / Outlook Calendar") : "",
].join("");
```

Proposed change (minimal diff, preserving every other line/behavior including the "omitted cleanly when the calendar build fails" invariant at lines 164-166):
```typescript
const calLink = (href: string, label: string, background: string) =>
  `<a href="${href}" style="display:inline-block; background-color:${background}; color:${BG}; font-size:14px; font-weight:600; text-decoration:none; padding:10px 16px; border-radius:8px; margin:0 8px 12px 0;">${label}</a>`;
const GOOGLE_BLUE = "#1a73e8";
const calendarLinks = [
  googleCalendarUrl ? calLink(googleCalendarUrl, "Add to Google Calendar", GOOGLE_BLUE) : "",
  icsUrl ? calLink(icsUrl, "Add to Apple / Outlook Calendar", FG) : "",
].join("");
```
`FG` is already defined at line 23 (`const FG = "#171717";`) — reuse it as the Apple/Outlook color, do not introduce a second neutral constant.

---

### Vote-screen host pages — `src/app/p/[participantUrlId]/page.tsx` (+ edit/thanks)

Full file read (94 lines). `AvailabilityGrid` is not mounted directly here — it is nested inside `VoteForm` (`src/components/vote-form.tsx`, not read in this pass; out of the explicit rewrite scope but is the direct parent and owner of the hidden `votes` form field per the current grid's file-header comment, line 9). The page's contract with the grid subsystem, to preserve unchanged through the Matrix rewrite:

```typescript
import type { VoteState } from "@/components/availability-grid";
// ...
<VoteForm
  action={isReturning ? updateResponse : submitResponse}
  participantUrlId={participantUrlId}
  editToken={isReturning ? editToken : undefined}
  options={options.map((o) => ({ id: o.id, date: o.date, startTime: o.startTime }))}
  initialName={priorParticipant?.name ?? ""}
  initialEmail={priorParticipant?.email ?? ""}
  initialVotes={priorVotes ?? undefined}
  readOnly={poll.status !== "open"}
  submitLabel="Submit availability"
  pendingLabel="Submitting..."
/>
```
Key invariant for the planner: `readOnly={poll.status !== "open"}` is the same boolean that becomes `AvailabilityGrid`'s `disabled` prop downstream — the Matrix rewrite must preserve this exact prop threading (no renaming `disabled`→something else without updating `vote-form.tsx`). The `VoteState` type re-export from `availability-grid.tsx` (not `vote-state.ts`) is imported here — confirms the type re-export in the rewrite (Analog A note above) must be kept for this import to keep resolving.

The edit page (`src/app/p/[participantUrlId]/edit/[editToken]/page.tsx`) and thanks page were not read in full (out of rewrite scope, page-mount contract is symmetric per CONTEXT.md — edit page prefills the same `VoteForm`/`AvailabilityGrid` with `submitLabel="Save changes"`); planner should read them directly if the edit-page heading/copy needs pixel reconciliation (D-09).

---

## Shared Patterns

### Icon-or-color-never-alone (WCAG AA)
**Source:** `src/lib/vote-state.ts` (`STATE_META`), enforced identically in both `availability-grid.tsx` (current, lines 133-135, 143-146, 154-156) and `results-grid.tsx` (lines 297-306).
**Apply to:** every new Matrix cell (icon-only desktop) and every mobile segment (icon+text) — desktop satisfies the rule via the column header carrying the text, not the cell itself; document this exception explicitly in the new component's file-header comment (mirroring the current file's comment block at lines 10-19).

### aria-live announcement, set OUTSIDE the state updater
**Source:** `availability-grid.tsx` lines 76-80 (current) and `results-grid.tsx` lines 111-124 (`announceFilter`) — both explicitly comment that this avoids a React 19 Strict/concurrent double-invocation desync (`post-quick-task-260701-il0` referenced in results-grid.tsx line 23).
**Apply to:** the Matrix's `selectCell`/`setAll` functions — keep announcement logic outside the `setCellState` updater exactly as today.

### `cn()` utility for conditional Tailwind class composition
**Source:** `src/lib/utils.ts` (`cn`), used in `results-grid.tsx` line 32 import, lines 235-238, 292-295, 298-301.
**Apply to:** Matrix cell selected/unselected class composition (current grid uses raw template-literal string concatenation at line 134 — `${meta.className}` inline; the rewrite should adopt `cn()` to match `ResultsGrid`'s more recent convention for multi-branch class logic).

### Date labeling via `formatDateWithTime`
**Source:** `src/lib/format-date.ts`, used identically in `availability-grid.tsx` lines 42-47 and `results-grid.tsx` lines 52-57.
**Apply to:** unchanged — Matrix rewrite keeps the same `optionLabel` helper verbatim.

### Never-blank / normalize-to-"no" invariant
**Source:** `src/lib/vote-state.ts` `normalizeVoteState` doc comment (lines 41-50) and `availability-grid.tsx` file header (lines 14-16).
**Apply to:** Matrix's default `cellState` seed (`initial?.[o.id] ?? "no"`) — identical to current; do not change the fallback literal.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| Matrix `role="radiogroup"`/`role="radio"` markup | — (new sub-pattern within availability-grid.tsx) | request-response | No radio-semantics component exists yet in the repo; synthesized from DESIGN.md §4/§6 and WCAG ARIA radiogroup pattern — not copied from any shipped analog |
| Mobile `<640px` segmented-fallback conditional render (desktop matrix vs. stacked list, same component) | — (new sub-pattern) | request-response | `ResultsGrid`'s narrow-viewport strategy (horizontal scroll-fade, lines 214-215/43-50) is architecturally different and explicitly NOT the pattern to reuse (see note under Analog B above) |

---

## Metadata

**Analog search scope:** `src/components/`, `src/lib/vote-state.ts`, `src/lib/email/templates.ts`, `src/app/p/[participantUrlId]/`
**Files read in full:** `availability-grid.tsx` (165 lines), `availability-grid.test.tsx` (111 lines), `results-grid.tsx` (318 lines), `vote-state.ts` (51 lines), `templates.ts` (182 lines), `page.tsx` (94 lines, participant route)
**Files read partially:** `results-grid.test.tsx` (60/? lines — enough to confirm test idioms)
**Files located but not opened (pixel-target, out of structural-change scope):** `invite-by-email-form.tsx`, `book-it-control.tsx` (+ `.test.tsx`), `poll-create-form.tsx`, `calendar-date-picker.tsx`
**Pattern extraction date:** 2026-07-02

# Phase 1 — UI Design Contract DELTA: Calendar Date Selection

**Status:** Draft → for edge-probe + planning
**Created:** 2026-06-30
**Type:** Delta to `01-UI-SPEC.md` (Surface 1 only). Everything not restated here is unchanged.
**Requirement:** POLL-05. Satisfies POLL-03 / POLL-04 through the new picker.
**Design source:** `01-04-DESIGN-calendar-date-selection.md` (approved 2026-06-30).

This delta **replaces** the "Candidate dates section" (item 5 of Surface 1's field order) and the
"Date row structure" / "Date Row — Add / Remove" blocks of `01-UI-SPEC.md`. Title / description /
location fields, validation copy, pending state, and the hidden `dates` submit contract are unchanged.

---

## Surface 1 delta: Candidate dates → Month calendar multi-select

The repeating "Add date" rows are retired. The **Candidate dates** section becomes a two-pane picker
that stacks vertically on mobile (`flex-col lg:flex-row`).

```
┌─ Candidate dates ─────────────────────────────────────────┐
│  ‹  October 2026  ›        │  Default start time            │
│  Su Mo Tu We Th Fr Sa      │  [ 12:00 ]  [Apply to all]     │
│         1  2  3 [4]        │  ────────────────────────────  │
│   5  6  7  8  9 10[11]     │  Selected dates (3)            │
│  12 13 14 15 16 17 18      │  Sat, Oct 4   [12:00]   ×      │
│  19 20 21 22 23 24 25      │  Sun, Oct 5   [12:00]   ×      │
│  26 ...                    │  Sat, Oct 11  [12:00]   ×      │
│  (past days disabled)      │                                │
└───────────────────────────────────────────────────────────┘
```

### Left pane — calendar
- shadcn `Calendar` (`mode="multiple"`), `lucide` chevrons, month navigation (‹ ›).
- Selected days render in the calendar's selected state; clicking a selected day **deselects** it.
- **Past days are `disabled`** (`disabled={{ before: <today, local midnight> }}`) — cannot be selected,
  and cannot be removed via the calendar (they are never selectable in the first place).
- Section heading "Candidate dates" (Heading / 24px / semibold) is retained above the picker.

### Right pane — Default start time + Selected dates list
- **Default start time** control: a `<input type="time">` (shadcn `Input`, `h-11`) + an **"Apply to all"**
  button (`variant="outline"`). Clicking "Apply to all" writes the control's current value into **every**
  selected date's start-time field at once. If the control is blank, "Apply to all" **clears** every
  date's time (the "all day / clear times" affordance). Per-date edits made afterward still win.
- **Selected dates list**, auto-sorted **chronologically** (date asc, blank time first within a day —
  mirrors the action's existing `ORDER BY date, start_time NULLS FIRST`). Each entry:
  - Read-only date label via `formatDateOnly()` (e.g. "Sat, Oct 4"), built string-only, never `new Date(str)`.
  - An **optional** `<input type="time">` for that date's start time (`h-11`). Blank = date-only (valid).
  - A `×` remove control (`variant="ghost" size="icon"`, `Trash2`, `aria-label="Remove {formatted date}"`).
- List header shows the count: "Selected dates (N)".
- **Empty state** (no days picked): muted helper text — "Pick days on the calendar to add candidate dates."

### Submit contract (UNCHANGED)
- The selected dates serialize to the **existing hidden `<input name="dates">`** as
  `[{ date: "YYYY-MM-DD", startTime: "HH:MM" | null }, ...]`, sorted chronologically.
- Untouched form → `[]` → existing "Add at least one candidate date" error (no change to `createPoll`).
- `date` strings are built from a **local** `Date` (`getFullYear()/getMonth()+1/getDate()`), zero-padded —
  **never** `toISOString()` / `toJSON()` / any UTC getter. (See Prohibitions; this is the load-bearing rule.)

---

## Interaction States (delta)

### Calendar — Add / Remove
- **Add**: clicking an enabled day inserts it into the Selected-dates list at its chronological position
  and marks the day selected in the calendar. New date inherits a **blank** start time (date-only) unless
  the user later sets one or uses "Apply to all".
- **Remove**: clicking a selected day again, OR the list row's `×`, removes it from both list and calendar.
- No minimum-row scaffolding (the old "always one row" rule is gone). Zero selected dates is a valid
  *interim* UI state; it is rejected only on submit by the unchanged min-1 validation.

### Apply to all
- Writes the Default-start-time value into every selected date's time field (blank value → clears all).
- Idempotent; affects only currently-selected dates. Dates added afterward are not retroactively stamped.

### Pending state (delta)
- While the action is in-flight (`isPending`): the calendar, every per-date time input, the Default
  start-time input, "Apply to all", and every `×` are `disabled` (consistent with the existing form-wide
  disable-on-pending rule).

### Past-date warning
- The old soft "This date is in the past" amber warning is **removed** — past days are now hard-disabled
  in the calendar, so a past date can never enter the list. (Net simplification, not a regression: the
  prior warning was non-blocking; the new behavior is strictly stronger.)

---

## Copywriting Contract (delta)

| Element | Copy | Notes |
|---------|------|-------|
| Section heading | "Candidate dates" | unchanged (Heading) |
| Default time label | "Default start time" | Label / 14px |
| Apply-all button | "Apply to all" | `variant="outline"` |
| Selected list header | "Selected dates (N)" | N = live count |
| Empty state | "Pick days on the calendar to add candidate dates." | `text-muted-foreground` |
| Per-date remove a11y | "Remove {formatted date}" | e.g. "Remove Saturday, October 4" |

All other Surface-1 copy (title/description/location placeholders, error strings, "Create poll" CTA,
"Creating…") is unchanged from `01-UI-SPEC.md`.

---

## Accessibility (delta)
- Calendar keyboard nav and ARIA are provided by `react-day-picker` (roving tabindex, `aria-selected`).
- Each per-date time input has an associated `<label>` (sr-only is acceptable): "Start time for
  {formatted date} (optional)".
- The Default start-time input has a visible "Default start time" label; "Apply to all" is a real
  `<button type="button">` (never a submit).
- Remove buttons carry an `aria-label` naming the specific date (above), not a generic "Remove".

---

## Registry Safety

| Registry | Blocks Used | Transitive deps | Safety Gate |
|----------|-------------|-----------------|-------------|
| shadcn official (`ui.shadcn.com`) | `calendar` | `react-day-picker`, `date-fns` | Not required — official registry only |

`npx shadcn@latest add calendar` copies `src/components/ui/calendar.tsx` (we own the source) and adds
`react-day-picker` + `date-fns` to `dependencies`. `date-fns` is used for the **month label only**; it is
**not** used for the picker→string conversion (that is hand-rolled local-component math — see Prohibitions).
No third-party registries.

---

## New Data Shapes (why the full edge-probe engine runs, not prohibition-only)

Per the project edge-probe policy, a UI-SPEC normally gets prohibition-probe only. This delta is the
exception: it introduces **two genuinely new data shapes** at the input layer, so the **deterministic
edge-engine is also run** (design §8 step 2):

1. **`Date` → `"YYYY-MM-DD"` conversion** — `react-day-picker` hands back JS `Date` objects; converting
   them to the stored string is a new transform with a timezone failure mode (see P3-input below).
2. **Multi-date chronological ordering + dedupe at the input layer** — the list maintains sorted order and
   set semantics (no duplicate day) as the user clicks; previously the action was the only place ordering
   happened.

---

## Prohibitions (UI — prohibition-probe + input-layer edge)

Upstream-covered items are NOT re-probed: admin-link leak (SPEC P2), and the *display/storage* `new Date()`
TZ shift (SPEC P3) remain in force. This delta adds the **input-layer** surface of P3 plus picker-specific
must-NOTs.

| # | Prohibition (must-NOT statement) | Surface | Verification |
|---|----------------------------------|---------|--------------|
| P3-input | MUST NOT derive the stored `YYYY-MM-DD` from a selected `Date` via `toISOString()` / `toJSON()` / any UTC getter — the day MUST be built from local `getFullYear()/getMonth()+1/getDate()`. (Third surface of PLAT-04 / P3, now at *input*.) | Calendar → hidden `dates` | **test** — a clicked day yields the identical `YYYY-MM-DD` under `TZ=Pacific/Kiritimati` (UTC+14) and `TZ=Etc/GMT+12` (UTC−12); the dual-TZ harness from Phase 1. |
| P-dupe | MUST NOT emit the same `(date)` twice in the payload from repeated calendar interaction — clicking an already-selected day removes it; the list holds each day at most once. | Selected dates list | test — toggling a day on→off→on leaves exactly one entry; payload has no duplicate date. |
| P-order | MUST NOT submit dates in click order — the payload MUST be chronologically sorted (date asc, blank time before timed within a day) so it matches the action's existing position ordering even before the action re-sorts. | Hidden `dates` | test — pick days out of order; serialized payload is sorted. |
| P-applyclear | MUST NOT have "Apply to all" silently do nothing or only stamp *some* dates — with a value it stamps every selected date; blank clears every selected date. No partial application. | Apply-to-all | test — N selected dates all receive the applied time; blank clears all N. |
| P-pastghost | MUST NOT allow a past day into the list by any path (it is disabled in the calendar; there is no text entry). | Calendar | test/manual — disabled days are not selectable; list never contains a `date < today (local)`. |

These become `must_haves` (negative acceptance) for `01-04-PLAN.md` and the verifier.

---

## Edge-Probe Resolution (full family — engine + prohibition-probe)

Deterministic engine run on POLL-05 (`edge-probe.cjs`) surfaced 5 categories; all resolved:

| Category | Probe | Resolution |
|----------|-------|------------|
| adjacency | Two equal things merge/collide/separate? | Day-level multi-select holds each calendar day **at most once** (P-dupe). The UI cannot produce the same date twice, nor the same date with two different times (one time per selected day). Action's app-layer dedupe + DB `NULLS NOT DISTINCT` unique remain as belt-and-suspenders. **Resolved.** |
| empty | Empty / single / null input? | Zero selected → payload `[]` → existing min-1 "Add at least one candidate date" error (empty-state copy guides the user). Single day → one row. Blank time → date-only `startTime: null` (valid). **Resolved (unchanged validation).** |
| ordering | Equal elements — order specified & stable? | P-order: chronological sort (date asc, blank-time-first within a day). Each day appears once, so no two entries share a date → total, stable order. Matches the action's existing `ORDER BY date, start_time NULLS FIRST`. **Resolved.** |
| idempotency | Runs twice on same input? | Toggling a day on→off→on yields one entry (P-dupe). "Apply to all" is idempotent (P-applyclear). Re-submitting the form creating a second distinct poll is the action's existing, intended behavior (separate tokens) — unchanged. **Resolved.** |
| concurrency | Interrupted / parallel guarantees? | Selected-dates state is **client-side React state, single-threaded** — no parallel list mutation. Server-action concurrency (token-collision retry, options insert) is **unchanged** and already covered by Phase 1's create-poll tests. **Not applicable to this UI delta.** |

Prohibition-probe (manual) — "what could this UI silently become that the author would NOT want?" — confirmed
P3-input, P-dupe, P-order, P-applyclear, P-pastghost (above) and surfaced **two refinements** of the P3
timezone family, folded into the plan's conversion-helper contract:

- **Single source of truth:** the date label shown in the Selected-dates list and the `date` in the payload
  MUST derive from the **same** canonical local-`Date`→string conversion (convert once; never two paths that
  could disagree).
- **Local-midnight "today":** the calendar's disabled-past matcher MUST compute "today" from local
  `getFullYear()/getMonth()/getDate()` (reuse Phase 1's `todayLocalIso` approach), never a UTC-derived date,
  or the boundary day could be wrongly enabled/disabled under extreme offsets.
- **No reverse string→Date parse:** the calendar's selected `Date[]` is built from the user's clicked `Date`
  objects (kept in state), **not** re-parsed from stored `YYYY-MM-DD` via `new Date("YYYY-MM-DD")` (design §5).

No edge left unresolved.

## Checker Sign-Off
- [x] Copywriting · [x] Visuals · [x] Color · [x] Typography · [x] Spacing · [x] Registry Safety

**Approval:** APPROVED (2026-06-30) — full edge-probe family resolved; ready for `01-04-PLAN.md`.

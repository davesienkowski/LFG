---
phase: 260703-ppz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/a/[adminUrlId]/page.tsx
  - src/components/book-it-control.tsx
autonomous: true
requirements: [UI-P1]
must_haves:
  truths:
    - "On the admin page, the candidate-date echo renders as a horizontal, wrapping row of compact bordered chips (flex-wrap) instead of one date per line (flex-col)"
    - "In the Book-it finalize control, the candidate-date radio options render as a horizontal, wrapping row of tappable bordered chips (flex-wrap) instead of a vertically stacked list (flex-col)"
    - "Each interactive Book-it chip has a touch-adequate tap target of at least 44px minimum height (min-h-11 = 2.75rem = 44px; no html root font-size override in globals.css) per Fitts's Law"
    - "All radio semantics are preserved: name=winningOptionId, value=opt.id, defaultChecked on the preselected best/first option, disabled while isPending, native size-4 radio still present and keyboard-focusable"
    - "The emerald 'Suggested' badge still renders on best-day options, and the two-step confirm disclosure (Book this date -> amber confirm panel -> Confirm and close poll) is untouched"
    - "The whole Book-it chip is clickable to select its radio (label wraps the visible native radio) — the enlarged label IS the Fitts's-Law tap target, and the native radio stays visible so the selected date is obvious (edge: prohibition-probe — must NOT become a hidden/custom control)"
    - "Chips wrap to new rows via flex-wrap and never force horizontal overflow/scroll on narrow (mobile) viewports; a long date string wraps its text rather than overflowing the container (edge: HORIZ-02 boundary)"
    - "Candidate-date visual order stays chronological: options.map iteration order is unchanged and flex-wrap preserves DOM source order (LTR, top-to-bottom) — Book-it's chronologically-first-best preselection still holds (edge: HORIZ-01 ordering)"
    - "Dates in both places still render via formatDateWithTime (string-based, D-11/P3) — no new Date() on the date-only value"
    - "npm test (176/176) and npm run build both stay green; no data, query, schema, or migration change"
  artifacts:
    - path: "src/app/a/[adminUrlId]/page.tsx"
      provides: "Horizontal wrapping candidate-date chip list on the admin echo"
      contains: "flex flex-wrap"
    - path: "src/components/book-it-control.tsx"
      provides: "Horizontal wrapping tappable radio chips in the Book-it fieldset"
      contains: "flex flex-wrap"
  key_links:
    - from: "src/components/book-it-control.tsx"
      to: "closePoll winningOptionId submission"
      via: "native radio name=winningOptionId value=opt.id (unchanged)"
      pattern: "name=\"winningOptionId\""
    - from: "src/app/a/[adminUrlId]/page.tsx"
      to: "formatDateWithTime"
      via: "date-only string formatter (D-11/P3)"
      pattern: "formatDateWithTime"
---

<objective>
Make the two vertically-stacked candidate-date lists render as compact,
horizontal, wrapping chip rows instead of one date per line:

1. The admin page (`src/app/a/[adminUrlId]/page.tsx`) `<ul>` that echoes the
   poll's candidate dates (currently `flex flex-col gap-1`, one `<li>` per line).
   This list is DISPLAY-ONLY (non-interactive), so the chips can be small/static.
2. The Book-it finalize control (`src/components/book-it-control.tsx`) `<fieldset>`
   "Candidate dates" radio list (currently `flex flex-col gap-2`, one `<label>`
   per line). These chips ARE interactive (radios), so each must stay a
   comfortably tappable target on touch (>= 44px tall, per Fitts's Law).

Purpose: on a poll with several candidate dates, the vertical one-per-line
layout wastes vertical space and reads as a long scroll; a wrapping chip row is
compact and scannable — matching how the rest of the surface already uses pill
chips ("Booked", "Keep private", "Suggested").

Output: two modified files. This is a PURE presentation/layout change — no data,
no query, no schema, no migration, no change to radio semantics or the finalize
flow.

**Load-bearing invariants (DO NOT change — only the LAYOUT changes):**
- The Book-it two-step confirm disclosure: "Book this date" stays `type="button"`
  (reveals the amber panel, never submits); "Confirm and close poll" stays the
  only `type="submit"`; "Keep poll open" still collapses with no side effects.
- Native radio semantics: `name="winningOptionId"`, `value={opt.id}`,
  `defaultChecked={opt.id === preselectedId}`, `disabled={isPending}`, and the
  `size-4` radio input remain exactly as-is. Do not switch to a custom control —
  the visible native radio must stay inside each `<label>` chip so the whole chip
  is clickable AND the selected date is obvious.
- The emerald "Suggested" badge on best-day options and the `bestIds`/`preselectedId`
  logic are untouched.
- `closePoll` wiring (the hidden `adminUrlId` input, `formAction`, `useActionState`)
  is untouched.
- Both places keep formatting dates via `formatDateWithTime(...)` — never
  `new Date()` on the date-only string (D-11/P3).
- Prefer semantic Tailwind tokens (`border`, `bg-muted`, `text-muted-foreground`)
  over `bg-white` — consistent with code-review note IN-01.
</objective>

<edge_probe>
Ran the full edge-probe family against this plan's NEW requirements (HORIZ-01..04).
All 14 candidate edges resolved/dismissed with source-backed reasons — none block
execution; the actionable ones are folded into must_haves above.

| Edge | Category | Disposition |
|------|----------|-------------|
| HORIZ-01/02 empty (0/1 options) | empty | RESOLVED — create-poll.ts:47 enforces `dates.array().min(1)`; a poll always has >=1 candidate date. Single option renders one chip; an (impossible) empty flex-wrap container is a no-op, identical to the prior flex-col. No regression. |
| HORIZ-01/02 adjacency | adjacency | RESOLVED — `gap-2` on a flex container applies to BOTH main-axis and cross-axis gaps, so wrapped chips keep spacing on every row (no collide/merge). |
| HORIZ-01 ordering | ordering | RESOLVED (folded) — options.map order untouched; flex-wrap preserves DOM source order visually (LTR, top-to-bottom). Chronological order + Book-it's chronologically-first-best preselection still hold. |
| HORIZ-02 boundary (44px) | boundary | RESOLVED (folded) — `min-h-11` = 2.75rem = exactly 44px; globals.css has NO `html{font-size}` override (only `font-sans`), and `min-h-11`/`h-11` is the existing project touch-target token. Meets >=44px exactly. Also folded: long date text wraps INSIDE the chip; flex-wrap prevents horizontal overflow on narrow viewports. |
| HORIZ-02 precision | precision | RESOLVED — no computed value/rounding; fixed rem token + no root-font override = deterministic 44px. |
| HORIZ-03 empty | empty | DISMISSED — preselectedId/two-step logic is left untouched by a layout-only change; >=1 option guarantees >=1 radio. Out of scope for this change. |
| HORIZ-03 encoding | encoding | DISMISSED — no string length/equality logic added; badge + date text unchanged. |
| HORIZ-04 adjacency/empty/encoding/ordering | (formatter) | DISMISSED — all concern `formatDateWithTime`, which is UNCHANGED (exact same call preserved). Covered upstream by format-date.test.ts + D-11/P3 spec; gate rule #3 forbids re-probing upstream-covered edges. |

Prohibition-probe (what could this silently become that the author would NOT want?):
- "Chip radio becomes hidden / a custom control" -> PREVENTED: plan keeps the visible
  native `size-4` radio inside each `<label>`; whole chip clickable, selection visible. (folded as truth + verify grep)
- "Two-step confirm regresses via the fieldset restructure" -> PREVENTED: plan forbids
  touching anything below the fieldset; verify greps for `type="button"` AND `type="submit"`.
- "Static admin echo chips look interactive" -> ACCEPTED-SAFE: echo uses static muted
  pills (no radio/border-focus, non-focusable) vs the bordered `cursor-pointer` Book-it chips — visually distinct.
</edge_probe>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/a/[adminUrlId]/page.tsx
@src/components/book-it-control.tsx
@src/lib/format-date.ts
@src/app/a/[adminUrlId]/page.test.ts
@src/components/book-it-control.test.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Convert both candidate-date lists to horizontal wrapping chips</name>
  <files>src/app/a/[adminUrlId]/page.tsx, src/components/book-it-control.tsx</files>
  <action>
Two independent layout edits. Do NOT touch any logic, data, or the finalize flow —
only the container flex direction and per-item chip styling change.

PART A — admin page echo (`src/app/a/[adminUrlId]/page.tsx`, the `<ul>` at ~lines
80-89). This list is non-interactive display-only, so use small static chips.
Change the `<ul>` container from `flex flex-col gap-1` to a wrapping row
`flex flex-wrap gap-2`. Change each `<li>` from `text-base` to a compact bordered
pill chip: an inline flex chip with `rounded-full border bg-muted px-3 py-1
text-sm` (or equivalent small static chip using semantic tokens — no `bg-white`).
Keep the `key={opt.id}` and keep the exact `formatDateWithTime(opt.date,
opt.startTime ? opt.startTime.slice(0, 5) : null)` call inside each chip. The
rendered date text must be byte-identical (the page test asserts "Sunday, July 12"
and "Sunday, July 19 at 2:00 PM" appear in the HTML).

PART B — Book-it fieldset (`src/components/book-it-control.tsx`, the `<fieldset>`
at ~lines 63-89). Keep the `<legend>Candidate dates</legend>` on its own line, but
wrap the option `<label>`s in a NEW inner `<div className="flex flex-wrap gap-2">`
so the labels flow horizontally and wrap. Keep the fieldset itself `flex flex-col
gap-2` so the legend stays above the chip row. Change each `<label>` from
`flex items-center gap-2 text-base` to a tappable bordered chip:
`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 py-2 text-base
cursor-pointer`. The `min-h-11` (2.75rem = 44px; no root font-size override exists,
verified) plus padding gives an adequate touch target (Fitts's Law), and the whole
label chip is clickable to select its radio. Optionally add a checked-state
affordance with the Tailwind v4 `has-[:checked]:` variant (e.g.
`has-[:checked]:border-foreground has-[:checked]:bg-muted`) — the project is
Tailwind 4.3.2 which supports it; skip it if unsure, the visible native radio
already indicates selection.
CRITICAL — leave every attribute of the `<input type="radio" ...>` exactly as-is:
`name="winningOptionId"`, `value={opt.id}`, `defaultChecked={opt.id ===
preselectedId}`, `disabled={isPending}`, `className="size-4"`. The native radio
stays VISIBLE inside the chip (do not hide it or swap to a custom control). Leave
the `{formatDateWithTime(...)}` call and the `{bestIds.has(opt.id) ? <span
...>Suggested</span> : null}` badge exactly as-is. Do NOT touch anything below the
fieldset (the "Book this date" button, the amber confirm panel, the submit/cancel
buttons, the hidden adminUrlId input, or the form/useActionState wiring). Keep the
`options.map` iteration order unchanged so chips stay in chronological order.
  </action>
  <verify>
    <automated>DATABASE_URL='postgres://postgres:password@localhost:5432/lfg' npm test 2>&1 | tail -20</automated>
    <automated>npm run build 2>&1 | tail -15</automated>
    <automated>grep -q "flex flex-wrap" "src/app/a/[adminUrlId]/page.tsx" && grep -q "flex flex-wrap" src/components/book-it-control.tsx && grep -q "min-h-11" src/components/book-it-control.tsx && echo LAYOUT_OK</automated>
    <automated>grep -q 'name="winningOptionId"' src/components/book-it-control.tsx && grep -q 'defaultChecked={opt.id === preselectedId}' src/components/book-it-control.tsx && grep -q 'className="size-4"' src/components/book-it-control.tsx && grep -q 'type="button"' src/components/book-it-control.tsx && grep -q 'type="submit"' src/components/book-it-control.tsx && echo SEMANTICS_INTACT</automated>
  </verify>
  <done>
`npm test` is green (all tests, incl. book-it-control.test.tsx radio/two-step and
page.test.ts candidate-date assertions — no test edits needed since neither
asserts on flex layout classes). `npm run build` is green. Both files use
`flex flex-wrap`; the Book-it chips carry `min-h-11` and a visible `size-4` radio.
The radio `name`, `defaultChecked`, `disabled`, `size-4`, the "Suggested" badge,
and the two-step confirm (`type="button"` trigger + single `type="submit"`) are
all unchanged. Dates still render via `formatDateWithTime`.
  </done>
</task>

</tasks>

<verification>
- `DATABASE_URL='postgres://postgres:password@localhost:5432/lfg' npm test` — all green.
- `npm run build` — green (no type/lint errors from the JSX changes).
- Visual (informational, not gating here): admin candidate-date echo and the
  Book-it radio list each render as a wrapping horizontal row of chips instead of
  a vertical stack; Book-it chips are comfortably tappable (>= 44px tall); long
  date strings wrap rather than overflow on a narrow viewport.
</verification>

<success_criteria>
- Both candidate-date lists render horizontally with wrapping chips (flex-wrap).
- Book-it chips remain touch-adequate (min 44px height) and fully clickable.
- No horizontal overflow on narrow viewports; long dates wrap inside the chip.
- Chronological order of candidate dates preserved.
- Zero change to radio semantics, the "Suggested"/best-day badge, the closePoll
  wiring, or the two-step confirm disclosure.
- Dates still formatted via `formatDateWithTime` (D-11/P3) — no `new Date()`.
- `npm test` + `npm run build` green; changes committed atomically. No deployment,
  no migration.
</success_criteria>

<output>
Create `.planning/quick/260703-ppz-compact-horizontal-candidate-date-lists-/260703-ppz-SUMMARY.md` when done.
Commit the two file changes atomically (e.g. `feat(ui): horizontal wrapping
candidate-date chips on admin echo + Book-it picker`). Do NOT deploy — the
orchestrator handles redeploy.
</output>

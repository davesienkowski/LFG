---
phase: 260703-ppz
plan: 01
status: complete
subsystem: ui
tags: [layout, tailwind, admin-page, book-it, chips]
requires: []
provides:
  - "Horizontal wrapping candidate-date chip row on the admin echo"
  - "Horizontal wrapping tappable radio chips in the Book-it fieldset"
affects:
  - src/app/a/[adminUrlId]/page.tsx
  - src/components/book-it-control.tsx
tech_stack:
  added: []
  patterns:
    - "flex-wrap chip rows for candidate-date lists (matches existing pill-chip surface language)"
    - "min-h-11 (44px) touch-adequate tappable label chip with visible native radio (Fitts's Law)"
    - "Tailwind v4 has-[:checked]: variant for checked-state chip affordance"
key_files:
  created: []
  modified:
    - src/app/a/[adminUrlId]/page.tsx
    - src/components/book-it-control.tsx
decisions:
  - "Admin echo chips are static muted pills (rounded-full border bg-muted) — visually distinct from the interactive bordered Book-it chips so the display-only list never reads as tappable"
  - "Book-it chips use semantic tokens (border, bg-muted) not bg-white, per code-review note IN-01"
  - "Added has-[:checked]:border-foreground has-[:checked]:bg-muted checked affordance (Tailwind 4.3.2 supports it); native size-4 radio stays visible so selection is obvious"
metrics:
  duration: 4min
  completed: 2026-07-03
---

# Phase 260703-ppz Plan 01: Compact Horizontal Candidate-Date Lists Summary

Converted the two vertically-stacked candidate-date lists (admin page echo + Book-it finalize picker) into compact, horizontal, wrapping chip rows — a pure presentation/layout change with zero data, query, schema, or radio-semantic modification.

## What Changed

**Part A — admin echo** (`src/app/a/[adminUrlId]/page.tsx`): the `<ul>` container went from `flex flex-col gap-1` to `flex flex-wrap gap-2`; each `<li>` from a bare `text-base` line to a compact static pill chip (`inline-flex items-center rounded-full border bg-muted px-3 py-1 text-sm`). The `key={opt.id}` and exact `formatDateWithTime(...)` call are preserved, so the rendered date text is byte-identical.

**Part B — Book-it fieldset** (`src/components/book-it-control.tsx`): the option `<label>`s are now wrapped in a new inner `<div className="flex flex-wrap gap-2">` so they flow horizontally and wrap; the fieldset itself stays `flex flex-col gap-2` so the legend remains above the chip row. Each `<label>` became a tappable bordered chip (`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-base has-[:checked]:border-foreground has-[:checked]:bg-muted`). `min-h-11` (2.75rem = 44px, no root font-size override) gives a Fitts's-Law-adequate touch target. Every radio attribute (`name="winningOptionId"`, `value={opt.id}`, `defaultChecked={opt.id === preselectedId}`, `disabled={isPending}`, `className="size-4"`), the "Suggested" badge, and everything below the fieldset (two-step confirm, submit/cancel buttons, hidden adminUrlId input, useActionState wiring) are untouched.

## Deviations from Plan

None — plan executed exactly as written. The optional `has-[:checked]:` checked-state affordance was included (Tailwind 4.3.2 supports it).

## Verification Results

- `DATABASE_URL='postgres://postgres:password@localhost:5432/lfg' npm test` — **176/176 passed** (21 files), incl. book-it-control.test.tsx radio/two-step and page.test.ts candidate-date assertions. No test edits needed.
- `npm run build` — **green** (compiled + TypeScript + static pages generated). Note: the build requires `DATABASE_URL` to be exported for the page-data-collection step (pre-existing env requirement, unrelated to this change); with it set the build succeeds cleanly.
- Grep gates: `LAYOUT_OK` (both files carry `flex flex-wrap`; Book-it carries `min-h-11`) and `SEMANTICS_INTACT` (`name="winningOptionId"`, `defaultChecked={opt.id === preselectedId}`, `className="size-4"`, `type="button"`, `type="submit"` all present).

## Self-Check: PASSED

- FOUND: src/app/a/[adminUrlId]/page.tsx (modified)
- FOUND: src/components/book-it-control.tsx (modified)
- FOUND commit: 32669ce

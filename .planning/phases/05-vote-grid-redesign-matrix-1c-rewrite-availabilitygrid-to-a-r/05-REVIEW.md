---
phase: 05-vote-grid-redesign-matrix-1c
reviewed: 2026-07-02T00:00:00Z
depth: deep
files_reviewed: 9
files_reviewed_list:
  - src/components/availability-grid.tsx
  - src/components/availability-grid.test.tsx
  - src/components/vote-form.tsx
  - src/components/results-grid.tsx
  - src/components/poll-create-form.tsx
  - src/components/calendar-date-picker.tsx
  - src/app/page.tsx
  - src/lib/email/templates.ts
  - src/lib/email/templates.test.ts
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-07-02
**Depth:** deep
**Files Reviewed:** 9
**Status:** issues_found (advisory — no BLOCKERs)

## Summary

Reviewed the diff of `b86b21e..HEAD` against `src/` for the Vote-Grid Redesign (Matrix / 1c). Two
files named in the review's stated scope — `src/components/invite-by-email-form.tsx` and
`src/components/book-it-control.tsx` — have **zero diff** in this range; they were not actually
touched by phase 5, so nothing to review there (confirmed by `git diff --stat`).

The `AvailabilityGrid` rewrite (05-01) is the load-bearing change and receives the most scrutiny.
It is well-executed: the never-blank default (D-04), idempotent re-selection (EDGE-IDEMPOTENT), the
frozen public contract (`disabled` / `onChange` / `GridOption` / `VoteState`), the
desktop/mobile display:none exclusivity (EDGE-A11Y-EXCL), and the closed-poll read-only chip path
all check out against the code and the test suite. No click-to-cycle dead code (`CYCLE`/`cycleCell`)
remains. No admin-URL leakage, no weakening of closed-poll read-only enforcement, and no collapsing
of the two-step finalize flow — none of those surfaces were touched by this phase's diff at all
(`book-it-control.tsx`/queries.ts untouched). The remaining five files (`vote-form.tsx`,
`results-grid.tsx`, `poll-create-form.tsx`, `calendar-date-picker.tsx`, `page.tsx`,
`templates.ts`) are cosmetic/pixel reconciliation with no logic changes — `calendar-date-picker.tsx`'s
diff is two Tailwind class-width tweaks only, so the timezone-safe date handling (D-11/P3) is
unaffected.

One real, if intentionally-traded-off, a11y correctness concern was found in the new radio-matrix
markup (WARNING below), plus one minor design-token consistency nit (INFO). Nothing here blocks
shipping; both are worth a follow-up.

## Warnings

### WR-01: `role="radio"` cells lack roving-tabindex / arrow-key navigation, deviating from the ARIA APG radiogroup pattern

**File:** `src/components/availability-grid.tsx:227-243` (desktop) and `:275-292` (mobile)
**Issue:** Every `role="radio"` cell is implemented as an independently-focusable `<button>` with no
`tabIndex={-1}` — this is a deliberate, documented trade-off (see the file's `EDGE-KBD` comment and
05-01-PLAN.md, which explicitly rules out roving tabindex to avoid a "partial implementation risk").
It does satisfy WCAG 2.1.1 (no keyboard trap, everything is Tab/Enter/Space reachable). However, it
diverges from the WAI-ARIA Authoring Practices composite-widget pattern that `role="radiogroup"` /
`role="radio"` imply: standard AT behavior (NVDA/JAWS/VoiceOver) for a native or ARIA radio group is
"Tab into the group once, then Arrow keys cycle the selection within the group," and many screen
readers announce exactly that instruction ("radio button, use arrow keys...") when focus lands on a
`role="radio"`. Here, Arrow keys are inert — pressing them does nothing — which can read as broken to
a screen-reader user who follows the announced affordance. It also **triples the Tab-stop count**
for the grid: a 10-date poll requires 30 Tab presses through radios (plus 3 for the bulk-action
row) instead of the 10 stops (one per group) a conforming roving-tabindex implementation would need,
materially degrading keyboard-only navigation efficiency for longer poll lists.
**Fix:** Given this was a conscious scope trade-off (not an oversight), the pragmatic fix is either
(a) implement roving tabindex + Left/Right (or Up/Down, matching APG for `aria-orientation`) inside
each `role="radiogroup"` — `tabIndex={checked ? 0 : -1}` per radio, plus an `onKeyDown` handler on the
group that moves focus and calls `selectCell`, or (b) if the trade-off is being kept intentionally
for scope reasons, downgrade the markup to a less AT-prescriptive pattern (e.g. `aria-pressed` toggle
buttons in a plain group, not `role="radio"`) so AT doesn't announce arrow-key affordances that don't
exist. Either resolves the mismatch between the announced ARIA semantics and actual keyboard behavior.

## Info

### IN-01: Unselected radio cells hardcode `bg-white` instead of the semantic `bg-background` token

**File:** `src/components/availability-grid.tsx:237` and `:286`
**Issue:** Every other surface in this codebase (including the rest of this same component's checked
state, via `STATE_META[...].className`) sources colors from the CSS custom-property tokens defined in
`globals.css` (`--background`, `--muted`, etc.), which have a working `.dark` variant already defined.
The new unselected-cell background is a literal `bg-white` Tailwind class in two places, bypassing the
token system. Dark mode isn't currently wired up to a UI toggle anywhere in the app today, so this is
inert right now, but it's a design-system consistency gap introduced by this phase (the old
click-to-cycle cell had no unhardcoded literal-white background) and would render incorrectly (a
bright white box in an otherwise dark UI) the moment dark mode is enabled.
**Fix:** Replace `bg-white` with `bg-background` in both the desktop (`:237`) and mobile (`:286`)
unselected-cell class strings.

---

_Reviewed: 2026-07-02_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

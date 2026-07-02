# Phase 5: Vote-Grid Redesign (Matrix / 1c) - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Source:** PRD Express Path (design_handoff_vote_grid_redesign/README.md) — Claude Design high-fidelity handoff

<domain>
## Phase Boundary

Redesign the **participant vote experience** to direction **1c "Matrix"** from the Claude Design
handoff, and reconcile every supporting screen + the three emails to the high-fidelity mocks.
This is an **evolution of the shipped Phases 1–4**, not a greenfield rebuild — it targets the
existing repo on `master` and merges back into it. The hero is the participant vote screen
`/p/[participantUrlId]` (mock states 2a–2e).

**In scope:** `AvailabilityGrid` rewrite (the one structural change), its test rewrite + new a11y
tests, visual reconciliation of the other screens/emails against the mocks (adjust only where they
drift), and one optional per-provider calendar-button color change in `templates.ts`.

**Out of scope:** any backend/data-model change; new requirements; dark mode; new fonts, UI
libraries, CSS approaches, tokens, or animation. No renaming of vote states.
</domain>

<decisions>
## Implementation Decisions (locked — from the handoff)

### D-01 — The one breaking change: AvailabilityGrid → radio matrix
`src/components/availability-grid.tsx` changes from a single click-to-cycle `<button>` per date
(`no→yes→ifneedbe→no`) to a **radio-style matrix**: each date row is a `role="radiogroup"` of three
`role="radio"` cells (Available / If-need-be / Not available), exactly one selected. Tap the state
you mean — no hidden cycling. The participant grid now mirrors the admin `ResultsGrid` layout (one
mental model across both surfaces).

### D-02 — Desktop (≥640px): icon-only cells + persistent labelled column headers
Desktop cells are **icon-only**; the icon **+** text label lives in a persistent column header
(`grid-template-columns: 1.6fr 1fr 1fr 1fr`; header row = empty label cell + three state headers).
a11y is satisfied at the column level — this is the only new a11y-load-bearing surface.

### D-03 — Mobile (<640px): stacked full-width icon+text segments
Collapse to stacked full-width segments (the `1a` layout), each **≥48px**, each carrying its own
icon **+** text — so **no icon-only cells exist at mobile width**. Primary action (submit / closed
banner) is `position: sticky` / pinned footer so a long date list never buries it (content scrolls,
action pinned). The prototype's `mobileScroll`/`mobileViewportH` knobs are demo-only.

### D-04 — Preserve the "never blank" invariant (data correctness)
Default/untouched row = **Not available** selected, never blank. This preserves the shipped Phase-2
invariant that an unclicked date reads `no`, which the results/counting path depends on.

### D-05 — Preserve bulk actions, closed read-only, and labels
Bulk-action row (VOTE-07): `Set all Available` / `Set all Not available` / `Clear`, ≥44px, above
the grid, **absent entirely when read-only**. Closed poll → each row renders a single
non-interactive chip (icon+text) of its chosen state; no matrix, no bulk row, no submit; "Voting is
closed" banner (`border bg-muted p-6`). Do **not** rename states or labels (`Available` /
`If-need-be` / `Not available`) — Doodle parity + shipped tests depend on them.

### D-06 — a11y (WCAG AA), icon-or-color-never-alone
Every state is icon **+** text (text via column header on desktop, on the segment itself on mobile);
never color alone. Radio cells expose `role="radio"` / `aria-checked` inside `role="radiogroup"` per
date row, `aria-label="{date}: {state}"`. Retain the existing `aria-live` announcement region.
Focus ring `ring-3 ring-ring/50` (shipped). Targets ≥44px (vote cells 44–48px).

### D-07 — Tokens, palette, type, spacing reused verbatim
No token moves. Reuse `src/app/globals.css` OKLCH tokens and the `src/lib/vote-state.ts` palette
(`yes`=emerald-50/700/300 `Check`; `ifneedbe`=amber-50/700/300 `CircleHelp`; `no`=muted/muted-foreground/border `X`)
exactly. Best-day highlight = emerald-100/800 + literal "Best" text badge. Type scale
Display 30 / Heading 24 / Body 16 / Label 14 / Caption·Badge 12, weights 400+600 only, Inter
(`--font-sans`), 8-pt spacing, `--radius: 0.625rem`.

### D-08 — Tests: rewrite the grid test + add a11y tests
`availability-grid.test.tsx` currently asserts click-to-cycle and **will break** — rewrite it to
assert radio semantics + the mobile segmented fallback + desktop column-header association. Add new
a11y tests: (a) icon-only desktop cells associate with their labelled column header; (b) the <640px
segmented fallback carries its own icon+text.

### D-09 — Other screens + emails are pixel targets (visual reconciliation only)
`ResultsGrid`, `InviteByEmailForm`, `BookItControl`, `PollCreateForm`, `CalendarDatePicker`, the three
email templates, and the `event.ics` route already exist (Phases 1–4). Treat the mocks (ids 3a–3h,
2a–2e) as pixel targets against the shipped structure — adjust Tailwind classes **only where they
drift** from the mocks. No structural rewrite of these. Prototype inline styles map to existing
utilities (`min-h-12`, `rounded-lg`, `border-emerald-300`, …) — no new utility or `@layer` rule.

### D-10 — Optional: per-provider calendar-button color (templates.ts)
`calLink()` in `src/lib/email/templates.ts` currently hardcodes a neutral background. Per the
handoff, give it a per-provider `background` argument so the two finalization-email calendar buttons
are distinguishable without icons (email clients strip images): **Google `#1a73e8`** vs neutral
**`#171717`** for Apple/Outlook. Decision: **implement the color differentiation** (clearer than an
outline-only shape difference); it is small, reversible, and email-HTML-only. Both buttons remain
omitted cleanly when the calendar build fails; admin `/a/` URLs never appear in any template.

### Claude's Discretion
Exact Tailwind class choices for the matrix grid, the precise sticky/pinned-footer implementation,
and per-screen drift fixes are left to implementation, provided they honor D-01..D-10 and reuse
existing primitives (`Card`, `Button`, `Input`, `Textarea`, `Label`). No new component library, CSS
approach, font, or token.

<assumption_delta_decision>
Primary noun = the participant **vote/response** (one selection per candidate date). Decision =
**no-change**: the Matrix redesign changes only the *input mechanic* (click-to-cycle → radio), not
the data identity — still exactly one of three states per date, `no` as the never-blank default. The
detector fired only on "fallback" (a responsive layout fallback, not a second entity) and "optional"
(the optional email tweak); neither introduces a competing identity. No promote/add-alongside needed.
</assumption_delta_decision>
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design contract (the handoff)
- `design_handoff_vote_grid_redesign/README.md` — scope, the one breaking change, tokens, per-screen anatomy, reconciliation notes.
- `design_handoff_vote_grid_redesign/DESIGN.md` — full `@theme` token block + the Matrix vote-cell system spec.
- `design_handoff_vote_grid_redesign/designs/Vote Screen.dc.html` — hero vote screen, states 2a–2e (source of exact detail).
- `design_handoff_vote_grid_redesign/designs/App Screens.dc.html` — create / thanks / edit / admin (open + finalized), 3a–3e (+ `-m`).
- `design_handoff_vote_grid_redesign/designs/Email Templates.dc.html` — invite / confirmation / finalization, 3f–3h.
- `design_handoff_vote_grid_redesign/designs/Vote Grid Directions.dc.html` — 1a/1b/1c; **1c chosen**.
- `design_handoff_vote_grid_redesign/screenshots/*.png` — full-board overviews (HTML is source of truth for exact detail).

### Source files to touch / reference in the repo
- `src/components/availability-grid.tsx` (+ `.test.tsx`) — **the rewrite** (D-01..D-08).
- `src/app/globals.css`, `src/lib/vote-state.ts` — tokens/vocabulary (reference only; unchanged).
- `src/components/results-grid.tsx`, `invite-by-email-form.tsx`, `book-it-control.tsx`, `poll-create-form.tsx`, `calendar-date-picker.tsx` — pixel targets (adjust visuals only if they drift).
- `src/lib/email/templates.ts` — optional calendar-button color change (D-10).
- The vote screen host page `src/app/p/[participantUrlId]/page.tsx` (+ edit/thanks/admin pages) — mount points / read-only wiring.
</canonical_refs>

<specifics>
## Specific Ideas

- Matrix desktop grid columns `1.6fr 1fr 1fr 1fr`; 44×44 radio cells; selected = state tint + border + icon, unselected = white + `--border` + empty.
- Mobile segments ≥48px, icon+text, sticky primary action.
- Best-day column tinted emerald + "Best" badge + `N yes · N if-need-be` tallies (ResultsGrid, already shipped — pixel target).
- BookItControl two-step confirm (`Book this date` `type=button` reveals amber panel → `Confirm and close poll` `type=submit`) — already shipped; pixel target.
- Emails: single outer `<table>`, 600px, inline styles, system font stack, hex approximations of OKLCH tokens, plain-text fallback link always present, admin URLs never in any template.
</specifics>

<deferred>
## Deferred Ideas

- Dark mode (the `.dark` block stays but is untested here — out of scope).
- Custom animation beyond shipped `transition-colors`.
- Any data-model / backend change (none — this is visual/UX only).
</deferred>

---

*Phase: 05-vote-grid-redesign-matrix-1c*
*Context generated: 2026-07-02 via PRD Express Path (Claude Design handoff)*

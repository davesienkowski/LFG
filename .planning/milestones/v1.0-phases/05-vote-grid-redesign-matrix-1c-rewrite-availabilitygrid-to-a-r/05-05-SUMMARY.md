---
phase: 05-vote-grid-redesign-matrix-1c
plan: 05
subsystem: ui
tags: [email, templates, transactional-email, calendar, ics, security]

# Dependency graph
requires:
  - phase: 04
    provides: "shipped renderInviteEmail / renderConfirmationEmail / renderFinalizationEmail + the hosted /p/[participantUrlId]/event.ics route"
provides:
  - "Per-provider calendar-button color in the finalization email — Google #1a73e8 vs neutral #171717 (FG), the D-10 decision, so the two add-to-calendar buttons are distinguishable without icons"
  - "Confirmed the three transactional email templates (3f invite / 3g confirmation / 3h finalization) already match the high-fidelity mocks — no visual drift"
affects: [email, finalization, notifications]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-provider color as the only reliable signal in email HTML (clients strip images), threaded via a hardcoded-constant background param — never user input (T-05-13 accept)"

key-files:
  created: []
  modified:
    - src/lib/email/templates.ts
    - src/lib/email/templates.test.ts

key-decisions:
  - "D-10 implemented: calLink(href, label, background) gains a background param; new GOOGLE_BLUE (#1a73e8) constant; Apple/Outlook reuses the existing FG (#171717) — no second neutral constant"
  - "D-09: the three templates already match boards 3f–3h exactly (copy, shell, 600px table, inline styles, system font, hex token approximations, always-present plaintext fallback) — zero drift, no visual change needed"

patterns-established:
  - "Email per-provider differentiation by background-color, not icons/shape — documented rationale inline (Gmail strips SVG/PNG; template forbids images)"

requirements-completed: []

coverage:
  - id: D1
    description: "calLink takes a per-provider background; the finalization email colors the Google button #1a73e8 and the Apple/Outlook button neutral FG #171717, with clean-omit and no-admin-URL invariants preserved"
    verification:
      - kind: unit
        ref: "src/lib/email/templates.test.ts#renders BOTH calendar links when both URLs are provided"
        status: pass
      - kind: unit
        ref: "src/lib/email/templates.test.ts#none of the three templates emit an /a/ admin path given participant/edit URLs"
        status: pass
    human_judgment: true
    rationale: "Final visual confirmation (the two buttons are legibly distinct blue vs neutral in a real mail client) is a human check per the phase end-of-phase human-verify mode; automated tests prove the color hex + structure but not rendered legibility across clients"
  - id: D2
    description: "The three email templates match boards 3f–3h (D-09) with all shipped email invariants preserved (600px single-table shell, inline styles, system font, hex tokens, always-present plaintext fallback, no images/link/script, no admin URL)"
    verification:
      - kind: unit
        ref: "src/lib/email/templates.test.ts (7 passing — headings, CTAs, formatDateWithTime, clean-degrade, no /a/ leakage)"
        status: pass
      - kind: other
        ref: "render-grep: all three templates rendered and grepped — no <img|<script|<link|/a/ in output (RENDERED_CLEAN_OK)"
        status: pass
    human_judgment: true
    rationale: "Pixel-match against boards 3f–3h is a visual judgment reserved for the end-of-phase human-verify (Mailpit capture vs mocks)"

# Metrics
duration: 3min
completed: 2026-07-02
status: complete
---

# Phase 5 Plan 5: Email Template Reconciliation + Per-Provider Calendar-Button Color Summary

**Per-provider calendar-button color in the finalization email (Google #1a73e8 vs neutral FG #171717) via `calLink(href, label, background)` + a new `GOOGLE_BLUE` constant; the three transactional templates already matched boards 3f–3h so no visual drift was needed.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-07-02T21:55:33Z
- **Completed:** 2026-07-02T21:58:40Z
- **Tasks:** 2
- **Files modified:** 2 (1 source + its test)

## Accomplishments
- Implemented D-10: `calLink` now takes a `background` param; the finalization email's two add-to-calendar buttons are color-distinguished (Google brand blue vs the reused neutral `FG`) so a reader can tell them apart without icons (email clients strip images).
- Added a new `GOOGLE_BLUE = "#1a73e8"` constant beside the existing token approximations; Apple/Outlook reuses the existing `FG` (`#171717`) — no second neutral constant introduced.
- Confirmed the three templates (3f invite / 3g confirmation / 3h finalization) already match the high-fidelity mocks exactly — copy, shell, 600px single `<table>`, inline styles, system font, hex token approximations, and always-present plaintext fallback all verbatim. Task 1 was a genuine no-drift confirmation.
- Preserved every invariant: clean-omit `? … : ""` guards + empty `calendarBlock` fallback, hosted participant `/p/…/event.ics` (never `/a/`), and no images/`<link>`/`<script>`/webfont.
- Extended `templates.test.ts` to assert both button colors (`background-color:#1a73e8` and `background-color:#171717`) so the D-10 differentiation is regression-covered.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reconcile invite / confirmation / finalization to boards 3f–3h (visual only)** — no commit (zero drift; the shipped templates already match the mocks verbatim — verified by diffing every inline style/copy against `Email Templates.dc.html`)
2. **Task 2: Add per-provider calendar-button color to calLink (D-10)** — `6c0af9b` (feat)

**Plan metadata:** _(final docs commit — see below)_

## Files Created/Modified
- `src/lib/email/templates.ts` — Added `GOOGLE_BLUE` constant; `calLink(href, label, background)` gains a `background` param used for the button `background-color`; the Google button passes `GOOGLE_BLUE`, the Apple/Outlook button passes `FG`.
- `src/lib/email/templates.test.ts` — Added two assertions to the "renders BOTH calendar links" test proving the per-provider colors are present.

## Decisions Made
- **D-10 color over shape:** implemented the color differentiation (Google blue vs neutral) rather than the outline-only shape alternative — clearer per-provider signal, matches the mock, small and reversible (locked in CONTEXT D-10).
- **Reuse `FG`, no new neutral constant:** the Apple/Outlook button uses the existing `FG` (`#171717`), keeping a single source of truth for the neutral color.
- **Task 1 = no drift:** the shipped templates already satisfy D-09 verbatim; no styling/copy change was warranted, so no code churn was introduced.

## Deviations from Plan

None - plan executed exactly as written. Task 1 was a confirmation (no drift), Task 2 applied the minimal-diff D-10 change exactly as specified in 05-PATTERNS.md.

## Issues Encountered
- **`npm run build` requires `DATABASE_URL`.** The full build's "Collecting page data" step instantiates the `/p/[participantUrlId]/event.ics` route, which imports the DB layer and throws `DATABASE_URL is not set` when the env var is absent (pre-existing environmental requirement — `.env.local` is not autoloaded and holds only `VERCEL_OIDC_TOKEN`). This is unrelated to the templates change. Resolved by exporting the local docker DB URL (`postgres://postgres:password@localhost:5432/lfg`, from container `lfg-db-1`): the build then completed green. TypeScript compilation itself passed both in-build ("Finished TypeScript") and standalone (`tsc --noEmit` → no errors).
- **Source-grep false positive for forbidden tokens.** The plan's literal verify `! grep -Eq "<img|<script|<link|/a/" templates.ts` matches two pre-existing *documentation comments* (line ~17 describing "no `<link>`/`<script>`" and the JSDoc "never an `/a/` admin path"), not emitted HTML. The meaningful T-05-11 check is on rendered output: all three templates were rendered and grepped → no forbidden token and no `/a/` (RENDERED_CLEAN_OK), and `templates.test.ts` asserts `not.toContain("/a/")` for all three. Security invariant holds.

## Verification Evidence
- `npx vitest run src/lib/email/templates.test.ts` → 7 passed / 0 failed
- `npx tsc --noEmit` → No errors found
- `npx eslint src/lib/email/templates.ts src/lib/email/templates.test.ts` → No issues found (the only lint findings are pre-existing, in `design_handoff_vote_grid_redesign/support.js`, out of scope)
- `npm run build` (with `DATABASE_URL`) → compiled + generated all routes successfully
- Grep: `GOOGLE_BLUE` present, `#1a73e8` present, clean-omit `: ""` guards intact (2× `? calLink`), plaintext fallback present
- Rendered-output grep across all three templates → no `<img|<script|<link|/a/` (RENDERED_CLEAN_OK); finalization contains both `background-color:#1a73e8` and `background-color:#171717` (COLORS_OK)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 (the final plan, 05-05) is complete. All email-template work for the vote-grid redesign is done: the three templates match boards 3f–3h and the two finalization calendar buttons are per-provider color-distinguished.
- End-of-phase human-verify recommended (per `human_verify_mode: end-of-phase`): capture the three emails in Mailpit and compare against boards 3f–3h, confirming the blue Google vs neutral Apple/Outlook buttons are legibly distinct.

## Self-Check: PASSED

- FOUND: `.planning/phases/05-vote-grid-redesign-matrix-1c-rewrite-availabilitygrid-to-a-r/05-05-SUMMARY.md`
- FOUND: `src/lib/email/templates.ts`
- FOUND: commit `6c0af9b`

---
*Phase: 05-vote-grid-redesign-matrix-1c*
*Completed: 2026-07-02*

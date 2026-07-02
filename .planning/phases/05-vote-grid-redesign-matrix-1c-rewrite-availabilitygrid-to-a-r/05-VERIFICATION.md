---
phase: 05-vote-grid-redesign-matrix-1c
verified: 2026-07-02T18:15:00Z
status: human_needed
score: 10/10 must-haves verified (all D-01..D-10 decisions hold in code; visual/AT fidelity requires human sign-off)
overrides_applied: 0
human_verification:
  - test: "Screen-reader pass on the vote screen (mocks 2a-2e)"
    expected: "Desktop renders the icon-only matrix with labelled headers; mobile renders stacked icon+text segments; a screen reader announces exactly one radiogroup per date (not two, despite both layers being in the DOM); closed poll shows read-only chips."
    why_human: "jsdom unit tests confirm markup/aria-attributes but cannot confirm actual AT (screen reader) announcement behavior or pixel fidelity against the mocks."
  - test: "Admin dashboard open + finalized (`/a/[adminUrlId]`) vs boards 3d/3e"
    expected: "Best-day tint/badge/tallies, filter+Clear, scroll fade, 'Keep private' admin card, and (finalized) Booked pill + Poll-finalized card with Invite/Book-it hidden all match the mocks pixel-for-pixel."
    why_human: "Visual/pixel fidelity is not assertable by grep/unit tests."
  - test: "Invite chips + Book-it two-step confirm on `/a/[adminUrlId]` vs board 3d"
    expected: "Invite chips show icon+text per state; 'Book this date' only reveals the amber panel (never closes); 'Confirm and close poll' is the only finalizing control."
    why_human: "Visual match to the mock and interaction feel are human judgments; underlying control-type/behavior contract is already verified in code (Level 1-3) and unit tests."
  - test: "Mobile sticky/pinned submit or closed banner over a long candidate-date list on the vote screen"
    expected: "Submit button (open) / 'Voting is closed' banner (closed) stays pinned/visible at viewport bottom while the date list scrolls, matching mocks 2d/2e; desktop 2a-2c is unaffected."
    why_human: "Scroll/pin behavior on a real narrow viewport cannot be asserted by jsdom (no layout engine)."
  - test: "Participant vote / thanks / edit pages vs boards 2a-2c, 3b, 3c"
    expected: "Headings, the amber bearer-credential warning on thanks, and prefilled edit values + 'Save changes' match the mocks."
    why_human: "Visual/pixel fidelity; string-level content already confirmed via grep + passing page tests."
  - test: "Create-poll screen (desktop + narrow) vs boards 3a/3a-m"
    expected: "Title, field order, and the pinned 'Create poll' action on mobile match the mock."
    why_human: "Visual/pixel fidelity and the card-frame/full-bleed responsive swap are not assertable by grep."
  - test: "Multi-month date selection on CalendarDatePicker vs board 3a"
    expected: "Calendar, Default start time + Apply to all, and the sorted selected-list with per-row time + remove behave correctly; dates render on the same calendar day (no off-by-one) across month boundaries."
    why_human: "Interactive multi-select behavior and timezone-safe rendering across a real calendar UI need an eyes-on pass."
  - test: "Render the three transactional emails (Mailpit capture) vs boards 3f-3h"
    expected: "Shell, CTAs, event-details block, and the always-present plaintext fallback link match the mocks."
    why_human: "Visual/pixel fidelity in a real mail-client rendering context; structural/security invariants already confirmed via code read + passing unit tests."
  - test: "Finalization email calendar buttons (Mailpit capture, closed poll)"
    expected: "The two calendar buttons are visibly distinct (blue Google vs neutral Apple/Outlook) with legible white text; when a calendar URL is absent the corresponding button is cleanly omitted."
    why_human: "Rendered color/contrast legibility in a real mail client is a visual judgment; the hex values and clean-omit ternaries are already confirmed in code."
---

# Phase 5: Vote-Grid Redesign (Matrix / 1c) Verification Report

**Phase Goal:** Redesign the participant vote experience to the "Matrix" direction (1c): rewrite
`src/components/availability-grid.tsx` from click-to-cycle into a radio-style matrix (rows = dates ×
three columns Available / If-need-be / Not available; icon-only desktop cells with icon+text persistent
column headers; stacked full-width icon+text segments <640px; sticky mobile submit), and reconcile
every supporting screen + the three emails to the high-fidelity mocks as pixel targets, while preserving
all shipped invariants (never-blank default, bulk actions, closed read-only chips, unchanged labels,
icon-or-color-never-alone, verbatim tokens/palette).

**Verified:** 2026-07-02
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

Phase 5 declares no new backend requirements (`requirements: []` on every plan) — the roadmap
"Requirements" field is `TBD`. Per the verification brief, this phase is anchored on the 10 locked
decisions D-01..D-10 in `05-CONTEXT.md`, cross-referenced against `must_haves` in all 5 plans. All 10
decisions were traced to real source, not SUMMARY narration.

### Observable Truths (D-01..D-10)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01: `availability-grid.tsx` is a `role="radiogroup"`/`role="radio"` matrix, no click-to-cycle button remains | VERIFIED | Read full file (`src/components/availability-grid.tsx` lines 210-297): every date row is a `role="radiogroup"` with 3 `role="radio"` `<button>` children; no `CYCLE` array or `cycleCell` present; `selectCell(opt, next)` is the sole setter. |
| 2 | D-02: Desktop (≥640px) cells icon-only + persistent labelled column headers (`grid-cols-[1.6fr_1fr_1fr_1fr]`) | VERIFIED | Lines 187-208 (header row) + 214-249 (per-row grid): exact class `grid-cols-[1.6fr_1fr_1fr_1fr]` on both; desktop radio cell renders `Icon` only when `checked` (no visible text ever), header carries `meta.label` text. |
| 3 | D-03: Mobile (<640px) stacked full-width icon+text segments, no icon-only cell; sticky mobile submit | VERIFIED | Grid: lines 255-297, every mobile `role="radio"` unconditionally renders `<Icon>` + `{meta.label}` text (line 289-290). Sticky submit: `src/components/vote-form.tsx` lines 163-183, `sticky bottom-0 z-10 ... sm:static` on both the closed banner and the submit-button wrapper. |
| 4 | D-04: Untouched row defaults to "Not available", never blank; re-selecting a checked radio is a no-op | VERIFIED | `cellState` seed `initial?.[o.id] ?? "no"` (line 89, unchanged from shipped); `selectCell` always writes exactly one key (line 104-105) — cannot produce `undefined`/blank. Test "re-selecting the already-checked state stays selected" passes (grep run, 9/9 green). |
| 5 | D-05: Bulk actions present when interactive/absent when read-only; closed poll → non-interactive chips, no matrix/bulk/submit; labels unchanged | VERIFIED | Lines 124-154 (`{!disabled ? ... : null}` bulk row) and 156-182 (disabled branch renders `<ul>` of chip `<span>`s, no radios, no bulk row). Labels confirmed verbatim in `src/lib/vote-state.ts` (`Available`/`If-need-be`/`Not available`). |
| 6 | D-06: icon-or-color-never-alone (WCAG AA); `role=radio`/`aria-checked` inside `role=radiogroup`, `aria-label="{date}: {state}"`; `aria-live` region retained; focus ring; ≥44px targets | VERIFIED | `aria-checked={checked}` + `aria-label={\`${label}: ${meta.label}\`}` on every radio (lines 230-231, 279-280); `aria-live="polite" sr-only` region retained (line 119-121); `focus-visible:ring-3 focus-visible:ring-ring/50` present (lines 234, 283); desktop cells `size-11` (44px), mobile `min-h-12` (48px). |
| 7 | D-07: STATE_META/tokens/palette reused verbatim; no new token/utility/font/animation/dark-mode branch | VERIFIED | `src/lib/vote-state.ts` untouched by any Phase-5 commit (`git log cbf4085^..6c0af9b -- src/lib/vote-state.ts src/app/globals.css` returns empty); `git diff` across all Phase-5 commits shows zero `dark:` class additions. |
| 8 | D-08: Test rewrite to radio semantics + 2 new a11y tests (desktop column-header association, mobile segmented fallback) | VERIFIED | `availability-grid.test.tsx` read in full: 9 tests, including "associates each icon-only desktop radio with a labelled column header" and "renders mobile segments with BOTH an icon and visible text" — both assert real DOM structure (not stubs). Ran `npm test -- availability-grid`: **9/9 passed**. |
| 9 | D-09: Supporting screens + emails reconciled as pixel targets (structure preserved, drift-only edits) | VERIFIED (code-level) / spot-checks below need human eyes | Confirmed via direct source read across `results-grid.tsx`, `book-it-control.tsx`, `invite-by-email-form.tsx`, admin page, `vote-form.tsx`, 3 participant pages, `poll-create-form.tsx`, `calendar-date-picker.tsx`, root page, `templates.ts` — every claimed class/string is present in the real file (see Required Artifacts + full-suite run below, 176/176 passing). Pixel fidelity itself is a human-only check (see Human Verification). |
| 10 | D-10: `calLink()` per-provider background (Google `#1a73e8` / neutral `#171717`), clean-omit preserved, no admin `/a/` URL in any email template | VERIFIED | `src/lib/email/templates.ts` lines 170-178: `calLink(href, label, background)` signature; `GOOGLE_BLUE = "#1a73e8"` (line 31) passed for Google, `FG` (`#171717`) reused for Apple/Outlook; both entries keep `? ... : ""` clean-omit ternaries. Grepped `templates.ts` + all three call sites (`close-poll.ts`, `send-invites.ts`, `submit-response.ts`) — zero `/a/` admin-URL construction; only `participantUrl`/`editUrl`/`icsUrl` (hosted `/p/.../event.ics`) are ever passed in. |

**Score:** 10/10 truths verified at the code level. All 10 are backed by direct source reads (not
SUMMARY claims) plus passing automated tests/build. Visual/AT-behavior confirmation is deferred to
human verification per the phase's own `end-of-phase` human-verify design (see below).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/components/availability-grid.tsx` | Radio-matrix rewrite | VERIFIED | 302 lines, `role="radiogroup"` × N, `role="radio"` × 3N, `grid-cols-[1.6fr_1fr_1fr_1fr]`, `data-testid="matrix-desktop"`/`"segments-mobile"`, no `tabIndex={-1}` anywhere. |
| `src/components/availability-grid.test.tsx` | Rewritten radio-semantics + 2 new a11y tests | VERIFIED | 218 lines, 9 `it(...)` blocks, `getAllByRole("radio", ...)` used throughout, no `role: "button"` cycle assertions remain. Ran green: 9/9. |
| `src/components/results-grid.tsx` | Reconciled to 3d/3e | VERIFIED | `rounded-xl border` card wrapper, `min-w-[180px]`/`min-w-[140px]` filter selects, `BestDayBadge` (`emerald-100`/`emerald-800`/"Best") all present. |
| `src/components/book-it-control.tsx` | Two-step confirm preserved | VERIFIED | Exactly one `type="submit"` (Confirm and close poll); `Book this date` is `type="button"`, reveal-only. |
| `src/components/invite-by-email-form.tsx` | Icon+text chips | VERIFIED | `SEND_STATUS_META` maps `sent`/`rate_limited`/`failed` to Check/TriangleAlert/X + label text. |
| `src/app/a/[adminUrlId]/page.tsx` | Status-conditional admin shell | VERIFIED | `isClosed`/`showInvite` gate the Invite card + Book-it picker; "Keep private" badge, "Booked" pill, "Poll finalized" card all present. |
| `src/components/vote-form.tsx` | Sticky mobile submit + closed banner | VERIFIED | `sticky bottom-0 z-10 ... sm:static` on both branches; `AvailabilityGrid` mount unchanged (`disabled={isPending \|\| readOnly}`, `onChange={setVotes}`, hidden `name="votes"` input). |
| `src/app/p/[participantUrlId]/{page,thanks/page,edit/[editToken]/page}.tsx` | Reconciled participant surfaces | VERIFIED (no-drift, per SUMMARY, confirmed via passing page tests: 15 tests green) | No `/a/` URL construction found in any of the three files. |
| `src/components/poll-create-form.tsx` + `calendar-date-picker.tsx` + `src/app/page.tsx` | Reconciled create surface | VERIFIED | `sticky` footer, `sm:rounded-2xl sm:border sm:bg-card sm:shadow-sm` card frame, `mode="multiple"`, `lg:gap-6`, `w-28` all present; `createPoll` action + hidden `name="dates"` field unchanged. |
| `src/lib/email/templates.ts` | Per-provider calendar-button color + reconciled shell | VERIFIED | `GOOGLE_BLUE`/`#1a73e8` present, `FG` reused for Apple/Outlook, clean-omit ternaries intact, no `/a/` URL constructed anywhere in the file or its 3 call sites. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `availability-grid.tsx` | `@/lib/vote-state` | `import { STATE_META, type VoteState }` | WIRED | Confirmed import + usage throughout (STATE_META, HEADER_COLOR keyed off it). |
| `vote-form.tsx` | `availability-grid.tsx` | `AvailabilityGrid` mount, contract unchanged | WIRED | `disabled`/`onChange`/`initial`/`GridOption`/`VoteState` all still imported and threaded; build typechecks clean. |
| `a/[adminUrlId]/page.tsx` | `poll.status` | closed → hide Invite/Book-it, show Booked/finalized | WIRED | `isClosed = poll.status === "closed"`; `showInvite = !isClosed`; both `InviteByEmailForm` and `BookItControl` render conditionally. |
| `close-poll.ts` / `send-invites.ts` / `submit-response.ts` | `templates.ts` render functions | participant/edit URLs only | WIRED | Grepped all 3 call sites — no admin URL ever passed as `ctaUrl`/`participantUrl`/`editUrl`. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| AvailabilityGrid radio semantics + 2 new a11y tests | `npm test -- availability-grid` | 9/9 passed | PASS |
| Full test suite (all Phase-5-touched surfaces) | `npx vitest run` | 176/176 passed, 0 failed | PASS |
| Production build (typecheck + static generation) | `npm run build` (with `DATABASE_URL` exported) | Compiled successfully, TypeScript clean, 4/4 pages generated | PASS |
| Lint on every Phase-5-touched file | `npx eslint <14 files>` | "No issues found" | PASS |
| No `tabIndex={-1}` in availability-grid.tsx (EDGE-KBD) | `grep -i tabindex` | No attribute matches (only a comment mentions it) | PASS |
| No dark-mode branch added in Phase 5 | `git diff cbf4085^..6c0af9b \| grep 'dark:'` | Empty | PASS |
| globals.css / vote-state.ts untouched by Phase 5 | `git log cbf4085^..6c0af9b -- src/app/globals.css src/lib/vote-state.ts` | Empty | PASS |
| No admin `/a/` URL in any email template or its call sites | `grep -rn "renderInviteEmail\|renderConfirmationEmail\|renderFinalizationEmail" src/lib/actions/` + template read | Only participant/edit/ics URLs passed | PASS |

### Requirements Coverage

No requirement IDs are declared on any of the 5 plans (`requirements: []` on all frontmatter), and
`.planning/REQUIREMENTS.md` has no "Phase 5" mapping (`grep -i "phase 5\|Phase 05" REQUIREMENTS.md`
returns nothing). This matches the phase's explicit design ("visual/UX redesign of shipped VOTE-*
features; no new requirements"). No orphaned requirements found. Goal-backward verification was
correctly anchored on the 10 locked decisions (D-01..D-10) instead, all confirmed above.

### Anti-Patterns Found

None. Scanned all 14 Phase-5-touched files for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`/
"not yet implemented"/"coming soon" — zero matches (excluding legitimate `placeholder=` HTML input
attributes). The one logged deferred item (`deferred-items.md`) is a pre-existing ESLint finding in
`design_handoff_vote_grid_redesign/designs/support.js` — a vendored design-prototype file, not
application source, correctly out of scope for this phase.

### Human Verification Required

The phase plans were authored under `human_verify_mode: end-of-phase` and each plan explicitly defers
pixel-fidelity and interaction-feel checks (`<human-check>` blocks) to this end-of-phase gate rather
than per-task checkpoints. All underlying code/behavior contracts for these items are already verified
above (Levels 1-3 + passing tests); only the visual/AT-behavior confirmation against the mocks remains.
See the `human_verification` list in the frontmatter (9 items) for the full checklist — one per
`<human-check>` block harvested from PLAN 05-01 (end-of-phase verification section) and PLAN 05-02
through 05-05 (task-level `<human-check>` tags), covering: screen-reader announcement of the radio
matrix, admin dashboard open/finalized fidelity, invite-chip/book-it visual fidelity, mobile
sticky-submit scroll behavior, participant page fidelity, create-screen fidelity, calendar multi-select
behavior, and the two email-rendering checks (shell/CTA fidelity + calendar-button color legibility).

### Gaps Summary

No code-level gaps found. All 10 locked decisions (D-01..D-10) are genuinely implemented and wired, not
stubbed — the a11y-critical rewrite (`availability-grid.tsx`) was read in full and its two new a11y
tests were confirmed to assert real DOM structure (not placeholder assertions), then run and observed
green (9/9). The full 176-test suite and `npm run build` both pass. The only reason this report is not
`status: passed` is that the phase's own execution plan explicitly deferred 9 visual/AT-behavior checks
to end-of-phase human verification (matching the `human_verify_mode: end-of-phase` pattern) — these are
not code defects, they are pixel-fidelity and screen-reader-behavior checks that automation genuinely
cannot assert.

---

*Verified: 2026-07-02*
*Verifier: Claude (gsd-verifier)*

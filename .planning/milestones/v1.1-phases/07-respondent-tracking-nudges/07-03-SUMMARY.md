---
phase: 07-respondent-tracking-nudges
plan: 03
subsystem: ui
tags: [react, rsc, nextjs, useActionState, server-actions, accessibility, no-leak]

# Dependency graph
requires:
  - phase: 07-01
    provides: invitations table + record-on-send (the persisted invitation rows the card lists)
  - phase: 07-02
    provides: getInvitationTrackingForPoll (admin-only responded read), renderReminderEmail, nudgeNonRespondents server action
provides:
  - "WhosRespondedCard RSC — admin-only 'Who's responded' tracking card (empty / populated-open / populated-closed states) with mandatory disambiguating caption and emerald/amber status badges"
  - "NudgeControl client island — useActionState(nudgeNonRespondents) form submitting only adminUrlId, with zero-non-respondent disabled state + completion copy and aria-live result chips"
  - "Shared SEND_STATUS_META module — extracted verbatim so invite + nudge chips render identically with no restyle"
  - "Admin-page wiring: WhosRespondedCard placed between Results and Book it, reusing isClosed + emailConfigured gates"
affects: [respondent-tracking, admin-dashboard, email-nudges]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared chip-metadata module (SEND_STATUS_META) imported by two islands to guarantee identical status styling without duplication"
    - "RSC card + nested client island: server component owns data + gating, client island owns the interactive form"
    - "Non-vacuous canary no-leak test: prove a seeded invitation email IS admin-visible (via getInvitationTrackingForPoll) yet ABSENT from participant-page HTML"

key-files:
  created:
    - src/components/send-status-meta.ts
    - src/components/whos-responded-card.tsx
    - src/components/nudge-control.tsx
  modified:
    - src/components/invite-by-email-form.tsx
    - src/app/a/[adminUrlId]/page.tsx
    - src/app/a/[adminUrlId]/page.test.ts
    - src/app/p/[participantUrlId]/page.test.ts

key-decisions:
  - "Extracted SEND_STATUS_META to a dependency-free shared module (no 'use client' needed — it is plain data + lucide icon refs) so both InviteByEmailForm and NudgeControl import it; the invite chips are byte-for-byte unchanged"
  - "Placed the real non-vacuous no-leak canary in the participant page test (where the cookies/headers mocks already exist), plus a grep-style structural guard asserting no participant route imports getInvitationTrackingForPoll or references the invitations table"

patterns-established:
  - "Hand-rolled status badges (emerald Responded / amber Not-yet-responded) continue the Booked/Best/Keep-private idiom — no shadcn Badge primitive introduced"
  - "Mandatory disambiguating caption is rendered as a single unit with the summary stat so it can never appear without it (Prohibition Probe #2)"

requirements-completed: [RESP-01, RESP-02]

coverage:
  - id: D1
    description: "Who's responded card renders between Results and Book it with empty / populated-open / populated-closed states, the mandatory caption, and emerald/amber badges"
    requirement: "RESP-01"
    verification:
      - kind: integration
        ref: "src/app/a/[adminUrlId]/page.test.ts#(a) EMPTY — renders the empty-state copy and NO nudge button"
        status: pass
      - kind: integration
        ref: "src/app/a/[adminUrlId]/page.test.ts#(b) POPULATED OPEN — renders emails with Responded/Not-yet-responded badges, the stat + mandatory caption, and the nudge button"
        status: pass
      - kind: integration
        ref: "src/app/a/[adminUrlId]/page.test.ts#(c) POPULATED CLOSED — renders the badge list + summary but NO nudge control at all"
        status: pass
    human_judgment: false
  - id: D2
    description: "Nudge control renders only when emailConfigured + open + non-respondents exist; submits only adminUrlId; disables with completion copy at zero non-respondents"
    requirement: "RESP-02"
    verification:
      - kind: integration
        ref: "src/app/a/[adminUrlId]/page.test.ts#(c) POPULATED CLOSED (nudge hidden on closed poll even with EMAIL_PROVIDER set)"
        status: pass
      - kind: integration
        ref: "src/app/a/[adminUrlId]/page.test.ts#(d) NO-LEAK — email unconfigured -> no active nudge control"
        status: pass
    human_judgment: false
  - id: D3
    description: "Invited emails never reach a participant surface (D-09 / T-07-01 no-leak boundary)"
    requirement: "RESP-01"
    verification:
      - kind: integration
        ref: "src/app/p/[participantUrlId]/page.test.ts#NON-VACUOUS canary: a seeded invitation email is admin-visible yet ABSENT from the participant page"
        status: pass
      - kind: integration
        ref: "src/app/p/[participantUrlId]/page.test.ts#no participant-facing route module imports getInvitationTrackingForPoll (grep-style)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Extracting SEND_STATUS_META does not restyle the existing invite chips (visual parity)"
    verification:
      - kind: manual_procedural
        ref: "SEND_STATUS_META object moved byte-for-byte; InviteByEmailForm still imports and renders the same chip markup — tsc + lint clean, no class changes"
        status: pass
    human_judgment: true
    rationale: "Pixel-level visual parity of the invite chips is a visual judgment; the extraction is byte-identical but a human should confirm the invite results list looks unchanged"

# Metrics
duration: 15min
completed: 2026-07-07
status: complete
---

# Phase 7 Plan 03: Who's-responded card + Nudge control Summary

**Admin-only "Who's responded" tracking card (emerald/amber badges + mandatory caption) with a nested one-click "Nudge non-respondents" island that submits only the admin token, wired between Results and Book it — with a non-vacuous canary proving invited emails never reach a participant browser.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T17:30:00Z
- **Completed:** 2026-07-07T17:42:00Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- Extracted `SEND_STATUS_META` verbatim into `src/components/send-status-meta.ts`; `InviteByEmailForm` re-imports it — invite chips are unchanged (no restyle).
- Built `WhosRespondedCard` (RSC): empty state, populated-open (summary + mandatory caption + emerald/amber badge list + nudge slot), populated-closed (list only, no nudge control).
- Built `NudgeControl` (client island): `useActionState(nudgeNonRespondents)`, hidden `adminUrlId`-only form (Prohibition Probe #1), disabled + "Everyone's responded — nothing to nudge." at zero non-respondents, aria-live result chips reusing the shared meta.
- Wired the card into `/a/[adminUrlId]` between Results and Book it, reusing the page's existing `isClosed` + `emailConfigured` values (never recomputed).
- Added admin tests (empty / open / closed / email-unconfigured) and a non-vacuous participant-side canary + grep-style structural no-leak guard.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared SEND_STATUS_META; build WhosRespondedCard + NudgeControl** - `c6dfe31` (feat)
2. **Task 2: Wire WhosRespondedCard into the admin page + no-leak + state tests** - `1f4b2e3` (feat)

## Files Created/Modified
- `src/components/send-status-meta.ts` - Shared `SEND_STATUS_META` (icon + label + palette), imported by both invite + nudge chip lists.
- `src/components/whos-responded-card.tsx` - Admin-only RSC card with the three mutually-exclusive states, mandatory caption, and hand-rolled emerald/amber status badges.
- `src/components/nudge-control.tsx` - Client island: `useActionState` form (adminUrlId only), zero-non-respondent disabled + completion copy, aria-live result chips.
- `src/components/invite-by-email-form.tsx` - Now imports `SEND_STATUS_META` from the shared module; local copy deleted (no visual change).
- `src/app/a/[adminUrlId]/page.tsx` - Fetches `getInvitationTrackingForPoll(poll.id)`; renders `WhosRespondedCard` between Results and Book it.
- `src/app/a/[adminUrlId]/page.test.ts` - `seedPoll` gains `invitations?: string[]`; cases (a)-(d) for the card states.
- `src/app/p/[participantUrlId]/page.test.ts` - Non-vacuous invitation-email canary + grep-style guard that no participant route imports the invitations read.

## Decisions Made
- `send-status-meta.ts` is a plain shared module (no `"use client"`): it is data + lucide icon references, safe to import from both a client island and, in principle, a server component. This avoids duplicating the chip palette.
- The real no-leak canary lives in the participant page test (the file that already mocks `cookies`/`headers` and renders the participant page), keeping the assertion truly non-vacuous — it proves the seeded email IS surfaced by `getInvitationTrackingForPoll` yet ABSENT from participant HTML — and is backed by a structural grep guard on the participant routes.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Lint reports pre-existing issues only in `design_handoff_vote_grid_redesign/designs/support.js` (a design-handoff artifact, out of scope — untouched by this plan); all four touched component files and both test files lint clean.

## User Setup Required
None - no external service configuration required. (The nudge control is gated behind the existing `EMAIL_PROVIDER` check; when unset it degrades to the existing copy-link fallback.)

## Next Phase Readiness
- The two admin surfaces from the 07 UI-SPEC (RESP-01 card + RESP-02 nudge) are shipped and wired; the phase's organizer-visible payoff is complete.
- All three UI Prohibition-Probe findings are enforced (client caption + server re-query/closed-poll re-check already landed in 07-02).

## Self-Check: PASSED

- All three created component files exist on disk.
- SUMMARY.md exists.
- Both task commits (`c6dfe31`, `1f4b2e3`) present in git history.
- Verification green: `npm test` (admin + participant page tests) 30/30 pass; `npx tsc --noEmit` clean; ESLint clean on all touched files; grep confirms no participant production route imports `getInvitationTrackingForPoll`.

---
*Phase: 07-respondent-tracking-nudges*
*Completed: 2026-07-07*

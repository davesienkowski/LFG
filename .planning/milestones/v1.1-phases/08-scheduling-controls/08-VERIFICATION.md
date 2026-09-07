---
phase: 08-scheduling-controls
verified: 2026-07-07T23:07:46Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "On the live prod app, set a voting deadline in the past (or wait for a set deadline to elapse) and reload the participant vote page (/p/[participantUrlId])."
    expected: "The vote form renders read-only with the 'Voting has closed' copy (distinct from the 'group is meeting' booked copy); no submit button is present."
    why_human: "Time-dependent lazy auto-close behavior on the deployed app; the executor cannot advance real time or reliably observe rendered HTML on a live browser session. This is the deferred D3/D4 check from 08-02-SUMMARY.md and 08-04-PLAN.md's blocking human-verify checkpoint."
  - test: "On the live prod admin page (/a/[adminUrlId]), use the 'Voting deadline' card to set/update/clear a deadline and confirm the amber 'Voting closed — deadline passed' pill and the 'Booked' pill never appear together, and the datetime-local input round-trips to the organizer's local wall-clock correctly."
    expected: "Pill mutual-exclusivity holds; the saved deadline displays back in the organizer's own timezone with no off-by-one-timezone error."
    why_human: "Visual/interaction assertion (pill rendering, TZ round-trip) — deferred D4 in 08-02-SUMMARY.md."
  - test: "On the live prod admin page, use the 'Your availability' card to add and then edit the organizer's own row; confirm it appears labelled '(you)' in the Results grid and folds into the best-day highlight."
    expected: "The card cycles collapsed -> form -> saved summary; the row shows '(you)' in both mobile and desktop grid layouts; best-day highlighting updates to include the organizer's vote."
    why_human: "Visual/interaction assertion against a running admin page with real poll data — deferred D3 in 08-03-SUMMARY.md, matches project MEMORY's screenshot-verify convention."
  - test: "Confirm prod Neon has been backed up, migration 0006 (deadline + is_organizer columns) applied to prod, and the current build deployed via Vercel CLI."
    expected: "Both columns exist on the prod polls/participants tables; the deployed app serves the Phase 8 code."
    why_human: "08-04-PLAN.md is an explicit separate prod-ship plan (backup -> migrate -> deploy) that has not yet been executed — it is gated as a distinct plan, not a code-review item. This is not a code gap; the codebase deliverable (this verification's scope) is complete and green."
---

# Phase 8: Scheduling Controls Verification Report

**Phase Goal:** The organizer directly controls the poll's timeline and their own participation: an optional voting deadline that closes the poll on its own (evaluated lazily on poll access — no cron/scheduled job), plus the ability to add and edit their own availability row straight from the admin view.

**Verified:** 2026-07-07T23:07:46Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Organizer can set an optional voting deadline on a poll from the admin view, and can also leave it unset | ✓ VERIFIED | `src/lib/actions/set-deadline.ts` — admin-token re-derivation via `getPollByAdminUrlId`, single `UPDATE`, future-only server validation. `src/components/deadline-control.tsx` renders unset/future/passed states. `set-deadline.test.ts` (6 DB-backed tests): save future, reject past/present/unparseable, clear-to-null, unknown-token 404, no-reopen-on-closed. |
| 2 | Once the deadline has passed, the next visitor's vote form is read-only — the same read-only mechanism as a "Book it"-finalized poll (FNL-02), with no scheduled job involved | ✓ VERIFIED | `isVotingOpen(poll, now)` in `src/lib/poll-status.ts` is a pure, DB-free comparison (`status==="open" && (deadline==null \|\| deadline>now)`) — no cron, no read-triggered write. Wired at all 3 write gates (`submit-response.ts:120`, `update-response.ts:127`, `save-organizer-availability.ts:137`) and both participant pages (`page.tsx:78`, `edit/[editToken]/page.tsx:51`). `VoteForm` renders the SAME sticky read-only footer treatment for both booked and deadline-passed states (shared mechanism) but with intentionally DISTINCT copy per `08-CONTEXT.md` decision ("distinguish 'deadline passed' from 'organizer booked a date' in the copy") — booked / "Voting has closed" (deadline) / generic three-way branch in `vote-form.tsx:187-224`. |
| 3 | Polls without a deadline behave exactly as before, and evaluating an expired deadline never blocks or errors a normal page load | ✓ VERIFIED | `isVotingOpen` is a pure synchronous comparison (no I/O, cannot throw); `deadline == null` short-circuits to the pre-existing `status === "open"` behavior. `poll-status.test.ts` covers all 6 branches including the `deadline == now` boundary (closed) and closed-status-beats-future-deadline. Full suite green (321/321). |
| 4 | Deadline-passed is kept distinct from "Booked"/finalized — event.ics, calendar feed, and the finalized card stay keyed on a real finalize | ✓ VERIFIED | `src/app/p/[participantUrlId]/event.ics/route.ts:32` gates on `poll.status !== "closed"`. `getFinalizedPollsByOrganizerId` in `queries.ts:362` filters `eq(polls.status, "closed")` — neither reads `deadline`. Admin page header pill (`page.tsx:179-187`) and participant page `bookedLabel` (`page.tsx:82-93`) are both keyed on `poll.status !== "open"`/`isClosed`, never on `deadlinePassed` alone; pills are mutually exclusive by if/else construction. |
| 5 | The organizer can set/clear the deadline only via admin-token authorization | ✓ VERIFIED | `setDeadline` re-derives the poll via `getPollByAdminUrlId(adminUrlId)`, `notFound()` on an unknown token — never trusts a client-supplied poll id. Covered by `set-deadline.test.ts` "notFound()s for an unknown adminUrlId". |
| 6 | The organizer can add and edit their own availability row from the admin view, without using the participant link | ✓ VERIFIED | `saveOrganizerAvailability` (`save-organizer-availability.ts`) re-derives the poll from `adminUrlId`, find-or-creates the single `is_organizer=true` row, upserts votes atomically. `OrganizerAvailabilityControl` client island renders inline on `/a/[adminUrlId]` (no participant link involved). `save-organizer-availability.test.ts` (8 DB-backed tests): first add, name override, foreign-optionId ignore, edit-upserts-same-row, closed-poll rejection, deadline-passed rejection, unknown-token 404, and a DB-constraint test for the partial unique index. |
| 7 | There is at most ONE organizer row per poll — the add/edit action upserts, never duplicates | ✓ VERIFIED (defense in depth) | Application-level find-or-create in `save-organizer-availability.ts` PLUS a real DB guarantee: migration `0007_strange_earthquake.sql` adds `CREATE UNIQUE INDEX participants_one_organizer_per_poll ON participants (poll_id) WHERE is_organizer = true`, mirrored in `schema.ts:147-149`. Confirmed applied to local Docker Postgres (`\d participants` shows the partial unique index). Concurrent-insert race handled via 23505 catch + re-read + UPDATE in the action. Test `"at-most-one organizer row is DB-enforced (0007 partial unique index)"` asserts the raw DB constraint fires and non-organizer rows remain unconstrained. |
| 8 | The organizer's row appears in the results grid and best-day computation just like any other participant | ✓ VERIFIED | `getResultsForPoll` selects `is_organizer` and folds it into the same participant shape (`queries.ts:171-203`); `computeResults` (`results.ts`) has ZERO special-casing for `isOrganizer` — it's an optional presentation-only field never read by the tally/best-day logic. `results-grid.tsx` renders a flag-driven `" (you)"` suffix in both mobile (line 295) and desktop (line 528) layouts, driven solely by `p.isOrganizer`, never inferred from the name string. |
| 9 | The organizer row carries no email and triggers no email hook | ✓ VERIFIED | `save-organizer-availability.ts` hardcodes `email: null` on insert; no `sendEmail`/`after` import in the action. Test suite mocks `@/lib/email/send` and `next/server` specifically to assert `sendEmailMock` is never called ("prohibition-probe: hook bleed"). |

**Score:** 9/9 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/poll-status.ts` | Pure `isVotingOpen(poll, now)` lazy-close helper | ✓ VERIFIED | 20 lines, single exported pure function, structurally typed, 6-branch test coverage. |
| `src/lib/actions/set-deadline.ts` | Admin-token set/clear deadline action | ✓ VERIFIED | Full admin-token re-derivation, future-only validation, single UPDATE, never touches `status`. |
| `src/lib/actions/save-organizer-availability.ts` | Admin-token organizer row upsert action | ✓ VERIFIED | Find-or-create with 23505 race handling, isVotingOpen gate, no email hook. |
| `src/components/deadline-control.tsx` | Admin deadline card (unset/future/passed) | ✓ VERIFIED | Client island, TZ round-trip via naive datetime-local <-> UTC ISO conversion, wired into admin page. |
| `src/components/organizer-availability-control.tsx` | Admin "Your availability" card | ✓ VERIFIED | 3-state render (hidden/read-only/editable), wired into admin page. |
| `drizzle/0006_lonely_korg.sql` | Additive migration: `deadline` + `is_organizer` columns | ✓ VERIFIED | Two `ADD COLUMN` statements, no DROP/ALTER. Applied to local Docker Postgres. |
| `drizzle/0007_strange_earthquake.sql` | Partial unique index enforcing at-most-one organizer row | ✓ VERIFIED | `CREATE UNIQUE INDEX ... WHERE is_organizer = true`. Applied to local Docker Postgres, confirmed via `\d participants`. NOT yet applied to prod (08-04 scope). |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `submit-response.ts` | `isVotingOpen` | direct call at line 120, gates the write | ✓ WIRED | `if (!isVotingOpen(poll, new Date()))` rejects with `_form` error, no write. |
| `update-response.ts` | `isVotingOpen` | direct call at line 127, gates the write | ✓ WIRED | Same pattern; poll re-fetched via `getPollByParticipantUrlId` which selects `deadline`. |
| `save-organizer-availability.ts` | `isVotingOpen` | direct call at line 137, gates the write | ✓ WIRED | Poll re-fetched via `getPollByAdminUrlId` (full row `select()`, includes `deadline`). |
| `p/[participantUrlId]/page.tsx` | `isVotingOpen` + `VoteForm` | server-derives `readOnly`/`deadlinePassed` booleans, passes to client | ✓ WIRED | Only booleans cross the RSC boundary, never a raw `Date` (LOCKED 5 constraint honored). |
| `p/.../edit/[editToken]/page.tsx` | `isVotingOpen` + `VoteForm` | same pattern | ✓ WIRED | Confirmed. |
| `a/[adminUrlId]/page.tsx` | `DeadlineControl` | renders when `!isClosed`, passes `deadlineIso` (string) + `deadlinePassed` (boolean) | ✓ WIRED | Deadline card hidden entirely once booked — mutual exclusivity by construction. |
| `a/[adminUrlId]/page.tsx` | `OrganizerAvailabilityControl` | renders unconditionally, passes `organizerRow`/`votingOpen` derived from `getResultsForPoll` + `isVotingOpen` | ✓ WIRED | No extra query — reuses the results read. |
| `getResultsForPoll` | `computeResults` | `isOrganizer` flows through but is never read by tally logic | ✓ WIRED | Confirmed by reading `results.ts` — `isOrganizer` is a passthrough optional field. |
| `results-grid.tsx` | `p.isOrganizer` | conditional `" (you)"` suffix render, both layouts | ✓ WIRED | Lines 295 (mobile) and 528 (desktop). |
| `event.ics` / calendar feed | `poll.status === "closed"` | filter/gate, never reads `deadline` | ✓ WIRED | Confirmed no `deadline` reference in either read path — DEAD-01/FNL-02 stay independent. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite green (DB-backed) | `DATABASE_URL=... npm test` | 31 files, 321 tests, 321 passed, 0 failed | ✓ PASS |
| `isVotingOpen` 6-branch pure coverage incl. boundary | `poll-status.test.ts` | All 6 pass (null-deadline-open, future-open, past-closed, `deadline==now`-closed, closed-status-no-deadline, closed-status-future-deadline) | ✓ PASS |
| `setDeadline` DB-backed coverage | `set-deadline.test.ts` | 6/6 pass (future save, past/unparseable reject, clear, unknown-token 404, no-reopen-on-closed) | ✓ PASS |
| `saveOrganizerAvailability` DB-backed coverage incl. concurrency | `save-organizer-availability.test.ts` | 8/8 pass (first-add, name override, foreign-id ignore, edit-upserts-same-row, closed/deadline-passed rejection, unknown-token 404, raw DB 23505 constraint) | ✓ PASS |
| 0007 migration applied locally | `docker exec lfg-postgres psql ... \d participants` | Shows `participants_one_organizer_per_poll` UNIQUE btree (poll_id) WHERE is_organizer = true | ✓ PASS |
| Migration journal registers both 0006 and 0007 | `drizzle/meta/_journal.json` | idx 6 (`0006_lonely_korg`) and idx 7 (`0007_strange_earthquake`) both present | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| DEAD-01 | 08-01, 08-02 | Optional voting deadline, lazy auto-close, no cron | ✓ SATISFIED | `isVotingOpen` helper + wiring at all 3 vote gates + both participant pages + admin card, per truths 1-5 above. |
| ORG-01 | 08-01, 08-03 | Organizer adds/edits own row from admin view, appears in grid + best-day | ✓ SATISFIED | `saveOrganizerAvailability` + `OrganizerAvailabilityControl` + results-grid "(you)" wiring, per truths 6-9 above. |

No orphaned requirements — REQUIREMENTS.md's Traceability table maps exactly DEAD-01 and ORG-01 to Phase 8, both covered.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/a/[adminUrlId]/page.tsx` | 171 | `(TBD)` in a comment: `{/* Header: poll title + status pill + location/description (TBD). */}` | ℹ️ INFO | Pre-existing comment from `e5cf81d4` (2026-07-03), predates Phase 8 (started 2026-07-07). Not introduced by this phase — Chesterton's Fence: leave as-is, out of this phase's scope. |

No TODO/FIXME/XXX/HACK/PLACEHOLDER markers, no stub returns, no hardcoded-empty data flows, and no console.log-only implementations found in any of the 15 files this phase touched.

### Human Verification Required

See `human_verification` in frontmatter (4 items). Summary:

1. **Live prod deadline auto-close** — a passed deadline must render the participant form read-only with the distinct "Voting has closed" copy on the deployed app (time-dependent behavior the executor cannot advance/observe).
2. **Live prod deadline card UX** — pill mutual-exclusivity + datetime-local TZ round-trip on the admin page.
3. **Live prod organizer row** — the "Your availability" card's add/edit/read-only/hidden states and the "(you)" label rendering against real poll data.
4. **Prod ship not yet executed** — 08-04-PLAN.md (backup → migrate 0006/0007 → deploy) is a separate, not-yet-run plan; the columns and code are not yet live on prod Neon/Vercel.

These are exactly the deferred `human_judgment: true` items already flagged in 08-02-SUMMARY.md (coverage D3, D4) and 08-03-SUMMARY.md (coverage D3), plus 08-04-PLAN.md's own blocking human-verify checkpoint — consistent with the phase's stated scope split (08-01/02/03 = code, 08-04 = prod ship + human verify).

### Gaps Summary

No code gaps found. All 9 derived observable truths (from ROADMAP.md's 5 success criteria plus PLAN-frontmatter must-haves) are verified in the codebase with concrete evidence: file contents, grep-confirmed wiring, a locally-applied migration/constraint, and a fully green 321-test DB-backed suite. The only outstanding items are the live-prod human-verification checks and the not-yet-executed prod-ship plan (08-04), both of which are explicitly out of this phase's code-review scope per the phase's own plan structure and the project's screenshot-verify/self-serve-prod-migrate conventions (MEMORY.md).

---

_Verified: 2026-07-07T23:07:46Z_
_Verifier: Claude (gsd-verifier)_

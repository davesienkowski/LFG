# Phase 6: Your Polls Dashboard — Specification

**Ambiguity score:** 0.10 (gate: ≤ 0.20)
**Requirements:** 8 locked
**Design source:** docs/superpowers/specs/2026-07-06-your-polls-dashboard-design.md (approved)

## Goal

Give an organizer one place — `/polls` — to see every poll they created from this
browser and a clear path to create another, so that finalizing more polls (which is
what populates the booked-dates calendar feed) is discoverable. Identity is the
existing `lfg_organizer` cookie; no accounts, no schema change.

## Background

Phase 4 introduced the organizer identity (`lfg_organizer` httpOnly cookie, `path=/`)
and the calendar feed `/feed/[organizerId]/calendar.ics`, which groups every FINALIZED
poll under that cookie. Today the organizer has no way to see their polls or create a
new one from a poll's admin page, and the subscribe card doesn't explain that the "same
browser" is what keeps all their polls in one calendar. This phase adds a read-only
dashboard plus entry points and clarified copy. It reuses the existing `getFinalized
PollsByOrganizerId` no-leak discipline and adds one read query — no new write path, no
server action, no migration.

## Requirements

1. **MYP-01 — List the organizer's polls.** `/polls` renders every poll whose
   `organizer_id` equals the current `lfg_organizer` cookie, ordered `created_at` DESC
   (stable `id` tiebreaker), each row a link to that poll's admin page `/a/<adminUrlId>`.
   - Acceptance: With the cookie set and ≥1 owned poll, every owned poll appears as a
     link to its `/a/<adminUrlId>`; a poll belonging to a *different* organizer never
     appears.

2. **MYP-02 — Per-poll summary.** Each list item shows the poll title, a status badge
   (`Open` for status `open`, `Booked` for `closed`), a summary (the finalized date when
   closed, else the candidate-date count `"{n} dates"`), and a response count
   (`"{n} responses"` = number of participants).
   - Acceptance: A closed poll shows its booked date and a `Booked` badge; an open poll
     shows `"{n} dates"` and an `Open` badge; the response count equals the participant
     count for that poll (0 renders as "0 responses", not a hidden/blank state).

3. **MYP-03 — Empty / no-identity state (no oracle).** When the `lfg_organizer` cookie
   is absent, empty/whitespace, or resolves to zero polls, `/polls` returns HTTP 200 with
   an empty state (heading + a "Create a poll" link) — never a 404 or error, and never a
   distinguishing status between "no cookie" and "unknown organizer".
   - Acceptance: No cookie → 200 empty state, no throw; a random/unknown organizer value →
     the identical 200 empty state (no oracle distinguishing a real organizer from a
     random value).

4. **MYP-04 — Participant-safe query (no leak).** `getPollsByOrganizerId` selects only
   `adminUrlId, title, status, winningDate, winningStartTime, optionCount, responseCount`.
   It MUST NOT return or render any participant name/email, any `edit_token`, any
   `participant_url_id`, or `creator_email`.
   - Acceptance: The query result shape and the rendered `/polls` HTML contain no
     participant name, no participant email, no edit token, and no participant URL.

5. **MYP-05 — Empty organizer id is not a wildcard.** An empty-string or whitespace-only
   `organizerId` resolves to zero polls (returns `[]`) and never groups across polls with
   a null/empty `organizer_id`.
   - Acceptance: `getPollsByOrganizerId("")` and `getPollsByOrganizerId("   ")` each return
     `[]`, even when polls with a null `organizer_id` exist.

6. **MYP-06 — Entry points.** The admin page `/a/[adminUrlId]` shows a "Your polls" link
   (→ `/polls`) and a "Create a poll" link (→ `/`). The landing page `/` shows a "Your
   polls" link ONLY when the `lfg_organizer` cookie is present.
   - Acceptance: Admin HTML contains links to `/polls` and `/`; landing HTML contains a
     `/polls` link when the cookie is set and omits it when the cookie is absent.

7. **MYP-07 — Legacy polls excluded.** A poll with `organizer_id = NULL` (created before
   the organizer cookie existed) never appears in any `/polls` list.
   - Acceptance: Seeding a null-organizer poll and rendering `/polls` (with any cookie)
     never shows that poll.

8. **MYP-08 — Clarified same-browser copy.** The calendar-subscribe card (on the admin
   page and on `/polls`) states that polls must be created from the same browser to share
   one calendar.
   - Acceptance: The subscribe card copy includes the same-browser guidance.

## Boundaries

- **In:** `/polls` read-only dashboard; `getPollsByOrganizerId` read query; entry links on
  admin + landing; clarified subscribe copy.
- **Out (non-goals):** editing/deleting/closing/renaming a poll from the list (each admin
  page still owns management); any account/login; cross-device sync; surfacing legacy
  null-organizer polls; any schema change or new write path/server action.

## Constraints

- **Identity = cookie:** the `lfg_organizer` cookie is the sole identity; reading it forces
  dynamic rendering on `/polls` (and on `/` for the conditional link). No new auth.
- **No-leak discipline:** mirror `getFinalizedPollsByOrganizerId` — participant-safe columns
  only; `admin_url_id` IS returned (the organizer owns these links) but no participant
  identity or third token.
- **Single neon-http statement:** the query must be one statement (correlated aggregate
  subqueries or grouped joins), no interactive transaction.
- **No schema change / no migration.**

## Acceptance Criteria

- [ ] `/polls` with cookie + polls lists exactly the owned polls, newest-first, linking to admin pages (MYP-01)
- [ ] Each row shows title, Open/Booked badge, booked-date-or-"{n} dates", and "{n} responses" (MYP-02)
- [ ] `/polls` with no cookie and with an unknown organizer both return an identical 200 empty state (MYP-03)
- [ ] `/polls` HTML never contains a participant name/email, edit token, or participant URL (MYP-04)
- [ ] `getPollsByOrganizerId("")` / `("   ")` return `[]` even when null-organizer polls exist (MYP-05)
- [ ] Admin page links to `/polls` and `/`; landing links to `/polls` only when the cookie is present (MYP-06)
- [ ] A null-organizer poll never appears in `/polls` (MYP-07)
- [ ] The subscribe card states the same-browser calendar guidance (MYP-08)

## Edge Coverage

**Coverage:** 20/20 applicable edges resolved · 15 covered · 5 dismissed-with-reason · 0 unresolved
(5 covered edges are promoted to plan must_haves — marked ★)

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| adjacency | MYP-01 | ✅ covered | Exact `organizer_id = $1` match; two different organizers never merge — different lists (AC: a foreign poll never appears). Ties PROH-1. |
| empty | MYP-01 | ✅ covered | Zero polls → empty state (MYP-03); single poll → one row |
| ordering ★ | MYP-01 | ✅ covered | Equal `created_at` → stable `id` tiebreaker: `ORDER BY created_at DESC, id` (mirrors feed EP-FEED-ORDER). must_have |
| boundary ★ | MYP-02 | ✅ covered | Pluralize: "1 date"/"{n} dates", "1 response"/"{n} responses"; 0 → "0 responses" (never blank). must_have |
| adjacency | MYP-02 | ⛔ dismissed | Only `open`/`closed` exist in schema; badge is closed→Booked else→Open. No third status to collide. |
| empty ★ | MYP-02 | ✅ covered | Defensive: a `closed` poll with a NULL winning date still renders ("Booked", no date, no crash) — mirrors EP-FEED-EMPTY. must_have |
| ordering | MYP-02 | ⛔ dismissed | A row shows a COUNT, not an ordered per-item collection — no intra-item ordering |
| precision | MYP-02 | ⛔ dismissed | Counts are integer `COUNT(*)`; no rounding/overflow at these magnitudes |
| idempotency | MYP-03 | ✅ covered | `GET /polls` is a pure read — idempotent by construction (no writes) |
| concurrency | MYP-03 | ✅ covered | Read-only, no shared mutable state; parallel reads safe. See PROH-3 (no shared cache). |
| empty ★ | MYP-04 | ✅ covered | Aggregate counts must yield 0 (not null) for a poll with no options/participants — use `COUNT`. must_have |
| encoding | MYP-04 | ⛔ dismissed | No-leak is column-selection, not string encoding; token equality is exact ASCII (nanoid) match |
| empty | MYP-05 | ✅ covered | Empty/whitespace organizerId → `[]` (explicit AC); normalize before querying |
| encoding ★ | MYP-05 | ✅ covered | "Whitespace" = JS `String.prototype.trim`; trimmed-empty cookie → `[]`, never a wildcard. must_have |
| idempotency | MYP-06 | ✅ covered | Link rendering is deterministic/read-only |
| concurrency | MYP-06 | ✅ covered | Stateless render; see PROH-3 |
| adjacency | MYP-07 | ✅ covered | SQL `organizer_id = $1` never matches NULL; MYP-05 guard stops `''` matching |
| empty | MYP-07 | ✅ covered | NULL-organizer poll excluded even with a cookie set (AC) |
| ordering | MYP-07 | ⛔ dismissed | Exclusion predicate, not an ordered output |
| unclassified | MYP-08 | ✅ covered | Copy assertion (must-have text), not a data-shape edge — verified by a render test asserting the same-browser copy |

## Prohibitions (must-NOT)

**Coverage:** 3/3 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| **PROH-1** MUST NOT list any poll whose `organizer_id` differs from the requester's `lfg_organizer` cookie (no cross-organizer leak of polls or admin links) | MYP-01, MYP-05, MYP-07 | resolved | verification: test — seed two organizers + a null-organizer poll; assert each `/polls` shows ONLY its own organizer's polls and never the other's admin URL. check_kind: node-test |
| **PROH-2** MUST NOT emit any participant name/email, `edit_token`, or `participant_url_id` anywhere on `/polls` | MYP-04 | resolved | verification: test — seed a poll with a canary participant name+email; assert the `/polls` HTML contains none of them, nor any `/edit/` token or participant URL. check_kind: node-test |
| **PROH-3** MUST NOT serve `/polls` (or the cookie-conditional link on `/`) from a cache shared across organizers — the per-cookie output must be dynamic/uncacheable | MYP-01, MYP-06 | resolved | verification: source — `/polls` and `/` read `cookies()` (forces dynamic render in Next 16); assert neither sets `force-static`/`revalidate` that would cache per-cookie output. check_kind: source-review |

*Canon referred out: generic IDOR/enumeration is canon security (owned by /gsd:secure-phase); the organizer token is an existing bearer credential (Phase 4), not minted here.*

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                    |
|--------------------|-------|------|--------|----------------------------------------------------------|
| Goal Clarity       | 0.93  | 0.75 | ✓      | Precise measurable goal; design approved upstream        |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Explicit view-only non-goals; no schema/write            |
| Constraint Clarity | 0.88  | 0.65 | ✓      | Cookie identity, no-leak, single statement, no migration |
| Acceptance Criteria| 0.88  | 0.70 | ✓      | 8 pass/fail criteria                                     |
| **Ambiguity**      | 0.10  | ≤0.20| ✓      | Design brainstormed + approved before spec               |

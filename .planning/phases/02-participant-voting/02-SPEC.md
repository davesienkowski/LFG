# Phase 2: Participant Voting — Specification

**Created:** 2026-06-30
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

A participant opens the shared participant link and records three-state availability (Available / If-need-be / Not available) for every candidate date without creating an account, then returns — via a same-device cookie or a personal edit link — to change only their own response while the poll is open.

## Background

Phase 1 shipped poll creation, the three-token foundation (`participantUrlId`, `adminUrlId`, both `nanoid(21)`, non-derivable), timezone-safe `DATE` storage, and the read surfaces. Current Phase 2 baseline in code:

- **Schema** (`src/lib/db/schema.ts`): `polls` (with `status text default 'open'`) and `options` (`date` mode:string, nullable `start_time`, `position`) exist. **No `participants` table and no `votes` table.**
- **Participant page** (`src/app/p/[participantUrlId]/page.tsx`): resolves the poll via `getPollByParticipantUrlId` (participant-safe columns only — `admin_url_id` omitted, P2) and renders the title, summary, chronological dates, and a static **"Voting isn't available yet"** placeholder. No form, no submit.
- **Tokens** (`src/lib/tokens.ts`): `generateToken()` = `nanoid(21)`, used twice independently by `createPoll`. The per-participant **edit token** referenced by the roadmap is not yet minted anywhere.
- **No** `submitResponse` / `updateResponse` server actions, no `/thanks` route, no `/p/[participantUrlId]/edit/[editToken]` route, no `AvailabilityGrid` component.

The primary deliverables that do NOT exist yet: the `participants` + `votes` tables, the 3-state `AvailabilityGrid` client island (with VOTE-07 bulk actions), the submit/update server actions with token-ownership enforcement, the on-screen edit-link surfacing + same-device auto-load, and the edit route.

## Requirements

1. **VOTE-01 — Anonymous access & submit**: A participant opens the poll via the participant link and submits a response with no account.
   - Current: `/p/[participantUrlId]` renders a read-only placeholder; no submit path exists
   - Target: the participant page renders a vote form (name, optional email, the availability grid) and a working `submitResponse` server action; an invalid/unknown participant token returns 404
   - Acceptance: submitting a valid form on a known participant link persists a participant + vote rows and lands on `/thanks`; an unknown participant token returns 404 (no participant row created)

2. **VOTE-02 — Three-state per date**: For each candidate date the participant sets exactly one of `yes` | `ifneedbe` | `no`.
   - Current: no vote storage exists
   - Target: a `votes` table stores exactly one state per `(participant, option)`; the grid toggles a cell through the three states; a date the participant never touches is recorded as `no`
   - Acceptance: after a submit that touches some cells and leaves others untouched, every option has exactly one vote row, untouched options are `no`, and there is no second row for any `(participant, option)` pair

3. **VOTE-03 — Identity capture & response creation**: Submitting captures a required name and optional email and creates the participant + an independent edit token.
   - Current: no participant record or edit token is minted anywhere
   - Target: `submitResponse` validates `name` (required, trimmed, 1–100 chars) and `email` (optional; if present, valid format, ≤200 chars), inserts a `participants` row with a freshly-minted `nanoid(21)` `editToken` (a third independent token, not derived from any other), and inserts a vote row per option
   - Acceptance: a submit with a blank/whitespace-only name is rejected with a field error and creates no rows; a submit with name only (no email) succeeds; the created participant has a 21-char `editToken` that is not equal to and not derivable from the poll's `participantUrlId`

4. **VOTE-05 — Self-edit while open**: A participant returns and changes their selections while the poll is open.
   - Current: no edit route or update action exists
   - Target: `/p/[participantUrlId]/edit/[editToken]` loads that participant's existing response into the grid; `updateResponse` replaces their vote rows; the same participant page auto-loads the previous response when a same-device cookie holding the edit token is present
   - Acceptance: editing via a valid edit link changes the stored states and re-applying the identical selections is idempotent (same final rows); returning on the same device after submit auto-loads the prior selections

5. **VOTE-06 — Token-verified ownership**: Editing requires the participant's own edit token; nothing else can modify the response.
   - Current: no ownership check exists (no edit path at all)
   - Target: `updateResponse` looks up the participant by exact `editToken` match and modifies only that row; a wrong token, missing token, or name-only attempt modifies nothing
   - Acceptance: an unknown/empty `editToken` on the edit route returns 404; an attempt to update participant A's response while presenting participant B's token (or no token) leaves A's rows unchanged

6. **VOTE-07 — Per-row bulk actions**: A bulk control sets the participant's whole row at once before individual adjustment.
   - Current: no grid or bulk control exists
   - Target: the `AvailabilityGrid` offers "Set all Available", "Set all Not available", and "Clear"; bulk sets every rendered option's cell, then per-cell toggles override individual cells; "Clear" resets every cell to `no` (the default)
   - Acceptance: clicking "Set all Available" makes every option `yes`; then toggling one cell changes only that cell; "Clear" returns every cell to `no`; the submitted payload reflects the final per-cell states

## Boundaries

**In scope:**
- `participants` and `votes` tables (+ migration), reusing the Phase 1 dual-driver client and DATE/timezone conventions
- Vote form on `/p/[participantUrlId]`: name (required), email (optional), and the three-state `AvailabilityGrid`
- `AvailabilityGrid` client island: per-cell 3-state cycle + VOTE-07 bulk actions ("Set all Available / Not available / Clear")
- `submitResponse` server action (validate → create participant + edit token → insert one vote per option)
- `/thanks` confirmation surfacing the personal edit link to bookmark, plus a same-device cookie that auto-loads the prior response on return to the participant page
- `/p/[participantUrlId]/edit/[editToken]` route + `updateResponse` action with exact-token ownership enforcement (replace semantics, last-write-wins)
- Server-side guard: reject vote/edit writes when `poll.status != 'open'`, and render the form read-only with a "voting is closed" notice in that state
- Email address is **collected and stored** on the participant row (for Phase 4), but no email is sent in this phase

**Out of scope:**
- Sending any email (invitation, edit-link confirmation, finalization) — that is **Phase 4** (VOTE-04). The edit link is surfaced on-screen + via same-device cookie this phase.
- Results grid / tallies / best-day highlight / sort-filter — that is **Phase 3** (DASH-01..05).
- The "Book it" / close-poll **action** (writing `status`) — that is **Phase 4**. This phase only *honors* an already-closed status read-only.
- Vote-spam rate limiting / abuse controls — ops concern; not MVP (anyone with the link may vote, by design).
- Injection / XSS / CSRF hardening of the new actions — canon security, owned by `/gsd-secure-phase`.
- Organizer adding their own availability row (ORG-01) — v2.

## Constraints

- **No participant account** — access is the unguessable participant link; the edit token is the only credential for editing (VOTE-01/06).
- **Three independent tokens** — `editToken` is a fresh `nanoid(21)`, never derived from `participantUrlId`/`adminUrlId` or another participant's token (extends Phase 1 P1).
- **`admin_url_id` never reaches a participant surface** — the edit/thanks views and their RSC payloads must select participant-safe columns only (extends Phase 1 P2).
- **Timezone-safe** — dates remain `YYYY-MM-DD` strings end-to-end; no `new Date(string)` (PLAT-04 / P3). The grid renders option labels via the existing `formatDate*` helpers.
- **Postgres everywhere** — same single Drizzle schema for local Docker + Neon; `votes` indexed by `poll_id` (and by `participant_id`) for Phase 3's aggregation.
- **State encoding** — vote state stored as text `yes` | `ifneedbe` | `no`; one row per `(participant_id, option_id)` (unique constraint).
- **Same-device cookie** holds the edit token, is `httpOnly`, and scopes to the participant path; it is a convenience for auto-load, not an authorization mechanism (the token in the row is the authority).

## Acceptance Criteria

- [ ] A valid submit on a known participant link creates one `participants` row + exactly one `votes` row per option, and redirects to `/thanks`
- [ ] An unknown participant token → 404; an unknown/empty `editToken` on the edit route → 404
- [ ] Each option ends with exactly one of `yes`/`ifneedbe`/`no`; untouched options are stored as `no`; no duplicate `(participant, option)` row
- [ ] Blank/whitespace-only name is rejected with a field error and creates no rows; name-only (no email) succeeds
- [ ] The created `editToken` is 21 chars and is not equal to / not derivable from the poll's `participantUrlId`
- [ ] Editing via a valid edit link changes the stored states; re-applying identical selections is idempotent
- [ ] Presenting participant B's token (or no token) does not modify participant A's response
- [ ] Returning on the same device after submit auto-loads the prior selections
- [ ] "Set all Available" sets every cell `yes`; a subsequent single-cell toggle changes only that cell; "Clear" resets every cell to `no`
- [ ] When `poll.status != 'open'`, the vote/edit form renders read-only and `submitResponse`/`updateResponse` reject the write server-side
- [ ] No participant-facing page or payload (participant view, edit view, `/thanks`) contains `admin_url_id` or any other participant's email

## Edge Coverage

**Coverage:** 14/17 applicable edges covered · 3 dismissed · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | VOTE-01 | ✅ covered | Invalid/unknown participant token → 404 (existing page behavior, AC #2) |
| adjacency | VOTE-02 | ✅ covered | Unique `(participant_id, option_id)` — one vote row per pair (AC #3) |
| empty | VOTE-02 | ✅ covered | Untouched cells default to `no`; single-option poll submits cleanly (AC #3) |
| ordering | VOTE-02 | ⛔ dismissed | Vote rows are keyed by option; there is no order-bearing output — display order is the options' chronological order (Phase 1/3), not a property of vote storage |
| adjacency | VOTE-03 | ✅ covered | Duplicate participant names allowed → distinct rows with distinct tokens (AC #5; round-2 decision) |
| empty | VOTE-03 | ✅ covered | Empty/whitespace name rejected; empty email allowed (AC #4) |
| encoding | VOTE-03 | ✅ covered | Length measured on the trimmed JS string; name ≤100, email ≤200 — mirrors Phase 1 title trim/cap |
| ordering | VOTE-03 | ⛔ dismissed | Insert order of vote rows is irrelevant; they are addressed by option, never emitted in insertion order |
| idempotency | VOTE-05 | ✅ covered | Update is replace-by-participant; re-applying identical selections yields identical rows (AC #6) |
| concurrency | VOTE-05 | 🧪 backstop | Two concurrent edits of one row → transactional replace, last-write-wins, never a mixed/partial set. Held-out concurrency test carried into plan-phase |
| empty | VOTE-06 | ✅ covered | Missing/empty edit token → 404 (AC #2) |
| encoding | VOTE-06 | ✅ covered | Token compared as exact string (DB equality); 126-bit random — constant-time compare unwarranted |
| idempotency | VOTE-06 | ✅ covered | Re-running a valid update is idempotent (same as VOTE-05) |
| concurrency | VOTE-06 | 🧪 backstop | Token-check + write race covered by the VOTE-05 transactional replace; same held-out test |
| adjacency | VOTE-07 | ✅ covered | Bulk sets all cells; a later per-cell change overrides only that cell (AC #9) |
| empty | VOTE-07 | ✅ covered | Bulk applies to all rendered options (always ≥1); "Clear" = reset all to `no` |
| ordering | VOTE-07 | ⛔ dismissed | Grid render order is the options' chronological order; bulk is order-independent (sets every cell identically) |

## Prohibitions (must-NOT)

**Coverage:** 5/5 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT expose `admin_url_id` on any participant / edit / `/thanks` surface or its RSC payload | VOTE-01/05 | resolved | verification: test — assert the rendered HTML + payload for the participant, edit, and thanks routes contain no `admin_url_id` (extends Phase 1 P2 to the new surfaces) |
| MUST NOT modify a response without the matching per-participant edit token; one participant's token MUST NOT edit another's row; a name-only attempt MUST NOT modify anything | VOTE-06 | resolved | verification: test — `updateResponse` with wrong/missing token (or name only) leaves the target row unchanged; only the exact-token owner's row changes |
| MUST NOT derive the `editToken` from the participant link or any other token | VOTE-03 | resolved | verification: test — `editToken` is an independent `nanoid(21)`; assert it is not equal to / not a transform of `participantUrlId` (extends Phase 1 P1) |
| MUST NOT accept a vote/edit write when `poll.status != 'open'` (server-enforced, not UI-only) | VOTE-05 | resolved | verification: test — call `submitResponse`/`updateResponse` against a non-open poll and assert the write is rejected and no rows change |
| MUST NOT expose participant email addresses to other participants or in participant-facing / results payloads | VOTE-03 | resolved | verification: test — assert no participant-facing query/page includes another participant's email (email is collected for Phase 4 organizer mail only) |

*Canon-referral (not minted here): injection/XSS/CSRF on the new server actions → owned by `/gsd-secure-phase` + framework defaults; vote-spam rate limiting → ops/secure-phase, out of MVP scope.*

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                            |
|--------------------|-------|------|--------|--------------------------------------------------|
| Goal Clarity       | 0.88  | 0.75 | ✓      | Anonymous 3-state vote + token-verified self-edit |
| Boundary Clarity   | 0.86  | 0.70 | ✓      | VOTE-07 in; email collected-not-sent; close honored not built |
| Constraint Clarity | 0.80  | 0.65 | ✓      | Untouched=`no`, status guard, 3-token model, encoding |
| Acceptance Criteria| 0.82  | 0.70 | ✓      | 11 pass/fail criteria + edge/prohibition tests   |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      |                                                  |

Status: ✓ = met minimum, ⚠ = below minimum (planner treats as assumption)

## Interview Log

| Round | Perspective       | Question summary                         | Decision locked                                              |
|-------|-------------------|------------------------------------------|-------------------------------------------------------------|
| 1     | Researcher        | Include VOTE-07 bulk actions this phase? | Yes — build "Set all / Clear" into the grid                 |
| 1     | Simplifier        | What does the email field do (no email until P4)? | Collect optional email, store it (unused until Phase 4) |
| 1     | Researcher        | State of an untouched candidate date?    | Untouched = `Not available` (no requirement to touch all)   |
| 2     | Simplifier        | Identity / re-submission model?          | Same-device cookie holds edit token → re-submit updates that row; no link on a new device = new participant; duplicate names allowed |
| 2     | Boundary Keeper   | How to treat poll `status` in Phase 2?   | Honor it now — read-only + server reject when not `open`    |

---

*Phase: 02-participant-voting*
*Spec created: 2026-06-30*
*Next step: /gsd-discuss-phase 2 — implementation decisions (grid interaction, action/transaction shape, cookie + edit-route wiring)*

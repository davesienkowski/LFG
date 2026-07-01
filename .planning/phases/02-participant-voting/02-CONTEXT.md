# Phase 2: Participant Voting - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

A participant opens the shared participant link and records three-state availability (Available / If-need-be / Not available) for every candidate date without an account, then returns — via a same-device cookie or a personal edit link — to change only their own response while the poll is open. Adds the `participants` + `votes` tables, the `AvailabilityGrid` client island (3-state + VOTE-07 bulk actions), the `submitResponse`/`updateResponse` server actions with token-verified ownership, `/thanks`, and the `/p/[participantUrlId]/edit/[editToken]` route. No email send (Phase 4), no results grid (Phase 3), no close-poll action (Phase 4).

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked** (VOTE-01, VOTE-02, VOTE-03, VOTE-05, VOTE-06, VOTE-07). See `02-SPEC.md` for full requirements, boundaries, acceptance criteria, Edge Coverage, and Prohibitions.

Downstream agents MUST read `02-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- `participants` and `votes` tables (+ migration), reusing the Phase 1 dual-driver client and DATE/timezone conventions
- Vote form on `/p/[participantUrlId]`: name (required), email (optional), the three-state `AvailabilityGrid`
- `AvailabilityGrid` client island: per-cell 3-state cycle + VOTE-07 bulk actions ("Set all Available / Not available / Clear")
- `submitResponse` server action (validate → create participant + edit token → one vote per option)
- `/thanks` surfacing the personal edit link + a same-device cookie that auto-loads the prior response
- `/p/[participantUrlId]/edit/[editToken]` route + `updateResponse` with exact-token ownership (replace semantics, last-write-wins)
- Server-side guard: reject writes when `poll.status != 'open'`; render read-only with a "voting is closed" notice
- Email address collected and stored on the participant row (for Phase 4); no email sent this phase

**Out of scope (from SPEC.md):**
- Sending any email — Phase 4 (edit link surfaced on-screen + cookie this phase)
- Results grid / tallies / best-day / sort-filter — Phase 3
- The "Book it" / close-poll write — Phase 4 (this phase only honors an already-closed status read-only)
- Vote-spam rate limiting / abuse controls — ops, not MVP
- Injection / XSS / CSRF hardening of the new actions — canon security, `/gsd-secure-phase`
- Organizer adding their own availability row (ORG-01) — v2

</spec_lock>

<decisions>
## Implementation Decisions

### Schema Shape (new tables)
- **D-01:** `participants` table: `id` (uuid PK), `poll_id` (uuid FK → polls, cascade delete), `name` (text not null), `email` (text, nullable — collected for Phase 4, not sent now), `edit_token` (text not null, **unique**), `created_at` (timestamptz default now).
- **D-02:** `votes` table: `id` (uuid PK), `poll_id` (uuid FK → polls, cascade — denormalized so Phase 3 can aggregate by poll with a single index), `participant_id` (uuid FK → participants, cascade), `option_id` (uuid FK → options, cascade), `state` (text not null). **Unique `(participant_id, option_id)`** — exactly one vote per participant per option (SPEC VOTE-02 adjacency). Indexes on `votes(poll_id)` and `votes(participant_id)`.
- **D-03:** `state` is stored as **text** constrained to `'yes' | 'ifneedbe' | 'no'` by Zod at the action boundary — NOT a Postgres enum. Rationale: matches Phase 1's `polls.status` text precedent (D-05); avoids enum-alter migration friction; the app already validates with Zod.

### Write Strategy (CONSTRAINED by Phase 1 D-03: neon-http has NO interactive transactions)
- **D-04:** `submitResponse` mirrors `createPoll`: insert the `participants` row (retry on the astronomically-improbable `edit_token` unique collision, exactly like the token-collision retry in `createPoll`), then insert ALL vote rows in **one batched insert**. Two statements, no interactive transaction — the same shape Phase 1 used (poll insert → options insert). Untouched options are written with `state = 'no'` (SPEC: untouched = Not available).
- **D-05:** `updateResponse` uses a **single `insert(votes).values(allRows).onConflictDoUpdate({ target: [participant_id, option_id], set: { state } })`** upsert. One atomic statement → idempotent (re-applying identical selections yields identical rows, SPEC VOTE-05) and race-safe (a concurrent edit resolves to last-write-wins with no partial/mixed set) WITHOUT needing an interactive transaction (which neon-http does not support). The option set per poll is fixed, so every cell is always present in the upsert.

### Grid Interaction (`AvailabilityGrid` client island)
- **D-06:** Per-cell **click-to-cycle**: Available (`yes`) → If-need-be (`ifneedbe`) → Not available (`no`) → back, Doodle-style, each state with a distinct color + icon + accessible label. VOTE-07 bulk buttons ("Set all Available", "Set all Not available", "Clear" → reset all to `no`) sit above the grid; a subsequent per-cell click overrides only that cell.
- **D-07:** Reuse the Phase 1 form pattern: the grid is a `"use client"` island that holds state and serializes the selections into a hidden input (like `poll-create-form`'s `dates` input); the surrounding form posts to the server action via `useActionState` for inline validation errors.

### Same-Device Auto-Load
- **D-08:** On successful submit, set an **httpOnly** cookie holding the participant's `edit_token` (e.g. `lfg_edit_<pollId>`), `SameSite=Lax`, long `maxAge`. The participant page (RSC) reads it via `next/headers` `cookies()`; if it resolves to a participant of THIS poll, it preloads that response into the grid. The cookie is a convenience for auto-load only — **the `edit_token` stored on the row is the sole authority** for edits (SPEC VOTE-06); the cookie is never trusted for authorization.

### Edit-Link Surfacing & URL Building
- **D-09:** `/thanks` reuses the existing `CopyLinkButton` component (Phase 1) to present the absolute edit URL `${BASE}/p/<participantUrlId>/edit/<editToken>`, built from `NEXT_PUBLIC_BASE_URL` with the header fallback (D-10 pattern), plus "bookmark this to change your answer" guidance.

### Validation & Action Ergonomics
- **D-10:** Zod schemas validate `submitResponse`/`updateResponse` server-side: `name` (trim, 1–100), `email` (optional; if present valid + ≤200), and a `votes` array of `{ optionId, state ∈ enum }`. Actions live in `src/lib/actions/` (`submit-response.ts`, `update-response.ts`). Bad/unknown participant or edit token → `notFound()` (404, D-08); a non-`open` poll → read-only render + server-side write rejection.
- **D-11:** The `edit_token` is minted by the existing `generateToken()` (`nanoid(21)`), a **third independent token** never derived from `participantUrlId`/`adminUrlId` (extends Phase 1 P1). Edit/thanks queries select participant-safe columns only — `admin_url_id` never reaches these surfaces (extends P2).

### Claude's Discretion
- Exact grid cell visuals (colors/icons), the hidden-input serialization format, cookie name/maxAge specifics, and whether the edit route reuses the participant page component or is a sibling — left to planner/executor, provided D-04/05 (no interactive txn), D-08 (cookie ≠ authority), and the SPEC acceptance criteria + prohibitions hold.
- **UI design contract recommended:** the `AvailabilityGrid` + `/thanks` are net-new UI (ROADMAP "UI hint: yes"; `workflow.ui_phase: true`). A `/gsd-ui-phase 2` pass before execution would lock the grid's three-state visual language and a11y; plan-phase may insert it per config.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements (LOCKED — read first)
- `.planning/phases/02-participant-voting/02-SPEC.md` — Locked requirements (VOTE-01,02,03,05,06,07), boundaries, acceptance criteria, Edge Coverage, and Prohibitions (must-NOT). MUST read before planning.

### Foundation carried forward (Phase 1 — highest cost-to-change)
- `.planning/phases/01-foundation-poll-creation/01-CONTEXT.md` — D-03 dual-driver (neon-http, **no interactive transactions**), D-05/06 schema, D-07 independent tokens + collision retry, D-08 routing/`notFound()`, D-09 participant-safe queries (P2), D-11 timezone-safe dates (P3)
- `.planning/phases/01-foundation-poll-creation/01-SPEC.md` — foundation prohibitions P1 (token non-derivation) / P2 (admin-link non-leak) / P3 (timezone) that EXTEND to the new surfaces
- `.planning/phases/01-foundation-poll-creation/01-02-SUMMARY.md` — the `createPoll` no-interactive-transaction + token-collision-retry pattern that `submitResponse` mirrors

### Research
- `.planning/research/ARCHITECTURE.md` — data model (Rallly-validated), three-token strategy, server-action patterns
- `.planning/research/PITFALLS.md` — neon-http transaction limits, timezone footgun, Vercel Hobby limits

### Project
- `.planning/REQUIREMENTS.md` — VOTE-01..07 + traceability
- `.planning/ROADMAP.md` §"Phase 2: Participant Voting" — goal, 5 success criteria, the 2 planned sub-plans (02-01 schema+grid+submit+view+thanks, 02-02 edit route+updateResponse ownership check)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/tokens.ts` `generateToken()` — mint the per-participant `edit_token` (third independent token).
- `src/lib/db/index.ts` — the dual-driver client; reuse as-is. **Constraint: no interactive/callback transactions (neon-http).**
- `src/lib/db/queries.ts` `getPollByParticipantUrlId` / `getOptionsForPoll` — participant-safe reads to extend with vote-loading + edit-token lookup helpers.
- `src/lib/format-date.ts` `formatDateWithTime` — render option labels in the grid (timezone-safe, D-11).
- `src/components/copy-link-button.tsx` — surface the edit link on `/thanks`.
- `src/components/poll-create-form.tsx` — the client-island + hidden-input + `useActionState` pattern the vote form mirrors.
- `src/lib/actions/create-poll.ts` — the no-transaction + collision-retry write pattern for `submitResponse`.

### Established Patterns
- Server actions in `src/lib/actions/`; Zod validation at the boundary; `notFound()` for unknown tokens.
- Dates stay `'YYYY-MM-DD'` strings end-to-end; never `new Date(string)` (D-11 / P3).
- Participant-facing queries select only participant-safe columns (no `admin_url_id`, P2).

### Integration Points
- New `participants`/`votes` tables FK into the existing `polls`/`options`. `votes(poll_id)` + `votes(participant_id)` indexes are the seam Phase 3's results aggregation reads.
- `/p/[participantUrlId]/page.tsx` changes from a static placeholder to the live vote form (+ cookie preload). New `/thanks` and `/p/[participantUrlId]/edit/[editToken]` routes.

</code_context>

<specifics>
## Specific Ideas

- Mirror Doodle's per-cell click-to-cycle and the per-row bulk actions (Set all / Clear) reviewed in the original brainstorm.
- The edit link is the participant's only credential — surface it prominently on `/thanks` ("bookmark this") since there is no email this phase.

</specifics>

<deferred>
## Deferred Ideas

- Sending the edit link by email (VOTE-04) — Phase 4.
- The "Book it" / close-poll write that flips `status` — Phase 4 (this phase only honors a closed status read-only).
- Vote-spam / rate limiting — ops concern, not MVP.
- Organizer adds their own availability row (ORG-01) — v2.

None of the above are in scope for Phase 2 — discussion stayed within the SPEC boundary.

</deferred>

---

*Phase: 2-participant-voting*
*Context gathered: 2026-06-30*

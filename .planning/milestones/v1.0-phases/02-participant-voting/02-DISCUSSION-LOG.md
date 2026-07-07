# Phase 2: Participant Voting - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 02-participant-voting
**Mode:** `--auto --chain` (gray areas auto-resolved with recommended defaults; auto-advance to plan-phase)
**Areas discussed:** Vote/participant schema, Write strategy, Grid interaction, Same-device auto-load, Edit-link surfacing, Validation & action ergonomics

---

## Vote / participant schema shape

| Option | Description | Selected |
|--------|-------------|----------|
| `state` as text + Zod enum | text column constrained to yes/ifneedbe/no by Zod; unique (participant_id, option_id); index poll_id+participant_id | ✓ |
| `state` as Postgres enum | native pg enum type for the three states | |

**Auto-selected (recommended):** text column — matches Phase 1's `polls.status` text precedent (D-05), avoids enum-alter migration friction, Zod already validates at the boundary.

---

## Write strategy (neon-http has no interactive transactions)

| Option | Description | Selected |
|--------|-------------|----------|
| Insert participant + batched insert; edit = single upsert | submit: participant insert (token-collision retry) + one batched vote insert; edit: `insert…onConflictDoUpdate(state)` | ✓ |
| Delete-then-insert in a transaction | wrap delete + re-insert in a callback transaction | |

**Auto-selected (recommended):** mirrors `createPoll` (two statements, no interactive txn). The single-statement upsert is atomic + idempotent + race-safe without the transactions neon-http does not support.

---

## Grid interaction model

| Option | Description | Selected |
|--------|-------------|----------|
| Click-to-cycle cell + bulk buttons | per-cell cycle yes→ifneedbe→no (Doodle-style); VOTE-07 bulk above; per-cell overrides bulk | ✓ |
| Three explicit radios/segments per row | a 3-segment control per option | |

**Auto-selected (recommended):** click-to-cycle mirrors Doodle and is compact; reuses the Phase 1 client-island + hidden-input + `useActionState` form pattern.

---

## Same-device auto-load

| Option | Description | Selected |
|--------|-------------|----------|
| httpOnly cookie holding edit_token, read in RSC | cookie is convenience; DB token is the authority | ✓ |
| localStorage on the client | store the edit link client-side | |

**Auto-selected (recommended):** httpOnly cookie read server-side in the RSC preloads the prior response; the cookie is never trusted for authorization (the row's `edit_token` is).

---

## Edit-link surfacing on /thanks

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse Phase 1 CopyLinkButton | absolute edit URL via NEXT_PUBLIC_BASE_URL (D-10) + copy + "bookmark this" | ✓ |
| Bespoke thanks component | new copy UI | |

**Auto-selected (recommended):** reuse the existing component; consistent with the admin page's link cards.

---

## Validation & action ergonomics

| Option | Description | Selected |
|--------|-------------|----------|
| Zod + useActionState, actions in src/lib/actions/ | server-side validation, inline errors, notFound() for bad token / closed poll | ✓ |
| Hand-rolled validation | manual checks | |

**Auto-selected (recommended):** consistent with Phase 1's `createPoll` + `poll-create-form`.

---

## Claude's Discretion

- Grid cell visuals (colors/icons), hidden-input serialization format, cookie name/maxAge, and edit-route component reuse — left to planner/executor within the D-04/05/08 constraints and the SPEC.
- A `/gsd-ui-phase 2` pass is recommended before execution (net-new grid + thanks UI; `workflow.ui_phase: true`).

## Deferred Ideas

- Email send of the edit link (VOTE-04) — Phase 4.
- Close-poll write that flips `status` — Phase 4 (this phase honors closed status read-only only).
- Vote-spam / rate limiting — ops, not MVP.
- Organizer self-availability row (ORG-01) — v2.

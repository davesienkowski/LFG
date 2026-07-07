# Your Polls Dashboard — Design

**Date:** 2026-07-06
**Status:** Approved (design), pending implementation plan

## Problem

The booked-dates calendar feed (`/feed/<organizerId>/calendar.ics`) groups every poll an
admin has **finalized** under one `lfg_organizer` browser cookie. But the admin has no way
to (a) see all the polls they've created, or (b) create a new poll from a poll's admin page.
And the subscribe card doesn't explain that the "same browser" is what keeps all their polls
in one calendar — the most likely point of confusion.

## Goal

Give the admin a single place to see every poll they've created (from this browser) and a
clear path to create another, so that finalizing more polls — which is what populates the
calendar feed — is discoverable. Clarify the subscribe copy.

## Non-goals (scope guard — project simplicity constraint)

- **No** edit/delete/close/rename from the list. Each poll's admin page still owns
  management; the list only **views, links, and offers create**.
- **No** accounts/login. Identity stays the `lfg_organizer` cookie (unchanged).
- **No** cross-device sync. Same tradeoff as the existing feed: a different browser/device
  is a different organizer identity. This is documented in the UI copy, not "fixed."
- **No** surfacing of legacy polls (created before the organizer cookie existed,
  `organizer_id = NULL`) — they can't be attributed to an organizer and won't appear.

## Design

### 1. Route `/polls` — "Your polls" (React Server Component)

Reads the `lfg_organizer` httpOnly cookie via `next/headers` `cookies()` (dynamic render,
never cached). Behavior:

- **Cookie present AND ≥1 poll:** render the list (see §3 shape), newest first. The
  subscribe card (§4) renders at the top since the feed is an organizer-level concern.
- **Cookie absent, OR present but zero polls:** render an empty state — a short heading
  ("You haven't created any polls yet") and a **Create a poll** button (→ `/`). No error,
  no 404 — identical treatment for "no cookie" and "unknown/empty organizer", consistent
  with the feed route's no-oracle discipline.
- **Header:** an `<h1>Your polls</h1>` and a **Create a poll** button (→ `/`).

Each list row is a link to that poll's admin page `/a/<adminUrlId>` and shows:

- **Title**
- **Status badge:** `Open` (neutral) or `Booked` (emerald), from `poll.status`.
- **Summary:** if booked → the finalized date (`formatDateWithTime`, string-based, D-11/P3);
  if open → `"{n} date{s}"` (candidate option count).
- **Response count:** `"{n} response{s}"` (participant count).

### 2. Query `getPollsByOrganizerId(organizerId)` — `src/lib/db/queries.ts`

Returns every poll for the organizer (open + closed), `created_at` DESC, then a stable
`polls.id` tiebreaker. Shape (JSON-serializable, participant-safe columns ONLY):

```
{ adminUrlId, title, status, winningDate, winningStartTime, optionCount, responseCount }
```

- `winningDate` / `winningStartTime`: LEFT JOIN `options` on `polls.winning_option_id`
  (null while open) — same pattern as `getFinalizedPollsByOrganizerId`.
- `optionCount`: count of `options` for the poll.
- `responseCount`: count of `participants` for the poll.
- Implemented with correlated aggregate subqueries (or grouped joins) to keep it a single
  neon-http statement (no interactive transaction).
- **Discipline (three-token / no-leak):** selects NO participant name/email, NO edit token,
  and — critically — `admin_url_id` **is** returned here (the organizer owns these polls and
  needs the link to manage them), but participant_url_id / edit_token / creator_email are
  NOT. An unknown/empty `organizerId` matches no rows → returns `[]`.
- Empty/whitespace `organizerId` must be treated as "no polls" (return `[]`), never a query
  that could group across polls — mirror the create-poll normalization.

### 3. List item component

A small presentational row (title + badge + summary + response count) wrapped in a
`next/link` to `/a/<adminUrlId>`. Reuses existing badge styling from the admin page
(emerald "Booked" pill; a neutral "Open" pill). No new client JS.

### 4. Entry points

- **Admin page `/a/[adminUrlId]`:** a small top link row above the title — **"Your polls"**
  (→ `/polls`) and **"Create a poll"** (→ `/`). This is the "from the admin page" ask.
- **Landing `/`:** a **"Your polls"** link, rendered **only when the `lfg_organizer` cookie
  is present** (first-time visitors don't see a dead link). Requires reading the cookie in
  the `/` RSC (currently static; becomes dynamic — acceptable, it's a tiny page).

### 5. Copy clarification

On the subscribe card (admin page, and the new `/polls` card), add one line:
> "Create your polls from the same browser to keep them all in one calendar."

## Data flow

`/polls` RSC → read `lfg_organizer` cookie → `getPollsByOrganizerId(id)` →
render list (or empty state) + subscribe card. Each row links to the existing `/a/<id>`
admin page. "Create a poll" links to the existing `/` form. No new write paths, no new
server actions, no schema change.

## Error handling

- No cookie / unknown organizer / empty string → empty state (no throw, no 404).
- Query is read-only; a DB error surfaces via the framework error boundary like any other
  page (no special handling needed; nothing to partially write).

## Testing

- **`getPollsByOrganizerId` (DB test):** returns the organizer's polls newest-first with
  correct `optionCount` / `responseCount` / `winningDate`; EXCLUDES another organizer's
  polls; returns `[]` for unknown and for empty-string organizerId; a legacy `NULL`-organizer
  poll never appears.
- **`/polls` page (render test):** with cookie → lists polls, badges, counts, links to
  `/a/<adminUrlId>`; never emits a participant name/email, edit token, or a different
  organizer's poll. Without cookie → empty state + Create button, no throw.
- **Admin page:** renders the "Your polls" + "Create a poll" links.
- **Landing page:** shows the "Your polls" link when the cookie is present; hides it when
  absent.

## Rollout

Frontend + one read query; no migration. Ship on the standard branch → test → build →
visual-verify → deploy path.

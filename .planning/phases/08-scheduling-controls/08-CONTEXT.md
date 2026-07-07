# Phase 8: Scheduling Controls - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per user's no-prompt directive)

<domain>
## Phase Boundary

Give the organizer two direct controls over a poll's timeline and their own participation:
1. **DEAD-01** — an OPTIONAL voting deadline; once it passes, the poll is closed to further voting (vote form read-only), evaluated LAZILY on poll access (no cron / scheduled job).
2. **ORG-01** — the organizer can add and edit their OWN availability row from the admin view (no participant link), and it appears in the results grid and best-day computation like any other participant.

In scope: an additive nullable `deadline` column on polls + an additive nullable `is_organizer` flag on participants; a shared derived "is voting open" check used at every vote gate; admin controls to set/clear the deadline and to add/edit the organizer's own availability.

Out of scope: automatic reminders/notifications when a deadline nears or passes (permanently out — cron); recurring deadlines; multiple organizer rows; changing the "Book it" finalization flow; SLOT-01/CMNT-01/MOBL-01 (deferred).
</domain>

<decisions>
## Implementation Decisions

### DEAD-01 — Voting Deadline (lazy auto-close)
- Add a NEW additive, NULLABLE `deadline` column to `polls` — a `timestamptz` (an instant, NOT a date-only value; the PLAT-04 `new Date()` prohibition is about date-only candidate strings and does not apply to this instant). NULL = no deadline (existing behavior). Backward-compatible migration (v1.0 pattern).
- The organizer can SET or CLEAR an optional deadline from the admin view (`/a/[adminUrlId]`). A new admin-token-authorized server action persists it (re-derives the poll from the admin token; never a client poll id).
- LAZY auto-close — NO cron, NO scheduled job, and NO DB write on read. Introduce ONE shared pure helper, e.g. `isVotingOpen(poll, now)` = `poll.status === "open" && (poll.deadline == null || poll.deadline > now)`. Evaluated server-side on each access. Do NOT write `status` on read (avoids read-triggered writes / serverless races).
- Keep DEAD (auto-close voting) DISTINCT from FNL "Book it" (finalize with a winner): a deadline-passed poll is voting-closed but NOT booked. The "Booked" pill, the finalized card, and the `event.ics`/calendar-feed reads stay keyed on `status === "closed"` (a real finalize with a `winningOptionId`) — they must NOT treat a mere deadline-passed poll as finalized. Only the VOTE gates switch to the derived `isVotingOpen` check.
- Enforce server-side: `submitResponse` and `updateResponse` currently gate on `poll.status !== "open"`; those gates become `!isVotingOpen(poll, now)` so a vote submitted after the deadline is rejected even if a stale client form is still open. The participant page + edit page render the vote form read-only when `!isVotingOpen`, with a clear "voting has closed" message (distinguish "deadline passed" from "organizer booked a date" in the copy where reasonable).
- Admin view surfaces the current deadline and, once passed, a "voting closed (deadline passed)" state; the organizer can still "Book it" after a deadline passes (choosing among the votes received).
- "now" is the current instant server-side (SQL `now()` or a JS `Date` for the comparison — not parsing a date-only string). Compute `isVotingOpen` server-side and pass booleans to client components (do not serialize a raw Date across the RSC boundary — Pitfall 2 precedent).

### ORG-01 — Organizer's Own Availability Row
- Add a NEW additive, NULLABLE `is_organizer` boolean (default false) to `participants`. AT MOST ONE organizer row per poll (the add/edit action upserts the existing `is_organizer` row rather than creating duplicates).
- The organizer adds/edits their own availability from the admin view WITHOUT the participant link. A new admin-token-authorized server action creates-or-updates the organizer's participant row + its votes (reusing the existing participant/votes model and the same three-state input). Name defaults to something like "You" (organizer may override); no email required for the organizer row.
- The organizer row is a NORMAL participant: it appears in the results grid and the best-day/`computeResults` tally with ZERO changes to those functions. The grid MAY visually label it "(you)" via the `is_organizer` flag, but that is presentation only.
- Reuse the existing `AvailabilityGrid` (or the vote-form input) for the organizer's per-date selection on the admin page.
- Gate consistently: adding/editing the organizer's availability is subject to the SAME `isVotingOpen` rule (can't add availability to a booked/closed or deadline-passed poll) — or, if we allow the organizer to record availability any time before booking, keep it available until finalized; DEFAULT: allow while `isVotingOpen` is true, matching participant behavior.

### Security & Discipline
- Both new admin actions (set deadline, add/edit organizer availability) re-derive the poll from the admin token (`getPollByAdminUrlId`), never a client-supplied poll id (V4 precedent).
- No new email-leak surface: the organizer row's data follows the same participant-safe column discipline (the results grid already omits emails; the organizer row has no email anyway).
- All schema changes additive + nullable; prod migration is the same backup → migrate → deploy gate as Phase 7 (07-04), self-serve.

### Claude's Discretion
- Exact column/action/helper names, whether `isVotingOpen` lives in `src/lib` (e.g. a new `poll-status.ts`) or beside `results.ts`, the admin deadline input UX (date+time picker vs. native input), and the organizer-row label wording are at the planner/executor's discretion, guided by existing conventions.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Vote gates to convert to `isVotingOpen`: `src/app/p/[participantUrlId]/page.tsx:70/107`, `src/app/p/[participantUrlId]/edit/[editToken]/page.tsx:65`, `src/lib/actions/submit-response.ts:115`, `src/lib/actions/update-response.ts` (same `status !== "open"` guard), and `src/components/vote-form.tsx` (`readOnly`).
- `src/lib/actions/close-poll.ts` — the admin-token-authorized finalize action; mirror its authorization pattern for the new deadline + organizer-availability actions.
- `src/components/availability-grid.tsx` / `src/components/vote-form.tsx` — the three-state per-date input to reuse for the organizer's own row.
- `src/lib/results.ts` (`computeResults`) + `src/lib/db/queries.ts` (`getResultsForPoll`) — already fold ALL participants into the grid/best-day; the organizer row needs no change here.
- `src/app/a/[adminUrlId]/page.tsx` — where the deadline control and the "Add your availability" control render (reuse `isClosed`/`embefore-book` gating).
- `src/lib/format-date.ts` — for rendering the deadline instant (a timestamptz, so a normal Date format is fine here — not the date-only formatter).

### Established Patterns
- Additive, nullable, backward-compatible migrations (`winning_option_id`, `organizer_id`, `creator_email`, and Phase 7's `invitations`).
- Server Actions re-derive the poll from a token; never trust a client poll id.
- Date-only candidate values never pass through `new Date()` (PLAT-04) — but the deadline is a timestamptz instant, exempt from that rule.
- Do not serialize raw JS `Date` across the RSC→client boundary; compute booleans/strings server-side.

### Integration Points
- New nullable `deadline` (polls) + `is_organizer` (participants) columns in `src/lib/db/schema.ts` + a drizzle-kit migration (0006).
- New shared `isVotingOpen` helper referenced by both participant pages, both vote actions, and the admin page.
- New admin actions: set/clear deadline; add/edit organizer availability.
- Admin page: deadline control + organizer-availability control.
</code_context>

<specifics>
## Specific Ideas
- `isVotingOpen(poll, now)` = `status === "open" && (deadline == null || deadline > now)` — the ONE place the lazy-close rule lives.
- Deadline is a timestamptz instant; "Booked" stays keyed on `status === "closed"` so an expired-but-unbooked poll never claims a winner.
- Organizer row = a `participants` row with `is_organizer = true`, at most one per poll, upserted from the admin view.
</specifics>

<deferred>
## Deferred Ideas
- Reminder/notification as the deadline nears or passes — permanently out (Vercel Hobby cron limitation).
- Auto-book the top choice when the deadline passes — out of scope; the organizer still explicitly "Book it"s.
- Multiple organizer rows / co-organizers — out (single admin-link holder).
- Per-timezone deadline display niceties beyond a clear single-timezone render — keep simple (same-timezone group).
</deferred>

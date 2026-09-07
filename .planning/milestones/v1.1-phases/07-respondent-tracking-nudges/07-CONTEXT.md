# Phase 7: Respondent Tracking & Nudges - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — recommended answers auto-accepted per user's no-prompt directive)

<domain>
## Phase Boundary

Deliver organizer-facing respondent tracking and nudging on the existing admin page. Concretely: (1) persist who was invited (RESP-03), (2) show each invited person's responded / not-responded status on the admin view (RESP-01), and (3) a one-click "nudge" that re-emails only the non-respondents (RESP-02).

In scope: a new additive `invitations` table; recording invitations when invites are sent; an admin-only "Who's responded" surface matching invitations to voters by email; a nudge server action + reminder email template reusing the existing `sendEmail()` seam; graceful degradation when email is unconfigured.

Out of scope: deadlines/auto-close (Phase 8, DEAD-01), organizer's own availability row (Phase 8, ORG-01), automatic/scheduled reminders (permanently out of scope — cron), changing the anonymous participant-link voting flow, or exposing invited emails on any participant surface.
</domain>

<decisions>
## Implementation Decisions

### Invitation Persistence (RESP-03)
- Add a NEW additive `invitations` table (poll_id FK cascade, email text, invited_at timestamptz default now). Matches the "additive, nullable, prod-safe migration" v1.0 pattern; keeps `polls`/`participants` untouched.
- Store the address as entered PLUS enforce case-insensitive uniqueness per poll so re-inviting the same address never duplicates: `UNIQUE (poll_id, lower(email))` (or a normalized lowercase column with a plain unique). Use `onConflictDoNothing` on insert.
- Persist an invitation only when `sendEmail` returns `ok` (status "sent") — the invited list means "we actually sent them the link". rate_limited/failed sends are NOT recorded (the person never got a link to respond to). Recording happens inside the existing `sendInvites` loop, best-effort, and must never change the per-recipient result the UI already shows.
- The nudge action records nothing new — a nudge only targets already-recorded invitations, so no new rows are created by nudging.

### Responded / Not-Responded Matching (RESP-01)
- "Responded" = an invitation whose email matches (case-insensitively) some `participants.email` on the same poll. Reuse the existing participant email column; no new response-tracking field.
- Show an admin-only "Who's responded" section on `/a/[adminUrlId]` listing each invited email with a Responded / Not yet responded badge, plus a small count ("3 of 5 responded").
- Known, accepted limitations (documented, not solved): a person invited at address A who votes with a different email B shows as "not responded"; a person who voted via a directly-shared participant link without ever being emailed simply isn't in the invited list (they still appear in the results grid as today). These are acceptable for a small trusted group.
- The invited-emails read is a NEW admin-only query in `queries.ts` — it selects invitation email + a matched/not-matched flag, and is NEVER called by any participant-facing route (same no-leak discipline as `getVoterEmailsForPoll` / `getPollAdminNotifyTargets`).

### Nudge Behavior (RESP-02)
- One-click "Nudge non-respondents" button on the admin page that emails every not-yet-responded invited address at once (organizer confirms once; no per-recipient UI needed). Returns per-recipient result rows in the same shape/style as `sendInvites` (sent / rate_limited / failed).
- Distinct reminder email template (new `renderReminderEmail`) — reminder subject/copy ("Reminder: your response is needed") carrying the SAME participant link. Small addition alongside the existing invite/confirmation templates.
- Reuse the `sendEmail()` seam and the sequential, best-effort per-recipient loop exactly like `sendInvites` — no new transport, no batching, no CC/BCC.
- When there are zero non-respondents, the nudge control is disabled/hidden with a "everyone's responded" affordance rather than sending nothing.

### Security & No-Leak Discipline
- Both the tracking read and the nudge action re-derive the poll from the admin token (`getPollByAdminUrlId`), never a client-supplied poll id — mirrors `sendInvites` (V4) and the admin page.
- Invited emails are an admin-only surface. No participant-facing query selects the `invitations` table; the invited list never crosses into the participant page, the results grid payload, or any RSC prop reaching a participant browser (three-token / no-email-leak discipline, D-09 precedent).
- Nudge is unavailable on a closed poll (consistent with invites being hidden when `isClosed`), and hidden with the copy-link fallback when `EMAIL_PROVIDER` is unset/`none` (MAIL-03 parity).

### Claude's Discretion
- Exact table/column naming, whether to use a generated lowercase column vs. a functional unique index, component decomposition of the "Who's responded" card, and reminder email copy wording are at the planner/executor's discretion, guided by existing conventions (Drizzle schema style in `schema.ts`, server-action style in `send-invites.ts`, template style in `email/templates.ts`).
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/actions/send-invites.ts` — the exact pattern for the nudge action: admin-token re-derivation, address handling, sequential best-effort `sendEmail` loop, `SendInviteResult` result shape (reuse/extend for nudge results).
- `src/lib/email/send.ts` (`sendEmail` seam) + `src/lib/email/templates.ts` (`renderInviteEmail`) — reminder template slots in beside the invite template; nudge sends through the same seam.
- `src/lib/db/queries.ts` — read-helper conventions with strict participant-safe column selection; `getVoterEmailsForPoll` / `getPollAdminNotifyTargets` are the no-leak precedents for the new admin-only invited-emails read.
- `src/app/a/[adminUrlId]/page.tsx` — where the "Who's responded" section and the nudge control render; already branches on `isClosed` and `emailConfigured` (reuse those gates).
- `src/components/invite-by-email-form.tsx` — client-form + `useActionState` pattern to mirror for the nudge control.
- `src/lib/urls.ts` (`buildParticipantUrl`, `resolveBaseUrl`) — build the participant link for the reminder email.

### Established Patterns
- Additive, nullable, backward-compatible migrations (`winning_option_id`, `organizer_id`, `creator_email` all added this way).
- Server Actions re-derive the poll from a token; never trust a client poll id (V4).
- Best-effort side effects: one failed recipient never aborts the batch; email failures never throw to the user.
- Emails/tokens are excluded from any query that can reach a participant surface.

### Integration Points
- New Drizzle table in `src/lib/db/schema.ts` + a drizzle-kit migration (local `db:push`/`generate`; prod migrate is a separate gated step: backup → migrate → deploy).
- `sendInvites` gains a best-effort invitation-record write after a successful send.
- New `nudgeNonRespondents` server action + new admin-only query in `queries.ts`.
- Admin page gains an invited/responded section and a nudge control (both gated by `isClosed`/`emailConfigured`).
</code_context>

<specifics>
## Specific Ideas

- Matching is by email, case-insensitive, on the same poll. Count summary like "3 of 5 responded".
- Nudge = one action targeting all current non-respondents; reuses participant link; distinct reminder copy.
- Recording an invitation only on a successful send keeps "invited" honest (they got a link).
</specifics>

<deferred>
## Deferred Ideas

- Per-invitation resend/remove management UI — not needed for a small group this milestone.
- Tracking invite "opened"/click analytics — out of scope (no tracking pixels; privacy + complexity).
- Auto-reminders on a schedule — permanently out of scope (Vercel Hobby cron limitation).
- Matching invited people who vote under a different email — accepted limitation, not solved here.
</deferred>

# Phase 4: Email & Finalization - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

> Captured in `--auto` mode: every gray area was auto-resolved to the SEED-001
> recommendation or the established-pattern default. Each decision below is the
> recommended option; the planner/researcher may refine within the stated
> discretion, but the locked forks (env-switched seam, email-optional, no
> gmail-From on relays, additive `winning_option_id` + reuse `status`,
> best-effort non-blocking sends) must hold.

<domain>
## Phase Boundary

Layer free-tier email onto the existing app and add the "Book it" finalize flow.
Three email types — (1) organizer-sent **invitations** carrying the participant
link, (2) a participant **edit-link confirmation** on submit (VOTE-04), and (3)
**finalization notices** to all voters — all behind ONE env-switched
`sendEmail()` seam so the provider can swap without touching the email types.
When no provider is configured the app degrades gracefully to the existing
copy-link UX (MAIL-03). Finalization ("Book it") records a winning date, flips
`polls.status` to `closed` (reusing Phase 2's server-enforced read-only path),
and notifies every voter with an email on file.

Out of scope: participant accounts (permanent), reopening/undoing a finalized
poll (v2), "nudge non-respondents" (RESP-02, v2), rate-limiting/abuse controls
(ops), buying a custom domain (optional deliverability upgrade only — see D-01),
the organizer's own availability row (ORG-01, v2).

</domain>

<decisions>
## Implementation Decisions

### Email Transport & Provider Architecture (SEED-001)
- **D-01:** One env-switched `sendEmail()` seam under `src/lib/email/`; transport
  selected by an `EMAIL_PROVIDER` env var. Transport is **Nodemailer SMTP**.
  **Local dev = Mailpit** (`docker run axllent/mailpit`; SMTP :1025, UI :8025 —
  captures, never sends). **Prod default = Gmail SMTP + App Password** — SEED-001's
  ranked-#1 pick: the only truly-free, **no-domain** path with *good*
  deliverability, because mail leaves through Google *as* your gmail so
  SPF/DKIM/DMARC align (not treated as spoofed). SMTP2GO single-sender and
  Resend+domain stay swappable behind the same seam. **Resend + a custom domain is
  an optional deliverability UPGRADE, NOT a prerequisite** — it is no longer a
  blocker (this reverses the old STATE.md "~$10-12/yr domain + ~48h DNS" concern).
- **D-02:** ALL email env vars are **optional** in `src/lib/env.ts` (@t3-oss). An
  unset/`none` `EMAIL_PROVIDER` is a first-class "email not configured" state → the
  MAIL-03 graceful path. The app and EVERY non-email feature MUST run and pass
  with zero email config (no build/runtime failure when email is absent).
- **D-03:** DMARC-trap guard (SEED-001's most important gotcha): **never set `From:`
  to a gmail address on a third-party relay** (SMTP2GO/Brevo/Mailjet/SES/…) — it
  fails DMARC alignment and spam-folders. Only clean froms: `smtp.gmail.com`
  itself (auto-aligns), or a From on a DKIM-signed domain. `EMAIL_FROM` is set
  per provider accordingly; a gmail Reply-To is fine on a relay.

### Winning-Date Persistence & Finalize Schema
- **D-04:** Additive schema change only: add a **nullable `winning_option_id`**
  (uuid FK → `options`, `on delete set null`) to `polls`. Reuse the existing
  `status` text column (`'open'` → `'closed'`) — no new status vocabulary.
  Finalize is a single `UPDATE polls SET status='closed', winning_option_id=…`
  (neon-http-safe, no interactive transaction; mirrors Phase 2's additive-schema
  discipline). The **local migration gate** applies: generate + push to Docker
  Postgres and verify the column before asserting reads/writes; then prod Neon
  `db:migrate` + redeploy.

### Invite Send UX & Fallback (MAIL-01 / MAIL-03)
- **D-05:** The admin page (`/a/[adminUrlId]`) gains an **"Invite by email"** card:
  a multi-address input + a `sendInvites` server action that sends each recipient
  an **individual** email (loop, **not CC** — MAIL-01) containing the participant
  link. **Best-effort per address**: report per-recipient success/failure inline;
  one failure never aborts the rest. The 100/day-cap `429` and any transport error
  surface **visibly** to the organizer. When email is unconfigured (D-02) the card
  degrades to the existing `CopyLinkButton` + "email isn't set up — copy & share
  manually" (MAIL-03).
- **D-06:** Sends are **synchronous inside the server action** (micro-volume
  ~5–30/poll, a few polls/month — trivially inside every free tier). No queue
  (Vercel Queues is beta; overkill). **Research must verify Vercel serverless-SMTP
  viability** (handshake vs Hobby timeout, no cross-invocation pooling — SEED-001
  caveat); if Gmail-SMTP flakes on Vercel, fall back to an HTTPS-API provider
  behind the same D-01 seam.

### Confirmation Email (VOTE-04)
- **D-07:** On a successful `submitResponse`, **if** the participant supplied an
  email AND a provider is configured, fire the **edit-link confirmation** email
  (best-effort). A send failure MUST NOT fail the vote — `/thanks` already surfaces
  the edit link as the authoritative fallback (Phase 2 D-09). Fire **on first
  submit only**, not on every edit (edits already hold the link) — avoids spamming.

### Finalize Interaction & Notify Scope (FNL-01/02/03)
- **D-08:** "Book it" on the admin page lets the organizer pick the winning date;
  the computed best-day (`computeResults` `isBest`) is **pre-highlighted as the
  default suggestion** but the organizer may choose ANY candidate date. Closing is
  destructive/one-way for v1 → a **confirm step** guards it. On confirm,
  `closePoll(adminUrlId, winningOptionId)` writes status+winning_option_id and
  reuses the Phase-2 status-closed read-only path (participant & edit pages already
  render "Voting is closed"; `updateResponse` already rejects writes to a non-open
  poll). Reopen/undo is deferred (v2).
- **D-09:** On finalize, send a **finalization** email to every participant with a
  stored email (FNL-03) containing the chosen date + event details (title, time,
  location). Best-effort per recipient (same posture as D-05); a mail failure never
  blocks or reverts the close — the poll is authoritatively closed once the DB
  write commits. Participants without an email are simply not notified.

### Email Templates
- **D-10:** Three plain-HTML templates in `src/lib/email/templates.ts` (invite /
  edit-link confirmation / finalization). **No `react-email` dependency** (keep the
  bundle minimal, consistent with the project's no-bloat ethos); exact markup left
  to the executor. Dates render via the existing `formatDateWithTime` (timezone-
  safe, D-11/P3) — never `new Date()` on a date-only value.

### Claude's Discretion
- Exact email env-var shape (`SMTP_HOST/PORT/USER/PASS/EMAIL_FROM` vs a single URL
  vs per-provider blocks), template markup/copy, the "Invite by email" card layout
  and the "Book it" control placement, and whether `sendInvites` takes free-text
  addresses or reuses pre-seeded `participants` rows — all left to planner/executor,
  **provided** D-01 (env-switched seam), D-02 (email optional/graceful), D-03 (no
  gmail-From on relays), D-04 (additive `winning_option_id` + reuse `status`), and
  the best-effort non-blocking send posture (D-05/07/09) hold.
- **UI design contract recommended:** the invite card + "Book it" finalize are
  net-new UI (ROADMAP "UI hint: yes"). A `/gsd-ui-phase 4` pass before execution
  would lock the invite/finalize visual language and the "email not configured"
  empty state; plan-phase may insert it per config.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Email research (READ FIRST — answers the provider fork)
- `.planning/seeds/SEED-001-phase4-free-email-no-domain.md` — free/no-domain
  provider shortlist, the ranked recommendation (Gmail-SMTP+App-Password →
  SMTP2GO → Resend+domain), Mailpit for local, and the **gmail-From DMARC trap** +
  Vercel-serverless-SMTP caveat. Re-verify all free-tier numbers at build time.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — VOTE-04, MAIL-01..03, FNL-01..03 + traceability;
  Definition of Done (full happy path: create → invite → vote → grid → Book it →
  confirmations).
- `.planning/ROADMAP.md` §"Phase 4: Email & Finalization" — goal, 5 success
  criteria, the 2 planned sub-plans (04-01 email service+invite+VOTE-04, 04-02
  closePoll/Book-it+finalization emails), and the "Research: Required" note.

### Foundation carried forward (highest cost-to-change)
- `.planning/phases/01-foundation-poll-creation/01-CONTEXT.md` — neon-http **no
  interactive transactions** (closePoll = single UPDATE; sendInvites = read then
  loop-send), independent tokens, timezone-safe dates, `resolveBaseUrl`/URL
  builders, `notFound()` routing.
- `.planning/phases/02-participant-voting/02-CONTEXT.md` — the `status != 'open'`
  server-enforced **read-only path** (participant + edit pages, `updateResponse`
  TOCTOU guard) that finalize reuses; `participants.email` nullable field (the
  notify target); `/thanks` edit-link surfacing (VOTE-04's on-screen fallback);
  the `submitResponse` no-txn write pattern the confirmation hook extends.
- `.planning/phases/03-results-dashboard/03-CONTEXT.md` — `computeResults`
  `isBest` best-day flags reused to pre-select the "Book it" winning date.

### Deeper research
- `.planning/research/ARCHITECTURE.md` — data model, three-token strategy,
  server-action patterns.
- `.planning/research/PITFALLS.md` — neon-http transaction limits, timezone
  footgun, Vercel Hobby function limits (relevant to serverless-SMTP timeout).

### Project stack
- `.claude/CLAUDE.md` — Email stack table (Resend 6.16.0) + "Alternatives
  Considered" (Nodemailer+Gmail SMTP was dismissed there; SEED-001 argues it is
  actually the best $0 path at our volume — resolve in favor of SEED-001).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/lib/env.ts` — add the new OPTIONAL email vars here (@t3-oss); keep the app
  bootable with zero email config (D-02).
- `src/lib/urls.ts` — `resolveBaseUrl` + `buildParticipantUrl` / `buildEditUrl`
  build the absolute links the invite/confirmation emails embed.
- `src/lib/format-date.ts` `formatDateWithTime` — render dates in every email +
  the finalize UI (timezone-safe, D-11/P3).
- `src/lib/results.ts` `computeResults` (`isBest`) — pre-select the best day in
  "Book it" (D-08).
- `src/components/copy-link-button.tsx` — the MAIL-03 fallback when email is
  unconfigured (D-05).
- `src/app/a/[adminUrlId]/page.tsx` — mount point for the "Invite by email" card
  and the "Book it" finalize control.
- `src/app/p/[participantUrlId]/page.tsx`, `.../edit/[editToken]/page.tsx`,
  `src/components/vote-form.tsx`, `src/lib/actions/update-response.ts` — already
  honor `status !== 'open'` read-only; finalize just flips the flag (D-08).
- `src/lib/actions/create-poll.ts` — the no-interactive-transaction write pattern
  `closePoll` and `sendInvites` mirror.
- `src/lib/db/queries.ts` — extend with participant-safe reads for voter emails
  (finalization) and a poll+winning-option read.

### Established Patterns
- Server actions in `src/lib/actions/`; Zod validation at the boundary;
  `notFound()` for unknown/invalid tokens.
- neon-http = **no interactive/callback transactions** — `closePoll` is one
  `UPDATE`; `sendInvites`/finalization read once then loop the sends.
- Participant-facing surfaces select only participant-safe columns (never
  `admin_url_id`); email sending is an admin-triggered or submit-triggered action.
- Dates stay `'YYYY-MM-DD'` strings end-to-end; never `new Date(string)`.

### Integration Points
- Schema: add nullable `winning_option_id` to `polls` (migration → local Docker
  push + verify gate → prod Neon `db:migrate` + `npx vercel@latest deploy --prod
  --yes`; DB tests need `DATABASE_URL` exported, local pg = `lfg-db-1` on :5432).
- New actions: `sendInvites` (MAIL-01), `closePoll` (FNL-01/02); `submitResponse`
  gains a best-effort confirmation-send hook (VOTE-04, D-07).
- New module: `src/lib/email/` (`send.ts` transport-select + `sendEmail()`;
  `templates.ts` three templates).
- Local email verification runs against Mailpit (:8025 UI); prod verification is a
  real send through the configured provider.

</code_context>

<specifics>
## Specific Ideas

- Default the plan to **Gmail-SMTP-via-App-Password** for $0 prod sending and
  **Mailpit** for local — behind the env-switched `sendEmail()` seam — and treat
  "buy a domain + Resend" strictly as an optional deliverability upgrade (SEED-001
  actionable takeaway). Confirm the Google account still permits App Passwords.
- Individual sends, never CC (MAIL-01) — participants shouldn't see each other's
  addresses.
- The edit-link email (VOTE-04) carries the SAME link `/thanks` already shows; the
  email is an additional delivery channel, not a new credential.

</specifics>

<deferred>
## Deferred Ideas

- **Resend + custom domain** (and the eu.org free-subdomain route) — optional
  deliverability upgrade; adopt only if Gmail-SMTP / SMTP2GO ever spam-folder.
- **RESP-02** one-click "nudge" email to non-respondents — v2.
- **Reopen / undo** a finalized poll — v2 (v1 close is one-way).
- **Rate-limiting / abuse controls** on `sendInvites` — ops concern, not MVP.
- **Organizer's own availability row (ORG-01)** — v2.

None of the above are in scope for Phase 4 — discussion stayed within the ROADMAP
boundary.

</deferred>

---

*Phase: 4-email-finalization*
*Context gathered: 2026-07-01*

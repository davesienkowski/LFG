# Phase 4: Email & Finalization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 4-email-finalization
**Mode:** `--auto` (autonomous — Claude selected the recommended option for every gray area; no interactive prompts). `--chain` auto-advances to plan-phase.
**Areas discussed:** Email transport/provider, Winning-date persistence, Invite send UX & fallback, Confirmation email trigger, Finalize interaction & notify scope, Email templates

---

## Email Transport & Provider Architecture

| Option | Description | Selected |
|--------|-------------|----------|
| Gmail SMTP + App Password (Nodemailer), Mailpit local, env-switched seam | SEED-001 rec #1 — only truly-free, no-domain path with good deliverability (Google DKIM-signs; SPF/DMARC align) | ✓ |
| SMTP2GO single-sender | 1,000/mo free, no card, no DNS; but gmail-From fails DMARC → must use SMTP2GO's own From | |
| Resend + custom domain | "Do it properly" — only path that reliably inboxes arbitrary recipients, but needs a domain (~$1-12/yr) + ~48h DNS | |

**Selected (recommended default):** Env-switched `sendEmail()` seam; Nodemailer SMTP; Mailpit local; Gmail-SMTP+App-Password default prod; SMTP2GO/Resend swappable.
**Notes:** Reverses the old STATE.md "must buy a domain" blocker per SEED-001. Carries the DMARC-trap guard (never `From:` gmail on a relay) and the Vercel-serverless-SMTP research caveat.

---

## Winning-Date Persistence & Finalize Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Additive nullable `winning_option_id` FK on polls + reuse `status` | Minimal, additive; single-statement close; mirrors Phase 2 discipline | ✓ |
| Separate `finalizations` table | Over-modeled for one winning date per poll | |
| `finalized_at` timestamp only (no winning-date FK) | Insufficient — FNL-03 email needs the chosen date | |

**Selected (recommended default):** Add nullable `winning_option_id` (uuid FK → options); reuse `status` open→closed; one `UPDATE` finalize (neon-http-safe).
**Notes:** Local migration gate + prod Neon migrate/redeploy apply.

---

## Invite Send UX & Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Admin "Invite by email" card + `sendInvites`, individual best-effort sends, copy-link fallback | MAIL-01 (not CC) + MAIL-03 graceful degradation | ✓ |
| Single bulk CC send | Leaks participant addresses; violates MAIL-01 | |
| Background queue | Vercel Queues beta; overkill for ~5-30 emails | |

**Selected (recommended default):** Individual sends (not CC), per-recipient success/failure surfaced, 429 visible; unconfigured → existing `CopyLinkButton`.
**Notes:** Synchronous in the action (micro-volume). Research must verify Vercel serverless SMTP viability; fall back to an HTTPS-API provider behind the same seam if it flakes.

---

## Confirmation Email Trigger (VOTE-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort edit-link email on submit only, when email present + provider configured | Never fails the vote; `/thanks` link is the authoritative fallback | ✓ |
| Send on every submit AND edit | Spams the participant; edits already hold the link | |
| Require email before allowing a vote | Breaks the "email optional / no account" constraint | |

**Selected (recommended default):** Fire on first submit only, best-effort, non-blocking.
**Notes:** Participant email is nullable (Phase 2); no email = no send, no error.

---

## Finalize Interaction & Notify Scope (FNL-01/02/03)

| Option | Description | Selected |
|--------|-------------|----------|
| "Book it" pre-selects computed best-day, organizer may override; confirm step; closePoll flips status + notifies voters | Reuses Phase 2 read-only path + Phase 3 best-day; one-way close for v1 | ✓ |
| Auto-finalize the best day with no organizer choice | Removes organizer control; best-day may not be the pick | |
| Allow reopen/undo | Adds state complexity; deferred to v2 | |

**Selected (recommended default):** Organizer picks (best-day default), confirm, `closePoll(adminUrlId, winningOptionId)`, finalization emails to all voters with an email.
**Notes:** Close is authoritative once the DB write commits; a mail failure never reverts it.

---

## Email Templates

| Option | Description | Selected |
|--------|-------------|----------|
| Three plain-HTML templates, no react-email dep | Keeps bundle minimal; timezone-safe date rendering | ✓ |
| react-email components | Extra dependency; unnecessary for three simple emails | |

**Selected (recommended default):** `src/lib/email/templates.ts` with invite / edit-link / finalization; dates via `formatDateWithTime`.
**Notes:** Exact markup left to the executor.

---

## Claude's Discretion

- Exact email env-var shape, template markup/copy, invite-card layout, "Book it" control placement, and whether `sendInvites` takes free-text addresses or reuses `participants` rows — bounded by the locked forks in CONTEXT.md (D-01..D-04, best-effort sends).
- UI design contract (`/gsd-ui-phase 4`) recommended before execution for the net-new invite/finalize UI.

## Deferred Ideas

- Resend + custom domain / eu.org free subdomain — optional deliverability upgrade only.
- RESP-02 "nudge non-respondents" — v2.
- Reopen/undo a finalized poll — v2.
- Rate-limiting/abuse controls on `sendInvites` — ops, not MVP.
- Organizer's own availability row (ORG-01) — v2.

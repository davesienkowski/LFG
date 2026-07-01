---
id: SEED-001
status: dormant
planted: 2026-07-01
planted_during: v1.0 milestone — after Phase 3 (Results Dashboard) completion
trigger_when: Phase 4 (Email & Finalization) — surface during discuss-phase / plan-phase 4
scope: medium
---

# SEED-001: Free, no-domain email options for Phase 4 (explore before committing to Resend + a paid domain)

## Why This Matters

Phase 4 (Email & Finalization) is currently blocked in STATE.md on the assumption that we must
buy a custom domain (~$10-12/yr) and wait ~48h for DKIM/SPF/DMARC propagation before we can send
Resend email to arbitrary participants. **That assumption is avoidable.** Research (2026) surfaced
genuinely-free, no-domain-purchase paths with acceptable deliverability for our micro-volume
(~5-30 emails per poll, a few polls/month — trivially inside *every* provider's free tier). The
deciding factors are NOT throughput; they are **(a) does it require a domain?** and **(b) does it
inbox to arbitrary recipients (not spam)?**

Keeping v1 at literally $0 (no domain) preserves the project's core "$0 to build and run"
constraint. This seed captures the options + the one deliverability trap so Phase 4 planning
starts from the right shortlist instead of defaulting to "buy a domain."

> ⚠️ Free-tier numbers below are as-of mid-2026 and **change often** — re-verify against each
> provider's live pricing/docs page (URLs included) at Phase 4 build time.

## When to Surface

**Trigger:** Phase 4 (Email & Finalization) — read this at `discuss-phase 4` / `plan-phase 4`.
Blocks the "which email provider?" gray area. Also relevant: if a domain is ever purchased for
other reasons, revisit the "do it properly" option.

## The Decision

For sending invite / edit-link-confirmation / finalization emails to friends' arbitrary inboxes,
which provider — and do we accept single-sender (no DNS) or verify a domain?

## Options (condensed — full sourced table in the research notes below)

| Option | Free tier | Domain? | Single-sender? | Deliverability to arbitrary inboxes | Notes |
|--------|-----------|---------|----------------|-------------------------------------|-------|
| **Gmail SMTP + App Password** (Nodemailer→smtp.gmail.com) | ~500 recipients/day (personal gmail) | **No** | send *as* your gmail | **Good** — Google DKIM-signs; SPF/DMARC align to gmail.com | needs 2FA + App Password; personal From address |
| **SMTP2GO** single-sender | 1,000/mo (200/day) forever-free, no card | **No** | **Yes (first-class, no DNS)** | Medium — gmail-From fails DMARC → use SMTP2GO's own From + gmail Reply-To | best "no shared gmail login" relay |
| **Brevo** | 300/day forever-free | recommended | yes | Medium (same gmail-From caveat) | "Sent with Brevo" footer unless paid |
| **Mailjet** | 200/day, 6,000/mo | recommended | yes | Medium (same caveat) | — |
| **Postmark** | 100/mo | no | yes (strict) | Medium (same caveat) | strict reputation posture |
| **Resend** *(current stack pick)* | 100/day, 3,000/mo | **Yes (no single-sender)** | **No** — `onboarding@resend.dev` only emails your own account | **Good** once domain DKIM-verified | needs a domain; the "do it properly" path |
| **Resend + free subdomain** (eu.org) | as Resend | free domain | via DNS | Good | eu.org approval is slow (days–months) — start early if chosen |
| Local dev: **Mailpit** (`docker run axllent/mailpit`) | free/local | no | n/a | n/a (captures, never sends) | SMTP :1025, UI :8025 — preferred over unmaintained MailHog |

**Ruled out / stale (do NOT design a $0 fallback around these):** SendGrid free tier **retired**
(Jul 2025); MailerSend dropped to 500/mo + credit card (Dec 2025); MailChannels free Cloudflare
Workers relay **ended** (Jun 2024); Amazon SES **no longer perpetually free** + gates arbitrary
recipients behind a manual sandbox-exit; ZeptoMail "free" is a one-time expiring credit.

## Recommendation (ranked, for THIS use case)

1. **Gmail SMTP + App Password** — the only truly-free, no-domain path with *good* deliverability,
   because mail goes through Google *as* your gmail (auth aligns, not treated as spoofed). Ideal
   for a friends-only D&D group at our volume. Tradeoffs: 2FA + App Password friction (confirm
   Google still allows App Passwords on the account); personal (unbranded) From; serverless-SMTP
   caveat (below).
2. **SMTP2GO single-sender** — 1,000/mo free, no card, no DNS; best when we don't want SMTP creds
   tied to a personal Gmail login. Catch: send from SMTP2GO's verified address (NOT `From: gmail`)
   and set gmail as Reply-To, or invites spam-folder.
3. **Resend + a real domain (~$1-12/yr)** — the "do it properly" upgrade; only path that
   *reliably* inboxes to arbitrary recipients. Free-subdomain (eu.org) keeps it $0 but approval is
   slow. Consider only if spam-foldering from options 1/2 ever bites.

## Key Gotchas (carry into Phase 4 planning)

- **The gmail-From DMARC trap (most important).** ANY third-party relay (SMTP2GO/Brevo/Mailjet/
  SES/…) sending `From: you@gmail.com` **fails DMARC alignment** → Gmail/Yahoo route to spam.
  Only two clean fixes: send via `smtp.gmail.com` itself (aligns automatically), or use a From on
  a domain you can DKIM-sign. **Never point a relay's From at a gmail address for real invites.**
- **Env-switched provider architecture (recommended).** One `sendEmail()` interface, transport
  chosen by env var (`EMAIL_PROVIDER`): Mailpit locally, chosen provider in prod — so we can swap
  Gmail↔SMTP2GO↔Resend without touching the three email types (invite, edit-link, finalization).
  Matches the CLAUDE.md "env-switched email service" plan.
- **Vercel serverless + SMTP (verify at Phase 4).** Outbound SMTP (587/465) generally works on
  Vercel functions, but connections can't pool across invocations and long SMTP handshakes eat
  into the Hobby ~10s limit; HTTPS-API providers (Resend API, SMTP2GO API, Brevo API) are more
  robust on serverless than raw SMTP. If Gmail-SMTP flakes on Vercel, fall back to an API provider.
  *(This point was flagged unverified in research — check current Vercel docs.)*
- **Single-sender vs domain verification is the real fork:** single-sender = zero DNS, instant,
  weaker alignment; domain = DNS + propagation, proper DKIM, best inbox placement.

## Breadcrumbs

- `.planning/STATE.md` → Blockers/Concerns: the "Phase 4 email needs research / ~$10-12/yr domain"
  note this seed answers.
- `.planning/ROADMAP.md` → Phase 4 (Email & Finalization): VOTE-04, MAIL-01..03, FNL-01..03; plan
  04-01 already envisions an "env-switched email service (Resend / Nodemailer+MailHog)".
- `.claude/CLAUDE.md` → Email stack table (Resend) + "Alternatives Considered" (Nodemailer+Gmail
  SMTP was dismissed there — this seed argues it's actually the best $0 path at our volume).
- Full sourced research (comparison table + all provider URLs + rationale) lives in this
  conversation's research agent output (2026-07-01).

## Notes

Captured after Phase 3 shipped. The actionable Phase-4 takeaway: **default the plan to
Gmail-SMTP-via-App-Password for $0 prod sending (Mailpit for local), keep the provider behind an
env-switched `sendEmail()` seam, and treat "buy a domain + Resend" as an optional deliverability
upgrade — not a prerequisite.** Re-verify all free-tier numbers at build time.

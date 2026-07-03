---
created: 2026-07-03T03:15:48.885Z
title: Email admin link to creator on poll creation
area: general
files:
  - src/lib/actions/create-poll.ts
  - src/components/poll-create-form.tsx
---

## Problem

When a poll is created, the admin link (`/a/[adminUrlId]`) is only shown on-screen
once. If the creator loses that page, they lose control of their poll — there's no
recovery path (three-token model, nothing is derivable). The creator should receive
an email on creation containing the admin link so they can save it.

## Solution

TBD. Add an optional creator-email field to the create-poll form and, when provided,
send the admin link via the existing env-switched `sendEmail()` seam (best-effort,
non-blocking via `after()` — same pattern as the Phase 04 invite/confirmation sends).
Considerations:
- Email is optional per D-02 — a poll must still be creatable with no email config
  and no creator address; only send when an address is given.
- Treat the admin link as a secret: don't log it, don't CC, mind header injection
  (reuse Phase 04 email hardening).
- Copy should stress "save this link — it's the only way to manage/close the poll."
Candidate for Phase 06 (or a standalone quick task, since it reuses the existing
email seam).

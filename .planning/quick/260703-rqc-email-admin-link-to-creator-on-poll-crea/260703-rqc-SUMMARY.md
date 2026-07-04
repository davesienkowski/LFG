---
task: 260703-rqc
title: Email admin link to creator on poll creation
status: complete
commit: 62a2c0f
date: 2026-07-03
files_created: []
files_modified:
  - src/lib/actions/create-poll.ts
  - src/lib/actions/create-poll.test.ts
  - src/lib/email/templates.ts
  - src/lib/email/templates.test.ts
  - src/components/poll-create-form.tsx
---

# Quick Task 260703-rqc: Email admin link to creator on poll creation — Summary

**One-liner:** On poll creation, an optional `creatorEmail` field best-effort emails the `/a/<adminUrlId>` admin recovery link to the creator via the existing env-switched `sendEmail()` seam using `after()` — fully optional (D-02), never persisted, scheduled exactly once on the success path.

## What was built

- **`renderCreatorAdminLinkEmail({ title, adminUrl })`** — new template built on the shared `renderShell`. Heading `Manage your poll: <title>`, save-this-link/don't-share body copy, CTA `Manage my poll` → `adminUrl`. Annotated as the SOLE deliberate T-04-02 exception (recipient is the creator, receiving a copy of their own credential — not a participant), so the participant-facing no-admin-URL discipline stays intact.
- **`createPoll` extended** — optional `creatorEmail` added to `CreatePollSchema` (verbatim shape of submit-response's `email`: `max(200)` before `.email()`, `.optional()`), read as `formData.get("creatorEmail") || undefined`. Not added to the `polls` insert values (no DB column, no migration). Best-effort `after()` send added AFTER the options insert and BEFORE `redirect()`, guarded by `if (creatorEmail)`, positioned OUTSIDE the token-mint retry loop so it fires exactly once. Base URL captured in-request via `headers()` before `after()`; send result intentionally ignored. New imports: `headers`, `after`, `resolveBaseUrl`/`buildAdminUrl`, `sendEmail`, `renderCreatorAdminLinkEmail`.
- **Create form** — optional `<Input name="creatorEmail" type="email" maxLength={200}>` mirroring the Location field, with `Email me the admin link (optional)` label, save-the-link helper copy (no "share it" wording), and a wired `FieldError`. Not required — empty submit is unaffected.

## Tests

- **templates.test.ts** — new `describe("renderCreatorAdminLinkEmail")`: asserts the HTML contains the admin URL, the `Manage your poll:` heading, and the `Manage my poll` CTA. The existing three-template T-04-02 no-leak block is unmodified.
- **create-poll.test.ts** — added `next/headers`, `next/server` (after), and `@/lib/email/send` mocks (inert for pre-existing tests via the `if (creatorEmail)` guard) plus `sendEmailMock.mockClear()` in `beforeEach`, and three cases:
  1. Valid `creatorEmail` → poll created, redirect fires, `sendEmail` called once with `to`, subject containing the title, and html containing `/a/<adminUrlId>`.
  2. No `creatorEmail` (D-02) → poll created, microtasks flushed first, `sendEmail` NOT called.
  3. Malformed `creatorEmail` → `errors.creatorEmail[0] === "Enter a valid email address"`, no redirect, poll count unchanged, no send.

## Verification (actual output)

- `DATABASE_URL=... npm test -- templates.test.ts create-poll.test.ts` → **23 passed** (templates 8, create-poll 15).
- Full suite `DATABASE_URL=... npm test` → **Test Files 21 passed (21), Tests 186 passed (186)**.
- `npm run lint -- src/components/poll-create-form.tsx` → **No issues found**.
- `DATABASE_URL=... npm run build` → **Compiled successfully, TypeScript finished, static pages generated** (green). D-02 sanity holds: build + suite green with no EMAIL_PROVIDER / SMTP / RESEND vars set (submit-response suite asserts `process.env.EMAIL_PROVIDER` undefined and passes).

## Deviations from Plan

None — plan executed exactly as written. No new packages installed. No schema/migration change. Single atomic commit (`62a2c0f`); no deployment.

## Self-Check: PASSED

- Files present: create-poll.ts, create-poll.test.ts, templates.ts, templates.test.ts, poll-create-form.tsx — all FOUND.
- Commit `62a2c0f` FOUND in git log.

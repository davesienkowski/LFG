---
phase: quick-260703-rqc
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/actions/create-poll.ts
  - src/lib/actions/create-poll.test.ts
  - src/lib/email/templates.ts
  - src/lib/email/templates.test.ts
  - src/components/poll-create-form.tsx
autonomous: true
requirements:
  - "260703-rqc: optionally email the admin link to the poll creator on creation (D-02 email stays fully optional)"

must_haves:
  truths:
    - "The create-poll form shows an optional 'Email me the admin link' field mirroring the Location field."
    - "Submitting with a valid creator email creates the poll AND best-effort emails the /a/ admin link to that address via the existing sendEmail() seam."
    - "Submitting with NO creator email — and with EMAIL_PROVIDER unset — creates the poll exactly as today (D-02): build + full test suite green, no send attempted."
    - "A non-empty but malformed creator email blocks creation with a creatorEmail field error; no poll row is created (consistent with the other field-error behaviour)."
    - "The creator email is never written to the database — no schema change, no column, no migration; it is used only to address the one email, then discarded."
    - "The best-effort send is scheduled exactly once on the success path — never inside the token-retry loop, never on a validation reject."
  artifacts:
    - path: "src/lib/actions/create-poll.ts"
      provides: "creatorEmail schema field + best-effort after() admin-link send before redirect"
      contains: "creatorEmail"
    - path: "src/lib/email/templates.ts"
      provides: "renderCreatorAdminLinkEmail — the sole template that legitimately carries an /a/ admin URL"
      exports: ["renderCreatorAdminLinkEmail"]
    - path: "src/components/poll-create-form.tsx"
      provides: "optional creatorEmail Input wired to errors.creatorEmail"
      contains: "creatorEmail"
    - path: "src/lib/email/templates.test.ts"
      provides: "unit test for renderCreatorAdminLinkEmail (admin URL present + save-this-link copy)"
    - path: "src/lib/actions/create-poll.test.ts"
      provides: "extended action tests: valid email schedules send / empty email no send (D-02) / malformed email field error + no poll"
  key_links:
    - from: "src/lib/actions/create-poll.ts"
      to: "sendEmail"
      via: "after() best-effort send, result ignored, scheduled BEFORE redirect()"
      pattern: "after\\(async"
    - from: "src/lib/actions/create-poll.ts"
      to: "buildAdminUrl"
      via: "adminUrl = buildAdminUrl(base, adminUrlId)"
      pattern: "buildAdminUrl"
    - from: "src/lib/actions/create-poll.ts"
      to: "renderCreatorAdminLinkEmail"
      via: "html payload for the creator send"
      pattern: "renderCreatorAdminLinkEmail"
    - from: "src/components/poll-create-form.tsx"
      to: "errors.creatorEmail"
      via: "FieldError wiring for the new input"
      pattern: "creatorEmail"
---

<objective>
On poll creation, optionally email the ADMIN link (`/a/<adminUrlId>`) to the creator so they can recover management access if they lose the on-screen admin page. Add an optional `creatorEmail` field to the create form; when a valid address is supplied, send the admin link best-effort through the existing env-switched `sendEmail()` seam using `after()` — the same non-blocking pattern Phase 04 uses for the vote-confirmation email (submit-response.ts).

Purpose: The admin link is the ONLY way to manage or close a poll. Today it exists solely on the post-create screen; if the creator loses that tab, management access is gone. Emailing it (opt-in) provides a recovery channel.

Output: One optional form field, one new email template, a best-effort send hooked into createPoll before the redirect, and tests. Email stays FULLY optional (D-02): a poll must still be creatable with no email config and no creator address. The creator email is transient — never persisted (no migration).
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# The action to extend — currently ends with redirect(`/a/${adminUrlId}`); NO after/headers/email import today.
@src/lib/actions/create-poll.ts
# REFERENCE — the exact after()+headers()+sendEmail best-effort pattern to MIRROR (the `if (email && mintedEditToken)` block near the end).
@src/lib/actions/submit-response.ts
# The single env-switched transport: sendEmail({ to, subject, html }) -> SendResult; PROVIDER defaults to "none" (D-02 no-op).
@src/lib/email/send.ts
# Templates: add a render function mirroring renderConfirmationEmail + renderShell.
@src/lib/email/templates.ts
# URL helpers: resolveBaseUrl(host, proto) + buildAdminUrl(base, adminUrlId).
@src/lib/urls.ts
# The form — add the optional creator-email Input mirroring the Location field.
@src/components/poll-create-form.tsx
# REFERENCE test-mock pattern for after()/headers()/sendEmail (Task 2 mirrors this): src/lib/actions/submit-response.test.ts lines 13-49.
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add renderCreatorAdminLinkEmail template + unit test</name>
  <files>src/lib/email/templates.ts, src/lib/email/templates.test.ts</files>
  <behavior>
    - renderCreatorAdminLinkEmail({ title, adminUrl }) returns a full HTML document built via the shared renderShell.
    - The returned HTML CONTAINS the passed adminUrl verbatim (this is the ONE template that legitimately carries an /a/ admin URL — the creator is the recipient, not a participant).
    - Heading reads "Manage your poll: <title>".
    - Body copy STRESSES that this link is the only way to manage or close the poll and must be saved and NOT shared (anyone with it can manage the poll).
    - CTA button label is "Manage my poll" and points at adminUrl.
  </behavior>
  <action>
Add a new exported render function `renderCreatorAdminLinkEmail({ title, adminUrl }: { title: string; adminUrl: string })` to src/lib/email/templates.ts, immediately after renderConfirmationEmail. Build it with the existing renderShell (do not hand-roll a second shell): heading `Manage your poll: ${title}`; bodyText copy that stresses "Save this link — it's the only way to manage or close your poll. Don't share it; anyone with this link can manage your poll."; ctaUrl `adminUrl`; ctaLabel `Manage my poll`. Leave showButton at its default (true).

CRITICAL — annotate the deliberate exception: add a short comment on this function noting it is the SOLE template that legitimately accepts and emits an `/a/` admin URL, and WHY — the recipient is the poll creator themselves (a recovery channel for their own credential), which is a different recipient from renderInviteEmail/renderConfirmationEmail/renderFinalizationEmail, all of which forbid admin URLs per T-04-02. This keeps the existing "no admin URL in participant mail" discipline intact and explains the intentional divergence to the next reader.

In src/lib/email/templates.test.ts, add a `describe("renderCreatorAdminLinkEmail")` block mirroring the existing renderConfirmationEmail test: import the new function, define an ADMIN_URL constant like `"https://lfg.example/a/admin-token-abc"`, and assert the HTML contains ADMIN_URL, contains the heading `Manage your poll:`, and contains the CTA label `Manage my poll`. Do NOT add this function to the existing `describe("no admin-path leakage (T-04-02)")` block — that negative test is specifically about the participant-facing templates and must stay unchanged.
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test -- src/lib/email/templates.test.ts</automated>
  </verify>
  <done>renderCreatorAdminLinkEmail is exported from templates.ts, carries the annotated T-04-02-exception comment, and its unit test passes (admin URL + heading + CTA present). The existing three-template no-leak test is unmodified and still green.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Extend createPoll — optional creatorEmail schema + best-effort admin-link send</name>
  <files>src/lib/actions/create-poll.ts, src/lib/actions/create-poll.test.ts</files>
  <behavior>
    - Valid creatorEmail on an otherwise-valid submit: poll + options are still inserted, redirect to /a/<adminUrlId> still fires, AND sendEmail is scheduled (via after()) with to=creatorEmail and an html payload containing the /a/<adminUrlId> admin path.
    - No creatorEmail (empty or absent): poll is created exactly as before and sendEmail is NEVER called — this is the D-02 guarantee with EMAIL_PROVIDER unset.
    - Non-empty malformed creatorEmail: returns a creatorEmail field error, NO redirect, and NO poll row is created (mirrors the other field-error behaviour).
    - creatorEmail is never persisted — the polls insert values are unchanged (title, description, location, participantUrlId, adminUrlId only).
    - The send is scheduled at most once per successful creation — never per token-retry attempt.
  </behavior>
  <action>
Extend src/lib/actions/create-poll.ts. Mirror submit-response.ts exactly for the optional-email plumbing.

Schema: add `creatorEmail` to CreatePollSchema, copying the shape of submit-response.ts's `email` field VERBATIM — `z.string().max(200, "Email must be 200 characters or fewer").email("Enter a valid email address").optional()` (max before email so an over-length string surfaces the length message). Read it in the `raw` object as `creatorEmail: formData.get("creatorEmail") || undefined` — the `|| undefined` makes an empty string "not provided" so an untouched field never errors and never sends; a non-empty malformed value stays a string and fails `.email()`, surfacing a `creatorEmail` field error via the existing flatten() path (no extra handling needed — flatten surfaces top-level fields directly, unlike the `dates` array which needed the special lift). Destructure `creatorEmail` out of `parsed.data` alongside title/description/location/dates. Do NOT trim creatorEmail — submit-response's email field is not trimmed, so a whitespace-only value staying a field error is the consistent, intended behaviour.

Do NOT touch the `polls` insert values — creatorEmail must NOT be added there. There is no DB column and no migration; the address is used only to address the one email, then discarded.

Send: after the options insert and BEFORE `redirect(\`/a/${adminUrlId}\`)`, add a best-effort block guarded by `if (creatorEmail) { ... }`. Mirror submit-response.ts's confirmation block: capture the base URL INSIDE the request first — `const h = await headers(); const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));` — then `after(async () => { const adminUrl = buildAdminUrl(base, adminUrlId); await sendEmail({ to: creatorEmail, subject: \`Manage your poll: ${title}\`, html: renderCreatorAdminLinkEmail({ title, adminUrl }) }); });`. The send result is intentionally IGNORED — a failure must never surface past after() or affect the already-issued redirect (D-02 / mirrors D-07). adminUrlId is already in scope (declared before the token-mint loop). Add a comment: with EMAIL_PROVIDER unset the after() callback still runs but sendEmail no-ops safely, so creation is unaffected (D-02 preserved), and the admin link is a secret so it is never logged and the result is never surfaced.

EDGE (prohibition-probe): the send block MUST live OUTSIDE the token-mint retry `for` loop, positioned after the options insert. This schedules the send EXACTLY ONCE on the true success path. Do NOT move it inside the loop (that would double-send on a token-collision retry) and do NOT place it before the options insert (the poll is not fully created yet). It is only reachable after validation passed and both inserts succeeded — a validation reject `return`s earlier and never sends; a failed insert throws and never sends.

Add the imports create-poll.ts does not have yet: `headers` from `next/headers`, `after` from `next/server`, `resolveBaseUrl` + `buildAdminUrl` from `@/lib/urls`, `sendEmail` from `@/lib/email/send`, `renderCreatorAdminLinkEmail` from `@/lib/email/templates`. Keep the two-separate-generateToken() invariant and the redirect-at-end structure exactly as today — only ADD the after()-scheduling before the redirect.

Tests — extend src/lib/actions/create-poll.test.ts (do NOT rewrite existing tests). Add the mocks createPoll now needs, copying them from submit-response.test.ts lines 13-49 (the existing `vi.mock("next/navigation", ...)` is already present — leave it): ADD `vi.mock("next/headers", () => ({ headers: async () => ({ get: (name) => name === "host" ? "localhost:3000" : name === "x-forwarded-proto" ? "http" : null }) }))`, ADD `vi.mock("next/server", () => ({ after: (cb) => { void Promise.resolve().then(cb).catch(() => {}); } }))`, and ADD `vi.mock("@/lib/email/send", () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }))`. Import the mocked sendEmail so you can assert on it; reset its call history in a beforeEach (or at the start of each new test). These mocks are inert for the existing success tests because none pass creatorEmail (the `if (creatorEmail)` guard skips headers()/after()).

Add three new `it` cases in the success/validation describes:
  1. Valid creatorEmail: run a valid submit with `creatorEmail: "creator@example.com"`, capture the adminUrlId from the redirect (reuse adminIdFromRedirect), flush the after() microtask with `await new Promise((r) => setTimeout(r, 0))`, then assert the poll was created (loadCreated) AND the sendEmail mock was called once with `to: "creator@example.com"` and an `html` string containing `/a/${adminUrlId}` and a `subject` containing the title.
  2. No creatorEmail (D-02): run a valid submit WITHOUT creatorEmail, flush microtasks with `await new Promise((r) => setTimeout(r, 0))` FIRST (so an accidental scheduled send would have run before the assertion — no false green), then assert the poll was created AND the sendEmail mock was NOT called.
  3. Malformed creatorEmail: run a submit with `creatorEmail: "not-an-email"`, assert `state?.errors?.creatorEmail?.[0]` is `"Enter a valid email address"`, assert redirectUrl is null, assert pollCount is unchanged, and assert sendEmail was NOT called.
  </action>
  <verify>
    <automated>DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test -- src/lib/actions/create-poll.test.ts</automated>
  </verify>
  <done>createPoll accepts an optional creatorEmail, schedules a best-effort admin-link send via after() (once, outside the retry loop) before redirect when it is a valid address, no-ops safely when absent, and rejects a malformed non-empty value with a creatorEmail field error and no poll row. creatorEmail is not in the polls insert values (no persistence). All three new tests plus every pre-existing create-poll test pass.</done>
</task>

<task type="auto">
  <name>Task 3: Add the optional creator-email field to the create form</name>
  <files>src/components/poll-create-form.tsx</files>
  <action>
Add an optional creator-email Input to src/components/poll-create-form.tsx, mirroring the existing Location field block (lines ~104-118), placed inside the same `flex flex-col gap-4` group (after Location is a natural spot). Add `const creatorEmailId = useId();` and `const creatorEmailErrorId = \`${creatorEmailId}-error\`;` alongside the other id hooks. Render a `<div className="flex flex-col gap-2">` containing:
  - A `<Label htmlFor={creatorEmailId}>Email me the admin link (optional)</Label>`.
  - An `<Input id={creatorEmailId} name="creatorEmail" type="email" maxLength={200} placeholder="you@example.com" disabled={isPending} aria-describedby={errors.creatorEmail ? creatorEmailErrorId : undefined} aria-invalid={errors.creatorEmail ? true : undefined} />` — note `name="creatorEmail"` MUST match the server action's `formData.get("creatorEmail")`.
  - Helper text (a `<p className="text-muted-foreground text-sm">`) that stresses saving the link matters: e.g. "This link is the only way to manage or close your poll — we'll email you a copy so you don't lose it." Do NOT tell the user to share it.
  - A `<FieldError id={creatorEmailErrorId} messages={errors.creatorEmail} />`.

Keep the field OPTIONAL — no `required` attribute; an empty field must submit and create the poll unchanged (D-02). Do not alter the dates block, the sticky submit footer, or any other field.
  </action>
  <verify>
    <automated>npm run lint -- src/components/poll-create-form.tsx</automated>
  </verify>
  <done>The form renders an optional "Email me the admin link (optional)" input named creatorEmail with save-the-link helper copy and a wired FieldError, mirroring the Location field. Lint is clean; the field is not required and an empty submit is unaffected.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| creator browser → createPoll server action | `creatorEmail` is untrusted form input crossing here; validated by Zod before any use. |
| server → email transport (sendEmail) | The `/a/` admin secret intentionally leaves the system to the creator's own inbox — a recovery channel, not a leak. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rqc-01 | Information disclosure | admin link (`/a/<id>`) in email + logs | mitigate | The admin link is a bearer secret. It is emailed ONLY to the creator-supplied address; the after() send result is intentionally ignored and never logged/surfaced. No console output of the URL or address. |
| T-rqc-02 | Tampering | email `subject` / `to` header construction | mitigate | No raw header construction here — sendEmail() routes through nodemailer/Resend structured send (strips CR/LF, T-04-01). `to` is a single Zod-validated `.email()` string; `subject` uses the poll title, already length-capped ≤200 by the title schema. Same posture as Phase 04 sends. |
| T-rqc-03 | Information disclosure | admin URL reaching a participant template | accept | renderCreatorAdminLinkEmail is the SOLE template that accepts an `/a/` URL, by design (recipient is the creator). The existing T-04-02 no-leak test for the three participant templates stays unchanged and green, preserving the "no admin URL in participant mail" discipline. |
| T-rqc-04 | Denial of service | best-effort send failure blocking creation | mitigate | Send is scheduled via after() AFTER the DB writes and BEFORE redirect; result ignored. A transport error (or EMAIL_PROVIDER=none) can never fail or delay poll creation (D-02). |
| T-rqc-05 | Elevation of privilege | duplicate admin-link send on token-retry | mitigate | Send site is OUTSIDE the token-mint retry loop, reached once per successful creation — never per attempt, never on a validation reject. Covered by the "exactly once" must_have + Task 2 EDGE note. |

Package legitimacy: NO new packages installed (zod, next, nodemailer, resend, and the URL/email seams already exist). The package-manager install gate does not apply.
</threat_model>

<verification>
Run once at the end, after all three tasks, from the repo root:
- Full suite green: `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test`
- Production build green (type-checks the form ↔ action contract): `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm run build`

D-02 sanity: the build and full suite must be green WITHOUT any EMAIL_PROVIDER / SMTP / RESEND env vars set — proving a poll is still creatable with zero email config and no creator address.
</verification>

<success_criteria>
- [ ] Optional `creatorEmail` field renders on the create form, named `creatorEmail`, not required, with save-the-link helper copy and a wired FieldError.
- [ ] A valid creatorEmail on an otherwise-valid submit still creates the poll, still redirects to `/a/<adminUrlId>`, and best-effort emails the admin link to that address via after() + sendEmail.
- [ ] With no creatorEmail and EMAIL_PROVIDER unset, poll creation is byte-for-byte unchanged (D-02): full suite + build green, no send attempted.
- [ ] A non-empty malformed creatorEmail returns a `creatorEmail` field error, creates no poll, and sends nothing.
- [ ] creatorEmail is never persisted (polls insert values unchanged; no schema/migration change).
- [ ] The best-effort send is scheduled exactly once, outside the token-retry loop, only on the success path.
- [ ] renderCreatorAdminLinkEmail exists with the annotated T-04-02-exception comment; the participant-template no-leak test is unchanged and green.
- [ ] Two-separate-token invariant and redirect-at-end structure preserved.
- [ ] `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm test` green (full suite).
- [ ] `DATABASE_URL="postgres://postgres:password@localhost:5432/lfg" npm run build` green.
- [ ] Single atomic commit. No deployment in-plan. No migration.
</success_criteria>

<output>
Create `.planning/quick/260703-rqc-email-admin-link-to-creator-on-poll-crea/260703-rqc-SUMMARY.md` when done.
</output>

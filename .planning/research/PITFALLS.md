# Pitfalls Research

**Domain:** Free-tier group availability scheduling web app (Doodle Group Poll clone)
**Researched:** 2026-06-30
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Sending Email From the Default Resend Test Address in Production

**What goes wrong:**
Invitations are sent from `onboarding@resend.dev` (Resend's shared test domain) because custom domain verification was skipped or deferred. Gmail, Outlook, and most corporate spam filters treat mail from shared dev domains as bulk/spam and route it to the junk folder. Participants never see the invite, mark a poll as abandoned, and the organizer has no feedback that anything failed.

**Why it happens:**
Resend lets you call the API immediately with the default address — it works during development. Teams ship to production without realising the address switch is mandatory, not optional.

**How to avoid:**
- Register and verify a custom domain with Resend before any real participant gets an invite. This requires adding DNS records: a CNAME for DKIM, a TXT for SPF, and a TXT for DMARC. Resend's dashboard walks through each record.
- Set `DMARC` policy to `p=none` initially (monitoring only) while warming up, then move to `p=quarantine` once delivery rates look healthy.
- Add DMARC because Gmail and Yahoo have required it for bulk senders since February 2024. Without it, deliverability degrades regardless of SPF/DKIM.
- Keep the poll participant link URL on the same domain as the sending domain. Links pointing to a different domain than the envelope sender trigger spam heuristics.
- Budget for a cheap domain ($10-12/year) — this is the only unavoidable cost for the email feature.

**Warning signs:**
- Emails sent from `@resend.dev` address during any test
- No DMARC record in DNS (`dig TXT _dmarc.yourdomain.com` returns nothing)
- Resend dashboard shows "Delivered" but participants report not receiving mail (means delivered to spam)
- Resend Deliverability Insights tab shows bounces or spam complaints above 0.08%

**Phase to address:**
Email integration phase. Verify domain DNS before writing any invite-sending code, not after. The DNS propagation delay (up to 48 hours) means you cannot test real delivery at the end of a sprint — set up DNS at the start.

---

### Pitfall 2: Hitting Resend's 100 Emails/Day Free Limit Mid-Poll

**What goes wrong:**
A poll with 12 invitees, plus one reminder, plus a "date chosen" notification = 25+ sends per poll. A few concurrent polls in a day exhaust the 100/day free limit. The API returns a `429` error, subsequent emails silently fail, and participants never receive their links.

**Why it happens:**
The 100/day limit applies to all emails combined, and CC/BCC each count as a separate email. Developers test with 1-2 recipients and do not model the real usage pattern.

**How to avoid:**
- Count email sends carefully: one invite per participant per poll. Do not CC everyone on one email (each recipient counts separately).
- Handle `429` responses explicitly in the email service layer — surface them as a visible error to the organiser ("Email limit reached for today") rather than swallowing silently.
- For the initial MVP with a single D&D group (~5-8 people), the 100/day limit is fine. Avoid adding automated reminders or notification blasts unless you track the daily total.
- If the app ever grows beyond one group, implement a send queue with a daily counter checked before enqueuing.

**Warning signs:**
- Resend API returning HTTP 429
- Send count in Resend dashboard reaching 80+ in a day
- Polls with more than 10 participants or multiple active polls at once

**Phase to address:**
Email integration phase. Implement 429 error handling and expose it to the organiser UI at the same time as the happy path.

---

### Pitfall 3: Guessable or Sequential Poll IDs Enabling Enumeration

**What goes wrong:**
If poll IDs are sequential integers (`/poll/1`, `/poll/2`, ...) or short predictable strings, anyone can enumerate all polls by incrementing the ID. They can view participant names, email addresses, and availability data for polls they were never invited to. The admin/management link is even more sensitive — if it is derived predictably from the participant link (e.g., same ID with `/admin` suffix), the organiser loses exclusive control.

**Why it happens:**
Database auto-increment IDs are the default in most ORMs and are used directly as URL parameters without a second thought. The error feels low-stakes on a hobby project but leaks all participant PII.

**How to avoid:**
- Use a cryptographically random ID with enough entropy to make enumeration infeasible. UUID v4 (36 chars, 122 bits of entropy) or CUID2 are both appropriate. NanoID with 21 characters (~126 bits) is also acceptable.
- Never use auto-increment integers or ULIDs (which are time-ordered and partially predictable) as public poll identifiers.
- Generate the admin/management link as a completely separate token — not derived from the participant link. Store both tokens in the database. The admin token should be the only thing granting result-edit and poll-close access.
- Consider adding rate-limiting on the poll lookup endpoint (e.g., max 60 requests/minute per IP) as a defence-in-depth measure even with UUIDs.

**Warning signs:**
- Using `id: serial` or `id: integer` primary keys exposed directly in URLs
- Admin link URL that is a simple transformation of the participant link (e.g., append `?admin=true`)
- No 404 response on non-existent poll IDs (leaks existence vs. non-existence)

**Phase to address:**
Data model / schema phase (very first implementation). Fixing this after launch requires changing all existing poll URLs, breaking links already shared.

---

### Pitfall 4: Participant Response Tampering (Missing Ownership Check)

**What goes wrong:**
A participant submits their availability. Because there are no accounts, their "edit link" is a URL containing some token. If the API endpoint that updates a response does not verify that the token matches *this specific participant's* record, any participant who knows another participant's name or ID can overwrite their response. Alternatively, if "edit your response" is implemented by looking up by participant name (a string), two participants with the same name will collide.

**Why it happens:**
When building the happy path first, the edit endpoint is written as "find participant by poll ID + name, update their row." The ownership verification step is added later (or forgotten). Participant name collisions are discovered only in production.

**How to avoid:**
- Issue each participant a unique edit token (UUID v4, stored in the database) when they first submit a response. Include this token in the "return to edit" link.
- The edit endpoint must accept `(pollId, participantToken)` and verify that the token matches exactly one participant row before performing any update.
- Never use participant name as a lookup key for edits — names collide.
- Store the edit token in browser `localStorage` keyed by poll ID so participants can return from the same browser without needing the link again.

**Warning signs:**
- Edit endpoint that accepts `participantId` as a plain integer in the URL with no other auth check
- Participant lookup by name string rather than token
- No `403` response when a mismatched token is supplied

**Phase to address:**
Response submission phase. Build the ownership check into the first working version of the edit endpoint, not as a follow-up.

---

### Pitfall 5: SQLite Locally, Postgres in Production — Silent Behaviour Differences

**What goes wrong:**
Using SQLite for local development and Postgres on Neon/Supabase in production introduces subtle but serious incompatibilities: SQLite is case-insensitive for string comparisons by default while Postgres is case-sensitive; SQLite has no `TRUNCATE` (use `DELETE FROM`); SQLite's boolean storage differs; SQLite does not enforce foreign key constraints unless `PRAGMA foreign_keys = ON` is set. Migrations that run cleanly locally fail in production. Data that looks correct locally is queried incorrectly in production.

**Why it happens:**
SQLite is zero-infrastructure for local development — no Docker, no cloud account needed. The appeal is real, but the divergence is also real and often only surfaces in production.

**How to avoid:**
- Use the same database engine in all environments. Run Postgres locally via Docker (`docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16`) or use Neon's free tier for both local development and production (with a separate branch for dev vs. prod).
- If the project uses an ORM (Drizzle, Prisma), do not switch adapter between environments — run the same adapter everywhere.
- Never write raw SQL that SQLite handles but Postgres would reject. If SQLite is used at all (e.g., for CI speed), add a Postgres CI test that runs the same migration suite.

**Warning signs:**
- Two database adapter configurations in the codebase (one for test/dev, one for prod)
- Boolean columns stored as `0/1` integers in the schema file
- Migration comments noting "skip this for SQLite"
- Any `PRAGMA` statement in migration files

**Phase to address:**
Project setup phase (before any schema is written). Establishing the local database environment is the first infrastructure decision and hardest to change later.

---

### Pitfall 6: Neon Free Tier Auto-Suspend Causing Cold-Start Latency

**What goes wrong:**
Neon's free tier mandates scale-to-zero: the compute suspends after 5 minutes of inactivity and cannot be disabled. On the first request after a sleep period, Postgres takes 1-3 seconds to resume, adding that latency to the user's page load. For a scheduling app that sees sporadic use (a D&D group schedules every few weeks), nearly every real user interaction will hit a cold compute.

**Why it happens:**
Developers test the app under continuous load during development and never observe the cold start. Real usage has gaps of hours or days.

**How to avoid:**
- Use Neon's pooled connection string (not the direct connection string) for all application queries. The pooler (PgBouncer) stays warm even when the compute is suspended, reducing reconnection overhead.
- Accept the cold start as a known behaviour and handle it gracefully: ensure connection timeout in the app is set to at least 10 seconds, not the default 5 seconds, so the first post-suspend request does not time out.
- For the poll results page (which is the most frequently accessed view), consider server-side caching of the rendered result for 30-60 seconds so repeat loads within a burst do not each pay the wake-up cost.
- Do not use keep-alive health-check pings to prevent suspension on the free tier — this burns the 100 CU-hour/month limit on idle activity and defeats the purpose of the free tier.

**Warning signs:**
- Database connection timeout errors that appear intermittently, not consistently
- Latency spikes on the first request after >5 minutes of inactivity
- Direct connection string (ending in `.neon.tech`) used for application queries rather than the pooled string (ending in `-pooler.neon.tech`)

**Phase to address:**
Database integration phase. Set the correct connection string and timeout values before any endpoint is tested end-to-end.

---

### Pitfall 7: Vercel Hobby Cron Severely Limited (Once Per Day, 10-Second Execution)

**What goes wrong:**
If the app needs any scheduled work — sending reminder emails, cleaning up expired polls, computing "best day" summaries — Vercel Hobby cron jobs run at most once per day, execute for a maximum of 10 seconds, run in UTC only, and are not retried on failure. An hourly reminder or a "poll closes in 24 hours" nudge is simply not possible on the Hobby plan without a third-party scheduler.

**Why it happens:**
Developers plan a "send reminders 24 hours before poll deadline" feature, implement it as a cron job, and only discover the once-per-day limit on first deployment.

**How to avoid:**
- For v1, avoid any feature that requires sub-daily scheduling. Reminder emails and deadline nudges are nice-to-have, not MVP requirements.
- If reminders are added later, trigger them lazily: when the organiser visits the poll dashboard, check whether any reminder is due and send it then (request-time side effect), rather than relying on a cron.
- Alternatively, use a free external scheduler (Upstash QStash free tier, GitHub Actions schedule) to call a Vercel API endpoint on a finer-grained schedule.
- The 10-second execution limit means a single cron run cannot process more than a handful of polls. Design any cleanup job to be idempotent and page through records in small batches across multiple daily runs.

**Warning signs:**
- `vercel.json` cron expression with `*/15 * * *` (every 15 minutes) — this fails silently during deployment on Hobby
- Reminder feature in the PRD with a defined SLA of "send X hours before deadline"
- Any cron job that queries all polls in a single pass

**Phase to address:**
Scheduling/notification phase (if built). Flag this constraint explicitly in the phase so it informs feature scope.

---

### Pitfall 8: Date Storage Without Timezone Context

**What goes wrong:**
The organiser creates a poll with candidate dates like "Saturday July 12." The app stores these as `DATE` columns (no time, no timezone). If any participant is in a different timezone — even one timezone west — they may see the date render as Friday July 11 because the JavaScript `Date` constructor interprets bare ISO date strings (`"2025-07-12"`) as UTC midnight, which underflows into the previous calendar day in any negative-offset timezone.

Conversely, if the app adds time slots (e.g., "7 PM on Saturday July 12"), storing a naive `DATETIME` without a timezone identifier means the UTC offset is lost and the displayed time is wrong for participants not in the organiser's timezone.

**Why it happens:**
For a single-group app where everyone is co-located, timezone bugs seem irrelevant. But `new Date("2025-07-12")` in a browser set to `America/New_York` (UTC-4) returns `"Fri Jul 11 2025 20:00:00 GMT-0400"` — one day early. This is a well-known JavaScript footgun that catches even experienced developers.

**How to avoid:**
- Store candidate dates as `DATE` (not `TIMESTAMP`) in Postgres when the poll only asks "which day" (no time component). Display dates by parsing the `YYYY-MM-DD` string directly, never via `new Date("YYYY-MM-DD")`. Use a library like `date-fns` `parseISO` with `formatDate` that treats date-only strings as local calendar dates, not UTC instants.
- If time slots are added, store as `TIMESTAMPTZ` in UTC plus a separate `timezone` field (IANA identifier, e.g., `"America/Chicago"`) so the organiser's local time can be reconstructed and displayed correctly to all participants.
- Never store bare numeric offsets like `"-05:00"` — they break at DST transitions.

**Warning signs:**
- Date columns typed as `TEXT` or `VARCHAR` containing `YYYY-MM-DD` strings
- `new Date(dateString)` calls in frontend code without a `T00:00:00` suffix or a date-only parsing function
- Dates displaying as one day off in any timezone test

**Phase to address:**
Data model phase. Fix the storage type before any date display code is written — retrofitting timezone-correct handling through existing date columns is error-prone.

---

### Pitfall 9: Supabase Free Tier Project Pausing After 7 Days of Inactivity

**What goes wrong:**
If using Supabase (rather than Neon) for the Postgres database, the entire project pauses after 7 consecutive days of no database activity. The first request after a pause takes ~30 seconds to resume — long enough for Vercel's function timeout to fire first, returning a 504 to the user.

**Why it happens:**
A D&D group schedules every few weeks. The app may see no traffic for 8-10 days between scheduling cycles, triggering the pause.

**How to avoid:**
- Prefer Neon over Supabase for this project. Neon's free tier suspends compute after 5 minutes but resumes in 1-3 seconds. Supabase's 7-day pause takes ~30 seconds to resume.
- If Supabase is used, set up a GitHub Actions workflow on a 5-day schedule that sends a single lightweight query (`SELECT 1`) to keep the project active.
- Alternative: use a free uptime monitor (Better Uptime, UptimeRobot) pinging a health endpoint that queries the database every 5 days.

**Warning signs:**
- Supabase being selected as the database without reading the free-tier pausing docs
- No activity-keepalive strategy documented for a database that will see infrequent traffic

**Phase to address:**
Database selection phase (infrastructure setup). The choice between Neon and Supabase should be made before any schema is written.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip custom domain, send from `onboarding@resend.dev` | Start emailing immediately | All real invites land in spam; must re-verify domain and resend | Development/testing only, never in production |
| Use auto-increment integer IDs as poll URLs | Zero effort, default ORM behaviour | Enumerable — anyone can iterate all polls | Never for public-facing identifiers |
| Separate admin link by appending `?admin=true` to participant URL | Simple to implement | Admin access can be guessed from participant URL | Never |
| SQLite locally, Postgres in production | No Docker requirement | Migration and behaviour divergence; bugs surface in prod only | Acceptable if ORM abstracts all SQL and a Postgres CI test suite covers migrations |
| Store participant name as edit identity | No token management needed | Name collisions corrupt responses; anyone can overwrite by guessing a name | Never |
| No rate limiting on poll lookup endpoint | Simpler code | UUID entropy is high but rate limiting is cheap defence-in-depth | Acceptable for MVP, add before any public launch |
| Ignore Neon cold start latency | No work needed | First user after idle period sees 2-5 second page load | Acceptable for hobby internal use; unacceptable if app is public-facing |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Resend | Use default `onboarding@resend.dev` for production sends | Verify custom domain before any real user receives mail |
| Resend | Ignore 429 responses; treat them as transient | Surface 429 as a user-visible "daily email limit reached" error; do not silently retry |
| Resend | CC all participants on one email to save API calls | Each CC recipient counts as a separate email toward the 100/day limit; send individual emails |
| Neon | Use direct connection string from app code | Use the pooled connection string (`-pooler.neon.tech`) for all app queries; reserve direct connection for migrations only |
| Neon | Set a 5-second connection timeout | Use at least 10 seconds; the compute needs 1-3 seconds to resume from suspension |
| Neon | Poll the database on a keepalive timer to prevent suspension | Burns free CU-hours unnecessarily; accept suspension and handle latency gracefully |
| Vercel | Add cron expression `*/15 * * *` for frequent jobs | Hobby plan only allows once-per-day minimum; sub-daily crons silently fail during deployment |
| Vercel | Write to the filesystem as a data store | Filesystem is ephemeral per function instance; use Neon/Postgres for all persistent data |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| N+1 query on results dashboard (query DB once per participant per date) | Results page slow even for small polls | JOIN or single query returning all participant×date rows; use ORM eager loading | Any poll with more than 5 participants |
| Blocking email send inside API request (await sendEmail before returning 200) | Poll creation appears to hang for 1-2 seconds (Resend API round trip) | Fire email send as a background task or return 202 immediately; for MVP, the 1-2 second wait is tolerable | Acceptable for MVP; becomes noticeable at higher latency or with email provider timeouts |
| No database index on `poll_id` foreign key on responses table | Results dashboard queries slow as response count grows | Index `responses.poll_id` at schema creation time | Any poll with more than ~100 responses |
| Fetching full poll + all responses on every page load for real-time updates | Hammers Neon on every browser refresh | Cache results page with short TTL (30-60s); use `stale-while-revalidate` | Multiple concurrent participants refreshing the results page |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Sequential/predictable poll IDs in URLs | Any user can enumerate all polls, exposing all participant PII | Use UUID v4 or CUID2 for all public-facing poll and admin identifiers |
| Single link grants both view and edit access | Anyone with the participant link can alter responses | Issue separate admin (organiser) and participant links backed by separate tokens |
| Edit endpoint accepts `participantId` without token verification | IDOR — any user can overwrite any participant's response by guessing their ID | Edit endpoint must require the per-participant edit token; verify it server-side |
| Participant edit token stored in URL query parameter | Token leaks in server logs, browser history, Referer headers | Store edit token in browser localStorage keyed by poll ID; do not put it in the URL after initial delivery |
| Storing participant emails in plaintext in a shared database | Data breach exposes PII; GDPR concern for EU users | Acceptable for hobby self-hosted use; for cloud deployment, note clearly that emails are stored and minimise retention (delete after poll closes + 30 days) |
| No rate limiting on response submission endpoint | Spam submissions can flood a poll with fake participant entries | Validate participant name length and character set; optionally rate-limit submissions by IP |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Participant cannot return to edit their response without the original email link | Participants on mobile who open the link, close the tab, and return later cannot edit | Store participant edit token in `localStorage`; auto-load their previous response on return from the same browser |
| Poll results grid not updating until page refresh | Organiser cannot see real-time participation without manually refreshing | Use SWR/React Query with a short refetch interval (30s) on the results page; no WebSocket needed |
| Date displayed in wrong timezone (shows previous day for some participants) | Participants mark wrong dates as available | Parse date-only strings without `new Date()`; use `date-fns/parseISO` or format as `YYYY-MM-DD` strings throughout |
| Admin link same format as participant link | Organiser accidentally shares their admin link, giving everyone poll management access | Admin link must look visually distinct (different URL path or prefix) and should display a warning if opened by someone who already submitted a response |
| No confirmation after response submission | Participant not sure if their response was saved | Show explicit success state after submission; include "your response has been recorded" with a summary of their choices |

---

## "Looks Done But Isn't" Checklist

- [ ] **Email invites:** Sent from verified custom domain (not `@resend.dev`) — check Resend dashboard "From" address
- [ ] **Email error handling:** 429 and 5xx from Resend are surfaced to the organiser, not swallowed — test by temporarily lowering the send limit in a staging environment
- [ ] **Poll ID entropy:** URLs contain UUID v4 or CUID2 (36 or 25+ character random string), not integers — inspect any poll creation network response
- [ ] **Admin link isolation:** Admin link shares no predictable relationship with participant link — verify admin token is a separate DB column with independent random value
- [ ] **Participant ownership:** Posting an edit to Participant A's record with Participant B's token returns 403 — write this as an explicit integration test
- [ ] **Neon connection pooling:** App connects via `-pooler.neon.tech` endpoint, not direct endpoint — check `DATABASE_URL` in Vercel environment variables
- [ ] **Date rendering:** Dates display correctly in UTC-5, UTC, and UTC+9 — test in browser dev tools with timezone override
- [ ] **Vercel cron expressions:** All `vercel.json` cron schedules are once-per-day or coarser — run `vercel deploy --dry-run` and check for cron validation errors
- [ ] **localStorage edit token:** Returning to a poll URL from same browser auto-populates previous response — test in incognito vs. normal tab
- [ ] **Neon cold start:** App does not timeout on first request after 10+ minutes idle — set DB connection timeout ≥10s and test manually

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong sending domain (all invites went to spam) | HIGH | Verify custom domain in Resend; resend all invites; ask participants to check spam |
| Sequential poll IDs exposed | HIGH | Migrate all polls to UUID primary keys; update all existing URLs (breaks shared links); communicate URL change to users |
| Participant edit collisions (name-based lookup) | MEDIUM | Retroactively assign edit tokens to all existing participants; update "edit" links in past emails |
| SQLite/Postgres behaviour divergence found in production | MEDIUM | Write Postgres-specific migration to correct data; add Postgres-only CI test suite; remove SQLite from dev stack |
| Neon compute hours exhausted mid-month | LOW | Upgrade to Neon paid plan ($19/month) or switch to Supabase free tier; compute resumes next month |
| Vercel cron not firing at expected frequency | LOW | Move scheduled logic to external scheduler (Upstash QStash free tier) or rewrite as request-time side effect |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Custom domain not verified before sending | Email integration phase (verify DNS before writing email code) | Send a test invite to a real inbox; confirm it is not in spam |
| Resend 100/day limit exceeded | Email integration phase | Implement 429 handler; test with forced 429 mock |
| Guessable/sequential poll IDs | Schema design phase (first DB models) | Inspect poll URL format in response to first poll creation call |
| Missing participant ownership check on edit | Response submission phase | Write integration test: edit with wrong token, expect 403 |
| SQLite/Postgres mismatch | Project setup phase (before schema) | Run full migration suite against Postgres in CI |
| Neon auto-suspend cold start latency | Database integration phase | Test first request after 10 minutes idle; verify timeout settings |
| Supabase 7-day pause | Database selection phase | Choose Neon; or document keepalive strategy before first deployment |
| Vercel cron limits | Notification/scheduling phase | Attempt to deploy sub-daily cron on Hobby; observe error |
| Date timezone rendering bug | Schema and frontend rendering phase | Browser devtools timezone override test at UTC-5 and UTC+9 |
| Participant name collision on edit | Response submission phase | Create two participants with identical names in the same poll; attempt edit |

---

## Sources

- [Resend account quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits)
- [Resend New Free Tier announcement](https://resend.com/blog/new-free-tier)
- [Resend email authentication guide](https://resend.com/blog/email-authentication-a-developers-guide)
- [Resend top 10 deliverability tips](https://resend.com/blog/top-10-email-deliverability-tips)
- [Vercel Hobby Plan official docs](https://vercel.com/docs/plans/hobby)
- [Vercel Functions Limitations](https://vercel.com/docs/functions/limitations)
- [Vercel Cron Jobs usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel free tier limits 2026 (deploywise.dev)](https://deploywise.dev/blog/vercel-free-tier-limits-2026)
- [Neon plans and limits](https://neon.com/docs/introduction/plans)
- [Neon connection pooling](https://neon.com/docs/connect/connection-pooling)
- [Neon free plan guide](https://neon.com/blog/how-to-make-the-most-of-neons-free-plan)
- [Supabase free project pausing docs](https://supabase.com/docs/guides/platform/free-project-pausing)
- [Is SQLite supported in Vercel? (Vercel KB)](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel)
- [UUID security risks (VerSprite)](https://versprite.com/blog/universally-unique-identifiers/)
- [UUIDs to prevent enumeration attacks](https://sqlfordevs.com/uuid-prevent-enumeration-attack)
- [XSS: localStorage vs Cookies (Academind)](https://academind.com/articles/localstorage-vs-cookies-xss)
- [Timezone handling in web applications (Medium)](https://medium.com/@ashour521/timezone-handling-in-web-applications-the-problem-most-systems-eventually-face-a4eec11f7043)
- [10 best practices for timestamps in databases (Tinybird)](https://www.tinybird.co/blog/database-timestamps-timezones)
- [Neon review with live traffic (ishan.page)](https://ishan.page/blog/dbms-neon/)

---
*Pitfalls research for: Free-tier group availability scheduling web app (LFG)*
*Researched: 2026-06-30*

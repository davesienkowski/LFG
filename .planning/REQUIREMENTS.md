# Requirements: Looking For Group (LFG)

**Defined:** 2026-06-30
**Core Value:** A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — no participant login, no cost.

## User Stories

- **As an organizer (D&D host),** I want to propose several candidate dates and share one link, so my group can tell me which days they can play.
- **As an organizer,** I want to email the invite straight from the app, so I don't have to copy-paste links into chat.
- **As an organizer,** I want a grid that shows everyone's availability and highlights the best day, so I can pick the session date in seconds.
- **As an organizer,** I want to sort/filter a date by who is available / tentative / not available, so I can see exactly who can make a given day.
- **As a participant,** I want to mark each date as Available, If-need-be, or Not available without making an account, so responding is effortless.
- **As a participant,** I want a link to change my answer later, so I can update my availability when plans change.
- **As an organizer,** I want to "Book it" on the winning date and have everyone who voted get a confirmation, so the decision is communicated.

## v1 Requirements

Requirements for initial release. Each maps to a roadmap phase.

### Poll Creation

- [x] **POLL-01**: Organizer can create a poll with a required title
- [x] **POLL-02**: Organizer can add an optional description/notes and optional location to a poll
- [x] **POLL-03**: Organizer can add one or more candidate date slots to a poll
- [x] **POLL-04**: Organizer can optionally give a candidate slot a start time (date-only slots are also valid)
- [ ] **POLL-05**: Organizer selects candidate dates from a month calendar (multi-select), with a side list to set an optional start time per date and apply one start time to all selected dates at once

### Access & Links

- [x] **LINK-01**: On creation, the system generates a shareable participant link that grants voting access only
- [x] **LINK-02**: On creation, the system generates a separate admin link that grants poll management and is not derivable from the participant link
- [x] **LINK-03**: Poll and admin identifiers are cryptographically random, unguessable, and non-enumerable

### Voting & Responses

- [ ] **VOTE-01**: A participant can open a poll via the participant link and respond without creating an account
- [ ] **VOTE-02**: A participant can mark each candidate date as exactly one of three states — Available (yes), If-need-be (tentative), Not available (no)
- [ ] **VOTE-03**: A participant enters their name (and email for the edit link) and submits their response
- [ ] **VOTE-04**: A participant receives a confirmation email containing a unique link to review/edit their response
- [ ] **VOTE-05**: A participant can edit their own response while the poll is open
- [ ] **VOTE-06**: The edit action verifies a per-participant token before allowing changes (no name-only edits; no editing another participant's row)
- [ ] **VOTE-07**: A participant can set availability for multiple dates at once via per-row quick actions (set all available / set all unavailable / clear), in addition to per-date selection

### Results Dashboard

- [ ] **DASH-01**: The poll page shows a results grid with participants as rows and candidate dates as columns
- [ ] **DASH-02**: Each grid cell visually distinguishes the participant's three-state availability for that date
- [ ] **DASH-03**: Each date column shows a summary count of yes votes and if-need-be votes
- [ ] **DASH-04**: The system highlights the best date(s) by highest yes count (tie-break: if-need-be count, then chronological)
- [ ] **DASH-05**: The organizer can sort/filter the view by availability status (available / tentative / not available) for a given date

### Email

- [ ] **MAIL-01**: The organizer can enter one or more email addresses and send each an invitation email containing the participant link
- [ ] **MAIL-02**: Email delivery works on a free-tier provider (Resend) or SMTP, configured via environment variables
- [ ] **MAIL-03**: If email is not configured, the app degrades gracefully by surfacing the participant link to copy/share manually

### Finalization

- [ ] **FNL-01**: The organizer can finalize the poll by selecting the winning date ("Book it")
- [ ] **FNL-02**: Finalizing closes the poll to further voting (vote form becomes read-only)
- [ ] **FNL-03**: On finalization, every participant who voted receives a confirmation email with the chosen date and event details

### Platform & Deployment

- [x] **PLAT-01**: The app runs locally on the user's PC against a local Postgres database
- [x] **PLAT-02**: The app deploys to Vercel's free tier against a Neon Postgres database
- [x] **PLAT-03**: All runtime dependencies (database, email) operate within free tiers
- [x] **PLAT-04**: Candidate dates are stored and rendered without timezone drift (date-only stored as DATE; never parsed through the `new Date()` constructor)

## v2 Requirements

Deferred to future release. Tracked but not in the current roadmap.

### Respondent Tracking

- **RESP-01**: Organizer can see which invitees have not yet responded
- **RESP-02**: Organizer can send a one-click manual "nudge" email to non-respondents

### Scheduling Controls

- **DEAD-01**: Organizer can set a deadline after which voting auto-closes
- **ORG-01**: Organizer can add their own availability row from the admin view

### Collaboration & UX

- **CMNT-01**: Participants can post comments/notes on the poll for coordination
- **MOBL-01**: Dedicated mobile-optimized grid (sticky name column, horizontal scroll)
- **SLOT-01**: Multiple candidate time slots on the same day (e.g. Sat 2pm OR Sat 7pm)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Participant accounts / login | Adds friction; token-in-email + cookie covers editing without identity management |
| Calendar integration (Google/Outlook sync) | Heavy OAuth + free-tier cost; finalization email carries all details for manual entry |
| Paid plans / billing / subscription | Entire motivation is avoiding a subscription; stays permanently free |
| Native mobile apps | Responsive web covers all target users |
| Automatic periodic reminders (scheduled jobs) | Needs background cron/queue; Vercel Hobby cron is too limited — use the manual nudge (v2) instead |
| Hidden poll (responses private) | Small trusted D&D group has no privacy need; adds UI complexity |
| Participant limits per slot | Different use case (sign-up sheet, not availability poll) |
| Export to Excel/CSV | Unnecessary for a 5–10 person group; the on-screen grid suffices |
| Multiple organizers / shared management | Single host (the DM) holds the admin link |
| Timezone detection/display | Group is same-timezone; organizer notes timezone in description if needed |
| Recurring polls / automation | Create a fresh poll per session |

## Traceability

Which phases cover which requirements. **Populated by the roadmapper.**

| Requirement | Phase | Status |
|-------------|-------|--------|
| POLL-01 | Phase 1 | Complete |
| POLL-02 | Phase 1 | Complete |
| POLL-03 | Phase 1 | Complete |
| POLL-04 | Phase 1 | Complete |
| POLL-05 | Phase 1 | Pending |
| LINK-01 | Phase 1 | Complete |
| LINK-02 | Phase 1 | Complete |
| LINK-03 | Phase 1 | Complete |
| VOTE-01 | Phase 2 | Pending |
| VOTE-02 | Phase 2 | Pending |
| VOTE-03 | Phase 2 | Pending |
| VOTE-04 | Phase 4 | Pending |
| VOTE-05 | Phase 2 | Pending |
| VOTE-06 | Phase 2 | Pending |
| VOTE-07 | Phase 2 | Pending |
| DASH-01 | Phase 3 | Pending |
| DASH-02 | Phase 3 | Pending |
| DASH-03 | Phase 3 | Pending |
| DASH-04 | Phase 3 | Pending |
| DASH-05 | Phase 3 | Pending |
| MAIL-01 | Phase 4 | Pending |
| MAIL-02 | Phase 4 | Pending |
| MAIL-03 | Phase 4 | Pending |
| FNL-01 | Phase 4 | Pending |
| FNL-02 | Phase 4 | Pending |
| FNL-03 | Phase 4 | Pending |
| PLAT-01 | Phase 1 | Complete |
| PLAT-02 | Phase 1 | Complete |
| PLAT-03 | Phase 1 | Complete |
| PLAT-04 | Phase 1 | Complete |

**Coverage:**

- v1 requirements: 30 total
- Mapped to phases: 30 ✓
- Unmapped: 0 ✓

**Per-phase counts:** Phase 1 = 12 (POLL-01..05, LINK-01..03, PLAT-01..04) · Phase 2 = 6 (VOTE-01, VOTE-02, VOTE-03, VOTE-05, VOTE-06, VOTE-07) · Phase 3 = 5 (DASH-01..05) · Phase 4 = 7 (VOTE-04, MAIL-01..03, FNL-01..03)

## Definition of Done

- All v1 requirements above are implemented, verified, and committed.
- The app runs end-to-end locally AND on a Vercel preview/production deploy on free tiers.
- A full happy-path works: create poll → email invite → participant three-state vote → organizer reads grid + best-day → "Book it" → confirmation emails sent.
- Poll/admin tokens are unguessable; a participant cannot edit another participant's response.
- No timezone drift on displayed dates.

---
*Requirements defined: 2026-06-30*
*Last updated: 2026-06-30 — added POLL-05 (Phase 1 calendar revision) and VOTE-07 (Phase 2 bulk-vote input) per 01-04 design*

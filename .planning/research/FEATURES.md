# Feature Research

**Domain:** Group availability scheduling poll (Doodle "Group Poll" clone)
**Researched:** 2026-06-30
**Confidence:** HIGH (primary source: Doodle Help Center articles + verified cross-references)

---

## How Doodle Group Polls Actually Work (Reference Behavior)

This section documents the real Doodle behavior as of mid-2026 so the feature categories below are grounded in verified mechanics, not assumptions.

### Poll Creation Flow (Organizer)

1. Organizer enters: **event name** (required), **description** (optional), **location** (optional — plain text, or Zoom/Meet/Teams URL)
2. Organizer selects **candidate date/time slots** via a calendar picker. Each slot has a date + optional start time + optional duration. Multiple slots per day are allowed.
3. On creation, Doodle generates **two separate links**:
   - **Admin/organizer link** — contains an admin token; grants full management rights (edit poll, delete participants, finalize date). Sent to organizer's email. Can be reset if accidentally shared.
   - **Participant link** — contains only the poll ID; grants voting access only. This is the link shared with invitees.
4. Organizer distributes the participant link via copy-paste (free) or Doodle's built-in email invite (now a paid feature on Doodle).

### Participant Response Flow

1. Participant opens the poll link. No account required.
2. Participant sees the date/time columns and clicks to mark each:
   - **Click once** → Yes / Available (green checkmark)
   - **Click twice** → If-need-be / Tentative (yellow indicator)
   - **Click three times (or leave unclicked)** → No / Not available (empty)
3. After marking all slots, participant enters their **name** and **email address**, then submits.
4. Participant receives a **confirmation email** containing a link to review/edit their response.
5. To **edit a response**: participant clicks the link in their confirmation email, OR uses the original voting device (cookie-based recognition), OR requests the link from the organizer. Editing is allowed while the poll is open.

### Results Grid

- Layout: **rows = participants**, **columns = date/time slots**.
- Each cell shows the participant's state for that slot: green (yes), yellow (if-need-be), empty (no).
- A **summary count row** at the bottom of each column shows the total number of yes votes (and separately if-need-be votes).
- The **slot with the highest yes count** is visually highlighted as the leading option.
- The organizer sees the full grid; on a standard (non-hidden) poll, participants also see everyone's responses.

### Finalizing the Date ("Book it")

- Organizer clicks **"Book it"** on the column for the chosen date.
- Poll closes to further voting.
- Participants who voted receive a **confirmation email** with the chosen date and event details.
- If the organizer has a calendar connected (paid feature): calendar invites also go out.
- Participants who never voted do NOT receive a finalization notification.

### What Is Now Paywalled on Doodle (Critical Context)

As of 2026, Doodle has moved several historically-free features behind a Professional subscription (~$7/month):

| Feature | Free | Paid |
|---------|------|------|
| Three-state voting (if-need-be) | No — binary yes/no only | Yes |
| Email invitations via Doodle | No — copy link only | Yes |
| Automatic reminders to non-respondents | No | Yes |
| Response deadline | No | Yes |
| Participant limits per slot | No | Yes |
| Hidden poll (responses private) | No | Yes |
| Ads shown to participants | Yes (ads shown) | No ads |

**Implication for this project:** The entire motivation for building this clone is that the three-state (Yes/If-need-be/No) voting — previously the signature Doodle feature — is now paywalled. This is the core differentiator this project must deliver for free.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must exist for the product to feel like a working group scheduling poll. Missing any of these makes the product feel broken or incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Poll creation: title, optional description, optional location | Every scheduling tool has these meta fields | LOW | Title required; description and location optional free-text fields |
| Candidate date/time slot selection | Core purpose: proposing dates to vote on | MEDIUM | Must support date-only AND date+time slots; multiple slots per day; calendar picker UI |
| Shareable participant link (no-account voting) | Doodle's defining UX; accounts add friction | LOW | URL contains poll ID; unique per poll; anyone with link can vote |
| Separate admin/organizer link | Needed so organizer can manage without exposing admin controls to participants | MEDIUM | Admin token in URL (separate from participant URL); must not be guessable from participant URL |
| Participant name entry (no account required) | Organizer needs to know who responded | LOW | Free-text name field on the vote submission form; email optional but needed for edit-link delivery |
| Three-state per-slot selection: Yes / If-need-be / No | The whole point of the poll; binary yes/no loses nuance | MEDIUM | Click-cycle UX: one click = yes (green), two clicks = if-need-be (yellow), three clicks / unclicked = no (empty) |
| Live results grid (participants × date columns) | The organizer needs to see collective availability at a glance | MEDIUM | Rows = participants; columns = date slots; cells show the three states visually |
| Summary count row per date column | Quickly shows which date has the most availability without reading every row | LOW | Shows: N yes, M if-need-be per column; derived from response data |
| Best-day highlighting | Organizer needs to quickly spot the winning date | LOW | Visually mark the column(s) with highest yes count; ties handled by also counting if-need-be |
| Participant response editing | Availability changes; people need to update their vote | MEDIUM | Token-based: confirmation email contains unique edit link; same-device cookie as fallback; valid while poll is open |
| Email invitation: organizer sends invite to address list | Core workflow for notifying invitees | MEDIUM | Organizer enters email addresses; system sends email with participant link; uses free-tier SMTP/Resend |
| Finalize / "Book it" action | Signals the poll is done and communicates the result | MEDIUM | Organizer selects the winning date; poll closes to voting; confirmation email sent to all who voted |

### Differentiators (Nice Extras for This Use Case)

Features that go beyond minimal Doodle replication and are appropriate for a small private D&D group context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Not yet responded" indicator | Organizer can see at a glance who still needs to vote; useful for nudging players | LOW | A simple list of invitees who have not yet submitted a response |
| Manual "nudge" email to non-respondents | One-click reminder to those who haven't voted yet | LOW | Organizer button: send the invite email again to anyone not yet responded; no automation needed |
| Comments / notes thread on poll | D&D groups discuss details (where to meet, what to bring) alongside the scheduling | MEDIUM | Simple append-only comment list on the poll page; commenter enters name; no threading |
| Poll deadline (auto-close voting) | Prevents stale polls from accepting late votes; gives the group a forcing function | LOW | Organizer sets a date/time; after which the vote form is locked and read-only |
| Mobile-responsive grid | Participants are likely on phones | MEDIUM | The participants × dates grid must scroll horizontally and remain readable on small screens |
| Organizer adds their own availability | Organizer is usually also a participant; they should be able to vote too | LOW | Organizer row in the grid just like any participant; edit via admin link |
| Final-date confirmation email with session details | After "Book it", a nicely formatted email to all who voted with the confirmed date, time, and location | LOW | Triggered by finalization; already required for table stakes but enhanced with event details formatted clearly |

### Anti-Features (Deliberately NOT Building)

| Feature | Why Requested | Why Not | Alternative |
|---------|---------------|---------|-------------|
| Participant accounts / login | Seems like it would let people "own" their vote | Adds friction; Doodle's model works without it; a small group doesn't need identity management | Token in confirmation email; same-device cookie |
| Calendar integration (Google Calendar / Outlook sync) | Convenience for accepting the finalized event | Heavy OAuth integration cost; free-tier complexity; a D&D group can manually add a calendar event | Finalization email contains all event details for manual entry |
| Paid plans / billing / subscription | Product direction for commercial tools | Entire motivation is avoiding a subscription; billing infrastructure is disproportionate to scope | Project stays permanently free and self-hosted |
| Native mobile apps | Polished mobile experience | Responsive web app covers all target users; app store submission is overkill for a hobby project | Responsive web design |
| Automatic periodic reminders (scheduled jobs) | Reduces organizer manual work | Requires background job scheduling (cron/queue); complicates free-tier deployment on Vercel | Manual "nudge" button in the admin view |
| Hidden poll (responses invisible to other participants) | Privacy in larger groups | Adds UI complexity; a small D&D group of friends has no privacy concern | Default: everyone sees everyone's responses |
| Participant limits per slot | Useful for sign-up sheets or event capacity | Different use case (sign-up sheet, not availability poll); adds complexity | Out of scope; Doodle has a separate "Sign-up Sheet" feature for this |
| Export to Excel/CSV | Data portability | Unnecessary for 5-10 person D&D group; a screenshot suffices | Read the grid on screen |
| Multiple organizers / shared poll management | Team collaboration | Single organizer is the D&D DM / host; not needed | Admin link held by one person |
| Timezone detection / display | Useful for distributed teams | D&D group is co-located or same-timezone; adds UI and storage complexity | All times displayed in server local time; organizer is responsible for specifying timezone in the description if needed |
| Comments moderation / deletion | Admin control over discussion | A small trust group; overkill | Comments are trusted; no moderation |
| Recurring polls / automation | Set-and-forget scheduling | Scope creep; simple one-off poll is sufficient for each session | Create a new poll for each session |

---

## Feature Dependencies

```
Poll Creation (title + dates + admin token + participant token)
    ├──required-before──> Participant Link (derived from poll ID)
    ├──required-before──> Admin Link (derived from admin token)
    ├──required-before──> Results Grid (no grid without a poll)
    └──required-before──> Email Invitation (no invitees without a poll)

Participant Response (name + per-slot three-state selection)
    ├──required-before──> Results Grid (grid is empty without responses)
    ├──required-before──> Summary Count Row (counts derived from responses)
    ├──required-before──> Best-Day Highlighting (highlighting derived from counts)
    └──required-before──> Participant Editing (editing means updating an existing response)

Participant Editing
    └──requires──> Edit Token (unique token stored in response record; sent in confirmation email)

Email Invitation
    └──requires──> Email Service Integration (Resend / SMTP)

Finalize / Book It
    ├──requires──> At least one Participant Response (cannot book an empty poll)
    └──requires──> Email Service Integration (confirmation email on finalization)

"Not Yet Responded" Indicator
    └──requires──> Invited-Email List (need to know who was invited to know who hasn't responded)

Manual Nudge Email
    ├──requires──> "Not Yet Responded" Indicator
    └──requires──> Email Service Integration
```

### Dependency Notes

- **Participant link and admin link require poll creation:** Both tokens (participant poll ID and admin token) are generated at poll creation time and stored in the database. They cannot exist beforehand.
- **Results grid requires participant responses:** The grid exists structurally as soon as the poll exists, but it has no content until at least one person votes. The UI should render an empty grid with a "no responses yet" state.
- **Participant editing requires an edit token:** Without a token, there is no authenticated way to update a specific participant's row. The token is generated at response submission time and sent in the confirmation email. Same-device cookies provide a convenience fallback (not a security guarantee).
- **Best-day highlighting requires summary counts:** Highlighting is derived directly from the aggregated counts; they must be computed before highlighting can be applied. In practice this is a single query/computation step.
- **Email features require an email service:** Both invitation emails and finalization notifications depend on a working email delivery integration. This is a deployment-time dependency (Resend API key or SMTP credentials). Email must be configured before these features work; the app should degrade gracefully (show the link to copy) if email is not configured.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — everything the D&D group needs to replace Doodle Group Poll.

- [ ] **Poll creation** — title (required), description/notes (optional), location (optional), one or more candidate date or date+time slots
- [ ] **Admin link + participant link** — two distinct URLs generated at creation; admin token stored separately
- [ ] **Three-state voting** — yes (green) / if-need-be (yellow) / no (empty), click-cycle mechanic, name entry, email entry for edit-link delivery
- [ ] **Results grid** — participants × date columns, all three states rendered visually, summary count row per column
- [ ] **Best-day highlighting** — visually surface the column(s) with the highest yes count (tie: also count if-need-be)
- [ ] **Participant response editing** — unique edit token in confirmation email; update existing response while poll is open
- [ ] **Email invitation** — organizer enters addresses, system sends email with participant link (requires Resend/SMTP config)
- [ ] **Finalize / Book It** — organizer selects the winning date; poll closes; confirmation email to all respondents

### Add After Validation (v1.x)

Features to add once core is working and the group is using it.

- [ ] **"Not yet responded" list** — show which invitees have not voted; trigger: organizer asks for it after first use
- [ ] **Manual nudge email** — one-click reminder to non-respondents; trigger: organizer has to manually copy-paste to chase people
- [ ] **Poll deadline** — auto-close voting at a set date/time; trigger: organizer forgets to close the poll manually
- [ ] **Organizer availability row** — let the organizer vote as a participant from the admin view; trigger: DM wants their availability counted
- [ ] **Comments thread** — simple comments on the poll for coordination; trigger: group discusses session details in chat instead of on the poll

### Future Consideration (v2+)

Features to defer until the core proves useful.

- [ ] **Mobile layout optimization** — dedicated mobile grid UX (horizontal scroll, sticky name column); defer until actual usage reveals pain points
- [ ] **Multiple candidate date-time slots on same day** — e.g., "Saturday 2pm OR Saturday 7pm"; deferred because basic date selection likely suffices initially

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Poll creation (title, dates, notes, location) | HIGH | LOW | P1 |
| Admin link vs participant link | HIGH | MEDIUM | P1 |
| Three-state voting (yes/if-need-be/no) | HIGH | MEDIUM | P1 |
| Name entry, no-account voting | HIGH | LOW | P1 |
| Results grid (participants × dates) | HIGH | MEDIUM | P1 |
| Summary count row + best-day highlight | HIGH | LOW | P1 |
| Participant response editing (token-based) | HIGH | MEDIUM | P1 |
| Email invitation from organizer | HIGH | MEDIUM | P1 |
| Finalize / Book It + notification email | HIGH | MEDIUM | P1 |
| "Not yet responded" indicator | MEDIUM | LOW | P2 |
| Manual nudge email | MEDIUM | LOW | P2 |
| Poll deadline | MEDIUM | LOW | P2 |
| Organizer availability vote | MEDIUM | LOW | P2 |
| Comments thread | LOW | MEDIUM | P2 |
| Mobile-optimized grid | MEDIUM | MEDIUM | P2 |
| Multiple slots per day | LOW | MEDIUM | P3 |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration

---

## Competitor Feature Analysis

| Feature | Doodle (free tier 2026) | Doodle (paid) | Rallly (open source) | This Project |
|---------|------------------------|---------------|---------------------|--------------|
| No-account voting | Yes | Yes | Yes | Yes |
| Three-state voting | No (paid only) | Yes | Yes (yes/if-need-be/no) | Yes — core requirement |
| Email invitations | No (copy link only) | Yes | Yes (via SMTP config) | Yes (via Resend/SMTP) |
| Results grid | Yes | Yes | Yes | Yes |
| Best-day highlighting | Yes | Yes | Yes | Yes |
| Participant editing | Via confirmation email | Via confirmation email | Via unique link | Via confirmation email token |
| Finalization / Book It | Yes | Yes | Yes | Yes |
| Finalization notification | Email to voters | Email + calendar invite | Email to all | Email to voters |
| Automatic reminders | No | Yes | No | No (manual nudge instead) |
| Ads | Yes | No | No | No |
| Self-hostable | No | No | Yes (Docker/Node) | Yes (Vercel + local) |
| Comments | No | No | Yes | v1.x |
| Cost | $0 (limited) | ~$7/month | $0 self-host | $0 |

**Key finding:** Rallly (https://github.com/lukevella/rallly) is the closest open-source analog — it has the same core feature set including three-state voting, no-account participation, and self-hosting. It uses Next.js + Prisma + tRPC, which is a reasonable stack reference. The main difference from this project's scope: Rallly is general-purpose; this project is intentionally minimal and D&D-group-specific (no timezone complexity, no org features, no calendar integration).

---

## Sources

- Doodle Help Center: [Introduction to Group Poll](https://help.doodle.com/en/articles/9823082-introduction-to-group-poll)
- Doodle Help Center: [How does the if-need-be response work?](https://help.doodle.com/en/articles/9457343-how-does-the-if-need-be-group-poll-response-work)
- Doodle Help Center: [How do I participate in a group poll?](https://help.doodle.com/en/articles/9457279-how-do-i-participate-in-a-group-poll)
- Doodle Help Center: [How do I create a group poll?](https://help.doodle.com/en/articles/9457353-how-do-i-create-a-group-poll)
- Doodle Help Center: [How do I invite participants?](https://help.doodle.com/en/articles/9457352-how-do-i-invite-participants-to-my-group-poll)
- Doodle Help Center: [Advanced settings (deadline, limits, reminders, hidden)](https://help.doodle.com/en/articles/9457346-how-do-i-set-a-deadline-limit-participants-send-automatic-reminders-or-make-my-group-poll-hidden)
- Doodle Help Center: [How do I edit my group poll?](https://help.doodle.com/en/articles/9457348-how-do-i-edit-my-group-poll)
- Doodle Help Center: [How do I change my votes?](https://help.doodle.com/en/articles/9457214-how-do-i-change-my-votes-in-a-group-poll)
- Doodle Help Center: [How do I select the final option?](https://help.doodle.com/en/articles/9457342-how-do-i-select-the-final-option-for-my-group-poll)
- Doodle Blog: [Admin link reset feature](https://doodle.com/en/resources/blog/doodle-adds-reset-admin-link-feature-to-help-administer-your-poll/)
- SyncWhen: [Is Doodle Still Free? Free vs Paid 2026](https://syncwhen.com/blog/doodle-free-vs-paid)
- Rallly GitHub: [lukevella/rallly](https://github.com/lukevella/rallly)
- meetergo: [How to Use Doodle 2026 Guide](https://meetergo.com/en/magazine/how-to-use-doodle)
- whocan.org: [Doodle Poll Guide](https://www.whocan.org/en/blog/doodle-guide/)

---
*Feature research for: Group availability scheduling poll (Doodle Group Poll clone)*
*Researched: 2026-06-30*

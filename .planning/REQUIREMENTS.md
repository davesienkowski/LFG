# Requirements: Looking For Group (LFG) — Milestone v1.1 Organizer Controls

**Defined:** 2026-07-07
**Builds on:** v1.0 MVP (shipped 2026-07-07). For v1.0 requirements see `milestones/v1.0-REQUIREMENTS.md`.
**Core Value (unchanged):** A poll creator can propose candidate dates, get participants to mark their availability via an emailed link, and instantly see which day(s) work for the whole group — no participant login, no cost.

**Milestone goal:** Give the organizer the tools to drive a poll to a confident decision — track who hasn't responded, nudge them, auto-close on a deadline, and vote in their own availability.

## User Stories

- **As an organizer,** I want to see who I invited but hasn't answered yet, so I know who to chase before I pick a date.
- **As an organizer,** I want to send a one-click reminder to the people who haven't responded, so I don't have to re-type the invite by hand.
- **As an organizer,** I want to set a deadline so the poll closes itself once everyone's had their chance, so voting doesn't drag on.
- **As an organizer,** I want to mark my own availability from the admin view, so my constraints show up in the grid alongside everyone else's.

## v1.1 Requirements

Each maps to a roadmap phase (filled in by the roadmapper).

### Respondent Tracking

- [ ] **RESP-01**: On the admin view, the organizer can see which invited people have not yet responded (invited emails shown with a responded / not-responded status, matched to participants).
- [ ] **RESP-02**: The organizer can send a one-click "nudge" reminder email to the non-respondents, containing the participant link.
- [ ] **RESP-03**: When the organizer sends invitation emails, the recipients are persisted, so respondent tracking has a source of truth (v1.0 sent invites without recording who received them).

### Scheduling Controls

- [ ] **DEAD-01**: The organizer can set an optional voting deadline on a poll; once the deadline has passed the poll is closed to further voting (the vote form becomes read-only, consistent with FNL-02). Deadline expiry is evaluated lazily on poll access — no scheduled/cron job (respects the Vercel Hobby cron limitation documented in v1.0 Out of Scope).
- [ ] **ORG-01**: The organizer can add and edit their own availability row from the admin view, without using the participant link, and it appears in the results grid like any other participant.

## Future Requirements

Deferred to a later milestone. Tracked, not in this roadmap.

### Collaboration & UX

- **CMNT-01**: Participants can post comments/notes on the poll for coordination — communication feature; risks scope creep beyond the single "availability poll" focus (Zawinski). Revisit only if the group actually asks for it.
- **MOBL-01**: Dedicated mobile-optimized results grid (sticky name column, horizontal scroll) — partly addressed by the Phase 5 responsive redesign; defer until a real mobile-grid gap is confirmed.
- **SLOT-01**: Multiple candidate time slots on the same day (e.g. Sat 2pm OR Sat 7pm) — data-model change to poll creation; separate concern from organizer controls.

## Out of Scope

Explicitly excluded (carried forward from v1.0; reasons still valid).

| Feature | Reason |
|---------|--------|
| Automatic periodic reminders (scheduled jobs / cron) | Needs background cron/queue; Vercel Hobby cron is too limited. RESP-02 is a **manual** one-click nudge, and DEAD-01 auto-close is **lazy** (evaluated on access), so neither needs a scheduler. |
| Participant accounts / login | Adds friction; token-in-email + cookie covers editing without identity management. |
| Calendar integration (Google/Outlook sync) | Heavy OAuth + free-tier cost; finalization email carries all details for manual entry. |
| Paid plans / billing / subscription | Entire motivation is avoiding a subscription; stays permanently free. |
| Native mobile apps | Responsive web covers all target users. |
| Export to Excel/CSV | Unnecessary for a 5–10 person group; the on-screen grid suffices. |
| Multiple organizers / shared management | Single host (the DM) holds the admin link. |

## Traceability

Which phases cover which requirements. **Populated by the roadmapper.**

| Requirement | Phase | Status |
|-------------|-------|--------|
| RESP-01 | — | Pending |
| RESP-02 | — | Pending |
| RESP-03 | — | Pending |
| DEAD-01 | — | Pending |
| ORG-01 | — | Pending |

**Coverage:**

- v1.1 requirements: 5 total
- Mapped to phases: 0 (pending roadmap)
- Unmapped: 5

## Definition of Done

- All v1.1 requirements above are implemented, verified, and committed.
- The app still runs end-to-end locally AND on the Vercel free-tier deploy (no regressions to the v1.0 happy path).
- Respondent tracking correctly distinguishes invited-but-silent from responded, and the nudge email sends only to non-respondents.
- Deadline auto-close makes the vote form read-only after the deadline with no scheduled job, and never blocks or errors normal page loads.
- The organizer's own availability row behaves like any participant row in the grid and best-day computation.
- All schema changes are additive and nullable (backward-compatible, prod-safe migration) — consistent with the v1.0 pattern.

---
*Requirements defined: 2026-07-07 for milestone v1.1 Organizer Controls*

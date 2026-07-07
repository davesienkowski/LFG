# Roadmap: Looking For Group (LFG)

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-07-07)
- 🚧 **v1.1 Organizer Controls** — Phases 7-8 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-6) — SHIPPED 2026-07-07</summary>

- [x] Phase 1: Foundation & Poll Creation (4/4 plans) — POLL-01..05, LINK-01..03, PLAT-01..04
- [x] Phase 2: Participant Voting (2/2 plans) — VOTE-01, VOTE-02, VOTE-03, VOTE-05, VOTE-06, VOTE-07
- [x] Phase 3: Results Dashboard (2/2 plans) — DASH-01..05
- [x] Phase 4: Email & Finalization (3/3 plans) — VOTE-04, MAIL-01..03, FNL-01..03
- [x] Phase 5: Vote-Grid Redesign (5/5 plans) — WCAG/responsive UI hardening (D-01..D-10)
- [x] Phase 6: Your Polls Dashboard (4/4 plans) — MYP-01..08

Full detail: [milestones/v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md)

</details>

### 🚧 v1.1 Organizer Controls (In Progress)

**Milestone Goal:** Give the organizer the tools to drive a poll to a confident decision — track who hasn't responded, nudge them, auto-close on a deadline, and vote in their own availability.

- [ ] **Phase 7: Respondent Tracking & Nudges** — persist invitations, show responded / not-responded status on the admin view, and one-click nudge the non-respondents
- [ ] **Phase 8: Scheduling Controls** — optional lazy-close voting deadline plus the organizer's own availability row

## Phase Details

### Phase 7: Respondent Tracking & Nudges
**Goal**: The organizer can see who they invited but hasn't voted yet and chase the stragglers with a single click — without retyping the invite. Sending invitations now records each recipient, giving respondent tracking its source of truth (v1.0 sent invites without recording who received them).
**Depends on**: Phase 6 (v1.0 MVP shipped)
**Requirements**: RESP-03, RESP-01, RESP-02
**Success Criteria** (what must be TRUE):
  1. Sending invitation emails records each recipient against the poll, so the invited list survives after the send.
  2. The admin view shows every invited email with a clear "responded" or "not yet responded" status, matched to the participant who actually voted.
  3. The organizer can trigger a one-click "nudge" that emails only the non-respondents, each message carrying the participant link.
  4. The nudge routes through the existing env-switched `sendEmail()` seam — with no email configured it degrades gracefully (no error, copy-link fallback) exactly like v1.0 invites.
**Plans**: 4 plans (waves 1→4, sequential)
- [ ] 07-01-PLAN.md — Invitation persistence & recording: additive `invitations` table + migration; record-on-successful-send in sendInvites (RESP-03)
- [ ] 07-02-PLAN.md — Tracking read + nudge backend: admin-only responded/not-responded query; renderReminderEmail; nudgeNonRespondents action with server-side recompute + closed re-check (RESP-01, RESP-02)
- [ ] 07-03-PLAN.md — Who's responded card + nudge control UI wired into the admin page, no-leak canary tests (RESP-01, RESP-02)
- [ ] 07-04-PLAN.md — Prod backup → migrate → deploy + human-verify a real nudge email delivers (RESP-03, RESP-02)
**UI hint**: yes

### Phase 8: Scheduling Controls
**Goal**: The organizer directly controls the poll's timeline and their own participation: an optional voting deadline that closes the poll on its own (evaluated lazily on poll access — no cron/scheduled job), plus the ability to add and edit their own availability row straight from the admin view.
**Depends on**: Phase 6 (v1.0 MVP shipped); independent of Phase 7 — may execute in either order
**Requirements**: DEAD-01, ORG-01
**Success Criteria** (what must be TRUE):
  1. The organizer can set an optional voting deadline on a poll from the admin view, and can also leave it unset.
  2. Once the deadline has passed, the next visitor's vote form is read-only/closed — the same closed state as a "Book it"-finalized poll (FNL-02) — with no scheduled job involved.
  3. Polls without a deadline behave exactly as before, and evaluating an expired deadline never blocks or errors a normal page load.
  4. The organizer can add and edit their own availability row from the admin view, without using the participant link.
  5. The organizer's row appears in the results grid and best-day computation just like any other participant.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:** Phases execute in numeric order: 7 → 8.

| Phase                       | Milestone | Plans Complete | Status      | Completed  |
| --------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Foundation & Poll Create | v1.0      | 4/4            | Complete    | 2026-06-30 |
| 2. Participant Voting       | v1.0      | 2/2            | Complete    | 2026-07-01 |
| 3. Results Dashboard        | v1.0      | 2/2            | Complete    | 2026-07-01 |
| 4. Email & Finalization     | v1.0      | 3/3            | Complete    | 2026-07-02 |
| 5. Vote-Grid Redesign       | v1.0      | 5/5            | Complete    | 2026-07-02 |
| 6. Your Polls Dashboard     | v1.0      | 4/4            | Complete    | 2026-07-06 |
| 7. Respondent Tracking & Nudges | v1.1  | 0/4            | Planned     | -          |
| 8. Scheduling Controls      | v1.1      | 0/TBD          | Not started | -          |

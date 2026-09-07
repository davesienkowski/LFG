# Roadmap: Looking For Group (LFG)

## Milestones

- ✅ **v1.0 MVP** — Phases 1-6 (shipped 2026-07-07)
- ✅ **v1.1 Organizer Controls** — Phases 7-8 (shipped 2026-07-07, closed 2026-09-07)
- 🚧 **v1.2 Reliable Delivery** — Phases 9-10 (in progress)

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

<details>
<summary>✅ v1.1 Organizer Controls (Phases 7-8) — SHIPPED 2026-07-07, CLOSED 2026-09-07</summary>

- [x] Phase 7: Respondent Tracking & Nudges (4/4 plans) — RESP-01, RESP-02, RESP-03
- [x] Phase 8: Scheduling Controls (4/4 plans) — DEAD-01, ORG-01

Full detail: [milestones/v1.1-ROADMAP.md](milestones/v1.1-ROADMAP.md)

</details>

### 🚧 v1.2 Reliable Delivery (In Progress)

**Milestone Goal:** Make outbound email actually deliver to inboxes so invites, nudges, and confirmations work reliably — retiring the "accepted limitation" at v1.1 close and closing the inbox-deliverability human check open since v1.0.

- [ ] **Phase 9: Delivery Restoration & Fallback** — get outbound email sending again in prod through the existing `sendEmail()` seam, and add a fallback provider behind the same seam so one provider failing degrades to a backup, not to nothing
- [ ] **Phase 10: Deliverability & Visibility** — align sender identity (SPF/DKIM/DMARC) so mail lands in the inbox with a human-verified prod send, and surface send failures to the organizer so nothing fails silently

## Phase Details

### Phase 9: Delivery Restoration & Fallback

**Goal**: Outbound email works again in production. Invites, the RESP-02 nudge, and finalization/confirmation emails all actually dispatch through the existing env-switched `sendEmail()` seam, and a fallback provider behind that same seam takes over if the primary fails — so a single provider outage or misconfig degrades to a backup rather than to nothing. The no-email-configured path still degrades gracefully to copy-link (D-02 preserved).
**Depends on**: Phase 8 (v1.1 shipped). First phase of v1.2.
**Requirements**: DLVR-01, DLVR-02
**Success Criteria** (what must be TRUE):

  1. With email configured, sending an invite / nudge / finalization dispatches a real message in production (no longer a copy-link-only accepted limitation).
  2. All three email surfaces (invite, nudge, confirmation) route through the single `sendEmail()` seam — no new per-feature email code path.
  3. A configured fallback provider takes over when the primary provider's send fails, verified by simulating a primary-send failure; delivery still succeeds via the secondary.
  4. With no email configured, every email surface still degrades gracefully (copy-link, no error) exactly as before — D-02 preserved.
  5. Any schema/config change is additive and nullable; local and Vercel free-tier builds stay green at $0.

**Plans**: TBD (planned via `/gsd-plan-phase 9`)

**UI hint**: minimal — primarily backend/config; copy-link fallback UI already exists.

### Phase 10: Deliverability & Visibility

**Goal**: The mail that now sends actually lands in the inbox, and the organizer can see when it doesn't. Sender identity is SPF/DKIM/DMARC-aligned for the configured provider(s), a real production send is human-verified to arrive in a real inbox (not spam) with a working link, and send failures (hard bounce, auth error, all providers down) surface to the organizer instead of failing silently.
**Depends on**: Phase 9 (email must send before deliverability and failure-surfacing are meaningful)
**Requirements**: DLVR-03, DLVR-04
**Success Criteria** (what must be TRUE):

  1. Sender identity is SPF/DKIM/DMARC-aligned for the configured provider(s), achieved on free-tier (no paid domain/plan — Out of Scope holds).
  2. A real production send is **human-verified** to land in a real inbox (not spam) with a working link — the v1.0/v1.1 open human check is closed, not re-deferred.
  3. When a send fails, the organizer sees a per-recipient failed / needs-retry indicator on the admin view rather than a silent drop.
  4. The failure indicator never leaks participant emails on any participant-facing surface, and never blocks or errors a normal page load (best-effort, consistent with the `after()` side-effect pattern).
  5. No regression to the v1.0/v1.1 happy path locally or on the Vercel free-tier deploy.

**Plans**: TBD (planned via `/gsd-plan-phase 10`)

**UI hint**: yes — admin-side per-recipient delivery status indicator.

## Progress

**Execution Order:** Phases execute in numeric order: 9 → 10.

| Phase                       | Milestone | Plans Complete | Status      | Completed  |
| --------------------------- | --------- | -------------- | ----------- | ---------- |
| 1. Foundation & Poll Create | v1.0      | 4/4            | Complete    | 2026-06-30 |
| 2. Participant Voting       | v1.0      | 2/2            | Complete    | 2026-07-01 |
| 3. Results Dashboard        | v1.0      | 2/2            | Complete    | 2026-07-01 |
| 4. Email & Finalization     | v1.0      | 3/3            | Complete    | 2026-07-02 |
| 5. Vote-Grid Redesign       | v1.0      | 5/5            | Complete    | 2026-07-02 |
| 6. Your Polls Dashboard     | v1.0      | 4/4            | Complete    | 2026-07-06 |
| 7. Respondent Tracking & Nudges | v1.1  | 4/4            | Complete    | 2026-07-07 |
| 8. Scheduling Controls      | v1.1      | 4/4            | Complete    | 2026-07-07 |
| 9. Delivery Restoration & Fallback | v1.2 | 0/? | Not Started |  |
| 10. Deliverability & Visibility | v1.2  | 0/? | Not Started |  |

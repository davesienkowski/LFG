### Phase 6: Your Polls Dashboard

**Goal:** Give an organizer one place — `/polls` — to see every poll they created from this browser (open + booked) and a clear path to create another, so finalizing more polls (which populates the booked-dates calendar feed) is discoverable. Identity is the existing `lfg_organizer` cookie; no accounts, no schema change.
**Requirements**: MYP-01, MYP-02, MYP-03, MYP-04, MYP-05, MYP-06, MYP-07, MYP-08
**Depends on:** Phase 5
**Plans:** 4 plans

Plans:

- [ ] 06-01-PLAN.md — `getPollsByOrganizerId` read query + DB tests (ordering, counts, isolation, empty-organizer, null-exclusion, no-leak)
- [ ] 06-02-PLAN.md — presentational `PollListItem` (badge/summary/pluralization/null-date fallback) + shared `SubscribeCard` (same-browser copy) + component tests
- [ ] 06-03-PLAN.md — `/polls` dashboard RSC (cookie → query → list/empty state + subscribe card) + render tests (no-leak, no-oracle, dynamic)
- [ ] 06-04-PLAN.md — entry links on admin + landing (cookie-gated) + admin subscribe-card swap + test updates

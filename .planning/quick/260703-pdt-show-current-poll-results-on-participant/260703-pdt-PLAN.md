---
phase: 260703-pdt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/p/[participantUrlId]/thanks/page.tsx
autonomous: true
requirements: [DASH-01]
must_haves:
  truths:
    - "After submitting (or updating) a response, the participant sees a read-only 'Current results' section on the thanks page"
    - "The results section renders the current per-date tallies, best-day highlight, and everyone's votes via the existing ResultsGrid"
    - "The results reflect the just-submitted vote (fresh, not a stale cached snapshot) because the RSC is dynamically rendered via cookies()/headers()"
    - "No participant email, edit token, or admin_url_id ever appears on the thanks surface"
    - "The change is read-only: the modified file performs no DB writes and no migration is added"
  artifacts:
    - path: "src/app/p/[participantUrlId]/thanks/page.tsx"
      provides: "Current results section wired to participant-safe queries + computeResults"
      contains: "ResultsGrid"
  key_links:
    - from: "src/app/p/[participantUrlId]/thanks/page.tsx"
      to: "getResultsForPoll / getOptionsForPoll / computeResults"
      via: "server-side fetch keyed by poll.id (participant-safe queries only)"
      pattern: "getResultsForPoll"
    - from: "src/app/p/[participantUrlId]/thanks/page.tsx"
      to: "ResultsGrid"
      via: "props { options, participants, results }"
      pattern: "<ResultsGrid"
---

<objective>
Show the poll's current results on the participant post-submit page. Both
submit-response and update-response redirect to `/p/[participantUrlId]/thanks`;
that page should render a read-only "Current results" section beneath the
personal-edit-link Card, reusing the existing `ResultsGrid` component fed by
`getOptionsForPoll` + `getResultsForPoll` + `computeResults` — the exact same
wiring the admin page at `src/app/a/[adminUrlId]/page.tsx` uses.

Purpose: after a participant votes, they immediately see how the group's
availability is shaping up, without needing the admin link. Participant links
are shared within the group, so showing participant names + votes is acceptable.

Output: a single modified RSC file. No new component, no new query, no new type.

**No DB migration required — this is a read-only addition against the existing
schema.**

Three-token discipline (load-bearing): use ONLY participant-safe reads.
`getResultsForPoll` deliberately omits email/edit_token/admin_url_id;
`getOptionsForPoll` and `getPollByParticipantUrlId` are participant-safe;
`ResultsGrid` accepts no email prop and renders no token. Do NOT introduce
`admin_url_id` or any token onto this surface.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./.claude/CLAUDE.md

# The page to modify
@src/app/p/[participantUrlId]/thanks/page.tsx

# Reference wiring to replicate (options -> participants -> computeResults -> ResultsGrid)
@src/app/a/[adminUrlId]/page.tsx

# The component being reused (already omits email/tokens; owns its empty state)
@src/components/results-grid.tsx

# Participant-safe queries + pure aggregator
@src/lib/db/queries.ts
@src/lib/results.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add read-only "Current results" section to the thanks page</name>
  <files>src/app/p/[participantUrlId]/thanks/page.tsx</files>
  <action>
Add the results wiring and section to the existing ThanksPage RSC, mirroring the
admin page's pattern exactly (admin page lines 42-44 and 147-155 are the
reference).

1. Imports: add `getOptionsForPoll` and `getResultsForPoll` to the existing
   `@/lib/db/queries` import; add `import { computeResults } from "@/lib/results";`
   and `import { ResultsGrid } from "@/components/results-grid";`.

2. Data fetch: after the existing `if (!editToken) notFound();` guard (so no DB
   work happens on the notFound path), and reusing the already-resolved
   `poll.id`, add:
   - `const options = await getOptionsForPoll(poll.id);`
   - `const participants = await getResultsForPoll(poll.id);`
   - `const results = computeResults(participants, options);`
   These are the three participant-safe reads the admin page uses; `getResultsForPoll`
   omits email/tokens, so nothing sensitive enters this surface.

3. Render: append a new section as the LAST child of the `<main>`, AFTER the
   existing "No email was sent — save this link now." paragraph (the personal-link
   Card and its save-note stay first, keeping the save-your-link urgency intact).
   Match the admin page's results container: a `<div className="flex flex-col gap-4">`
   wrapping an `<h2 className="text-2xl font-semibold leading-snug">` reading
   "Current results", a short muted lead paragraph (suggested:
   "See how the group's availability is shaping up so far." —
   `<p className="text-base text-muted-foreground">`), then
   `<ResultsGrid options={options} participants={participants} results={results} />`.

Do NOT add a conditional around ResultsGrid — it owns its own empty state.
(Note: the just-submitted participant is always counted by `getResultsForPoll`,
so the empty state is effectively unreachable here; that's fine — no special
handling needed.) Do NOT add `admin_url_id` or any token to this file. Do NOT
add any DB write or migration — every added call is a read.
  </action>
  <verify>
    <automated>cd /home/dave/repos/LFG && DATABASE_URL="postgres://user:pass@localhost:5432/lfg" npm test</automated>
    <automated>cd /home/dave/repos/LFG && npm run build</automated>
    <automated>cd /home/dave/repos/LFG && grep -n "ResultsGrid" src/app/p/\[participantUrlId\]/thanks/page.tsx</automated>
    <automated>cd /home/dave/repos/LFG && test -z "$(grep -n 'admin_url_id\|adminUrlId\|getPollByAdminUrlId\|getPollWithWinningOption' src/app/p/\[participantUrlId\]/thanks/page.tsx)" && echo NO_ADMIN_TOKEN_OK</automated>
    <automated>cd /home/dave/repos/LFG && test -z "$(grep -nE 'db\.(insert|update|delete)|drizzle-kit|\.execute\(' src/app/p/\[participantUrlId\]/thanks/page.tsx)" && echo READ_ONLY_OK</automated>
    <automated>cd /home/dave/repos/LFG && test -z "$(git status --porcelain drizzle/ 2>/dev/null)" && echo NO_MIGRATION_OK</automated>
  </verify>
  <done>
Full test suite is green (`npm test`) and the production build succeeds
(`npm run build`, which typechecks the new imports and the ResultsGrid props
against the exact shapes returned by the participant-safe queries and
computeResults). The thanks page renders a "Current results" section with
ResultsGrid below the personal-link Card. Grep gates pass: no admin
token/query (NO_ADMIN_TOKEN_OK), no DB write in the file (READ_ONLY_OK), no new
migration under drizzle/ (NO_MIGRATION_OK). Code committed as a single atomic
commit (e.g. `feat(260703-pdt): show current poll results on participant thanks page`).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| participant browser → thanks RSC → DB | Anyone holding the participant link (an unguessable share token) reaches this surface; the RSC-serialized payload is visible to the client. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-pdt-01 | Information Disclosure | thanks page results reads | mitigate | Use only participant-safe queries: `getResultsForPoll` omits email/edit_token/admin_url_id, `getOptionsForPoll` selects id/date/startTime/position, `getPollByParticipantUrlId` omits admin_url_id. Verified by the grep gate that no admin query/token is referenced. |
| T-pdt-02 | Information Disclosure | ResultsGrid props | mitigate | ResultsGrid accepts no email prop and renders no participant email or token (SPEC Prohibition #1); it receives only { options, participants(id/name/votes), results }. |
| T-pdt-03 | Elevation of Privilege | edit-token bearer credential | accept | The existing cookie guard (`notFound()` when the `lfg_edit_*` cookie is absent) is unchanged; results are keyed by `poll.id`, never by a client-supplied id. Participant links are group-shared by design (todo). No new privilege surface. |

No package-manager installs in this plan — no supply-chain checkpoint required.
</threat_model>

<verification>
- `npm test` full suite green (existing results-grid.test.tsx + results.test.ts
  cover the reused component and aggregator; DB-backed vitest needs
  `DATABASE_URL` exported per project memory).
- `npm run build` green — confirms the RSC compiles and ResultsGrid props
  typecheck against `GridOption[]` / `ResultsParticipant[]` / `OptionResult[]`.
- No new test file added: the page is an async RSC (cookies/headers/DB) that is
  awkward to unit-test; the reused ResultsGrid and computeResults already have
  coverage and this wiring mirrors the already-covered admin page.

## Edge-probe resolutions (folded, source-verified)
- **Tied best-day co-leaders (adjacency):** DISMISSED — handled by `computeResults`
  (all co-leaders flagged `isBest`), covered by `results.test.ts`; reused unchanged.
- **Row/column ordering (ordering):** DISMISSED — participant rows = createdAt-asc
  (getResultsForPoll), option columns = chronological (getOptionsForPoll); same
  deterministic orders the admin page already uses.
- **Empty input (empty):** DISMISSED on this surface — empty-participants is owned
  by ResultsGrid's "No responses yet" state (covered by results-grid.test.tsx), but
  the just-submitted participant is always counted here so it is unreachable;
  zero-options is impossible per the createPoll candidate-dates invariant.
- **Must-NOT leak email/tokens (PDT-02):** COVERED — threat_model T-pdt-01/02 +
  NO_ADMIN_TOKEN_OK grep gate; structurally no query on this surface selects
  email/edit_token/admin_url_id.
- **Read-only / no migration (PDT-03):** COVERED — READ_ONLY_OK + NO_MIGRATION_OK
  grep gates; all added calls are reads and computeResults is pure.

## Prohibition-probe resolution (source-verified)
- **Could silently become a stale cached snapshot** that omits the just-submitted
  vote: DISMISSED — the page `await cookies()` and `await headers()`, which force
  dynamic rendering in Next 16, so each request re-reads the DB and reflects the
  vote committed before the redirect. No `revalidate`/static-cache directive is
  added.

- No DB migration — read-only against the existing schema.
</verification>

<success_criteria>
- The thanks page renders a "Current results" section (heading + lead sentence +
  ResultsGrid) below the personal-link Card.
- Results are fed by getOptionsForPoll + getResultsForPoll + computeResults keyed
  by poll.id — identical to the admin page wiring — and are always fresh.
- No email, edit token, or admin_url_id reaches the thanks surface.
- `npm test` and `npm run build` both pass; all grep gates pass; change committed
  atomically with no migration.
</success_criteria>

<output>
Create `.planning/quick/260703-pdt-show-current-poll-results-on-participant/260703-pdt-SUMMARY.md` when done.
</output>

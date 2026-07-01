// Reusable read helpers for the admin/participant pages (01-02 Task 3 imports
// these). Two critical invariants live here:
//
//  - getPollByParticipantUrlId selects ONLY participant-safe columns and
//    DELIBERATELY OMITS admin_url_id — the participant route and its payload
//    must never carry the admin token (D-09 / prohibition P2).
//  - options are returned chronologically (ORDER BY date, start_time) so the
//    pages render oldest-to-newest without re-sorting (POLL-03). Dates stay
//    'YYYY-MM-DD' strings end-to-end — never a JS Date (D-11 / P3).
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { eq, asc, sql, and } from "drizzle-orm";

/** Full poll row by admin token (admin route is the management surface). */
export async function getPollByAdminUrlId(adminUrlId: string) {
  const [poll] = await db
    .select()
    .from(polls)
    .where(eq(polls.adminUrlId, adminUrlId))
    .limit(1);
  return poll ?? null;
}

/**
 * Poll row by participant token, selecting participant-safe columns only.
 * `adminUrlId` is intentionally NOT selected so it can never leak into the
 * participant page HTML or its serialized RSC payload (D-09 / P2).
 */
export async function getPollByParticipantUrlId(participantUrlId: string) {
  const [poll] = await db
    .select({
      id: polls.id,
      participantUrlId: polls.participantUrlId,
      title: polls.title,
      description: polls.description,
      location: polls.location,
      status: polls.status,
      createdAt: polls.createdAt,
    })
    .from(polls)
    .where(eq(polls.participantUrlId, participantUrlId))
    .limit(1);
  return poll ?? null;
}

/**
 * Candidate options for a poll, ordered chronologically. A date-only option
 * (NULL start_time = "the whole day") precedes a timed option on the same day,
 * so we order ASC with an explicit NULLS FIRST on start_time (Postgres defaults
 * to NULLS LAST). This matches the `position` assigned at insert time in
 * createPoll, keeping stored order and query order in agreement
 * (POLL-03 / POLL-04).
 */
export async function getOptionsForPoll(pollId: string) {
  return db
    .select({
      id: options.id,
      date: options.date,
      startTime: options.startTime,
      position: options.position,
    })
    .from(options)
    .where(eq(options.pollId, pollId))
    .orderBy(asc(options.date), sql`${options.startTime} asc nulls first`);
}

/**
 * Resolve a participant by an EXACT edit-token equality match (VOTE-06 /
 * RESEARCH Pattern 5). The editToken is an unauthenticated bearer credential —
 * this is the sole ownership authority for both the edit-route RSC and
 * updateResponse; a client-supplied participantId is NEVER trusted.
 *
 * Selects participant-safe columns only: `id`/`pollId` (so the caller can
 * cross-check `pollId === poll.id` and reject a token used on the wrong poll's
 * edit URL) plus `name`/`email` for preload. The `edit_token` is DELIBERATELY
 * NOT re-selected — it never needs to flow back into a rendered payload. Returns
 * the row or null (null => unknown/empty token => the caller notFound()s, giving
 * an identical 404 for a malformed and a valid-but-unknown token, no oracle).
 */
export async function getParticipantByEditToken(editToken: string) {
  const [participant] = await db
    .select({
      id: participants.id,
      pollId: participants.pollId,
      name: participants.name,
      email: participants.email,
    })
    .from(participants)
    .where(eq(participants.editToken, editToken))
    .limit(1);
  return participant ?? null;
}

/**
 * The participant's prior vote states as a `Record<optionId, state>`, ready to
 * seed AvailabilityGrid's `initial` prop (VOTE-05 preload). Selects only
 * optionId/state — no participant identity or token leaks through this shape.
 */
export async function getVotesForParticipant(
  participantId: string,
): Promise<Record<string, string>> {
  const rows = await db
    .select({ optionId: votes.optionId, state: votes.state })
    .from(votes)
    .where(eq(votes.participantId, participantId));
  return Object.fromEntries(rows.map((r) => [r.optionId, r.state]));
}

/**
 * Admin-only results read (DASH-01..04). Returns every participant for the poll
 * ordered by createdAt asc (submission order), each with a
 * `Record<optionId, state>` of their votes. Selects participant-safe columns
 * ONLY — `id`/`name` plus the vote `optionId`/`state`. It DELIBERATELY OMITS
 * `email`, `edit_token`, and `admin_url_id` (SPEC Prohibition #1/#2): a
 * screenshot-able admin grid must never leak an email, and the results payload
 * must never carry a token (preserves the three-token model).
 *
 * `participants.createdAt` is selected ONLY to drive the ORDER BY — it is NOT
 * projected into the returned shape. It is a real JS `Date` (not a mode:"string"
 * column) and must not cross the RSC->client boundary as a prop (Pitfall 2). The
 * returned shape is fully JSON-serializable: `{ id, name, votes }`.
 *
 * LEFT JOIN so a participant with zero vote rows still appears (with an empty
 * `votes` record) — never start the query FROM votes, which structurally cannot
 * represent a voteless participant (Pitfall 3). computeResults/ResultsGrid then
 * gap-fill each missing (participant, option) cell to "no" (D3-03). The join
 * condition also matches votes.pollId so the planner may use votes_poll_id_idx.
 *
 * No throw / empty-array-on-miss, matching the other read helpers here.
 */
export async function getResultsForPoll(pollId: string) {
  const rows = await db
    .select({
      participantId: participants.id,
      participantName: participants.name,
      optionId: votes.optionId,
      state: votes.state,
    })
    .from(participants)
    .leftJoin(
      votes,
      and(eq(votes.participantId, participants.id), eq(votes.pollId, pollId)),
    )
    .where(eq(participants.pollId, pollId))
    .orderBy(asc(participants.createdAt));

  const byParticipant = new Map<
    string,
    { id: string; name: string; votes: Record<string, string> }
  >();
  for (const r of rows) {
    let p = byParticipant.get(r.participantId);
    if (!p) {
      p = { id: r.participantId, name: r.participantName, votes: {} };
      byParticipant.set(r.participantId, p);
    }
    // A LEFT JOIN miss yields null optionId/state -> leave the empty record.
    if (r.optionId && r.state) p.votes[r.optionId] = r.state;
  }
  // Map preserves insertion order = the SQL createdAt-asc order.
  return [...byParticipant.values()];
}

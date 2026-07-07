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
import { polls, options, participants, votes, invitations } from "@/lib/db/schema";
import { eq, asc, desc, sql, and, isNotNull } from "drizzle-orm";

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
 * The creator-notification target for the PARTICIPANT actions (t7e). Returns
 * `{ adminUrlId, creatorEmail }` for a poll keyed by its id, or null for an
 * unknown poll.
 *
 * This is the SOLE server-side path that resolves admin_url_id inside the
 * participant actions. getPollByParticipantUrlId / getParticipantByEditToken
 * DELIBERATELY omit admin_url_id (D-09 / P2) so it can never reach the
 * participant page or its RSC payload; submitResponse / updateResponse call this
 * helper only to build the CREATOR's notification email, and the returned
 * adminUrlId is used ONLY inside an after() callback — it must NEVER be returned
 * to the page, placed in RSC props, or otherwise reach the participant's browser
 * (three-token discipline, D-09 / T-t7e-01). Selects ONLY these two columns,
 * mirroring the getVoterEmailsForPoll no-leak column-selection discipline;
 * creator_email is read by no participant-facing query (T-t7e-02).
 */
export async function getPollAdminNotifyTargets(pollId: string) {
  const [row] = await db
    .select({
      adminUrlId: polls.adminUrlId,
      creatorEmail: polls.creatorEmail,
    })
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);
  return row ?? null;
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

/**
 * The finalization-notify target (FNL-03 / T-04-08). Returns `{ name, email }`
 * for EVERY participant of this poll that has a stored email — voters without an
 * email are excluded by the `email IS NOT NULL` predicate, so closePoll simply
 * never notifies them (they still count for the close). The `email` column is
 * nullable, but the filter guarantees a non-null value at runtime.
 *
 * Selects ONLY `name`/`email`. It DELIBERATELY OMITS `edit_token` and
 * `admin_url_id` (T-04-08): a finalization notice must carry neither the
 * participant's private edit credential nor the poll's admin token — the same
 * three-token discipline getResultsForPoll and getParticipantByEditToken keep.
 * No throw / empty-array on miss, matching the other read helpers here.
 */
export async function getVoterEmailsForPoll(pollId: string) {
  return db
    .select({ name: participants.name, email: participants.email })
    .from(participants)
    .where(
      and(eq(participants.pollId, pollId), isNotNull(participants.email)),
    );
}

/**
 * The finalized-poll read for the admin page's "Poll finalized" Card and the
 * finalization email body. Returns the full poll row PLUS the winning option's
 * `date`/`startTime`, resolved via a LEFT JOIN on `winning_option_id`. The join
 * is a LEFT JOIN so an OPEN poll (winning_option_id NULL) still returns its row
 * with `winningDate`/`winningStartTime` = null — the caller branches on
 * `poll.status`. A single-statement read (no interactive transaction, neon-http
 * safe). Returns null when no poll matches the admin token.
 */
/**
 * The finalized-poll read for the hosted `.ics` route (`/p/{participantUrlId}/
 * event.ics`). Keyed by the PARTICIPANT token — the finalization-email recipient
 * already holds it, and the winning date is not secret, so no admin token is
 * required. LEFT JOIN options on winning_option_id, exactly like
 * getPollWithWinningOption, but keyed by participant_url_id and selecting ONLY
 * participant-safe columns: it DELIBERATELY OMITS admin_url_id and every token
 * (the same no-leak discipline getPollByParticipantUrlId keeps). The route
 * branches on `status`/`winningOptionId`/`winningDate` to 404 an open/undecided/
 * unknown poll with an IDENTICAL 404 (no oracle). Returns the row or null.
 */
export async function getFinalizedPollByParticipantUrlId(
  participantUrlId: string,
) {
  const [row] = await db
    .select({
      id: polls.id,
      title: polls.title,
      description: polls.description,
      status: polls.status,
      winningOptionId: polls.winningOptionId,
      winningDate: options.date,
      winningStartTime: options.startTime,
    })
    .from(polls)
    .leftJoin(options, eq(options.id, polls.winningOptionId))
    .where(eq(polls.participantUrlId, participantUrlId))
    .limit(1);
  return row ?? null;
}

export async function getPollWithWinningOption(adminUrlId: string) {
  const [row] = await db
    .select({
      id: polls.id,
      participantUrlId: polls.participantUrlId,
      adminUrlId: polls.adminUrlId,
      title: polls.title,
      description: polls.description,
      location: polls.location,
      status: polls.status,
      winningOptionId: polls.winningOptionId,
      // organizerId (LD-4) so the admin page can decide whether to render the
      // subscribe card and build the feed URL. Null for legacy polls (card hidden).
      organizerId: polls.organizerId,
      createdAt: polls.createdAt,
      winningDate: options.date,
      winningStartTime: options.startTime,
    })
    .from(polls)
    .leftJoin(options, eq(options.id, polls.winningOptionId))
    .where(eq(polls.adminUrlId, adminUrlId))
    .limit(1);
  return row ?? null;
}

/**
 * The organizer calendar-feed read (LD-4 / T-sn2-01). Returns every FINALIZED
 * poll (status "closed" AND a non-null winning option) for one organizer token,
 * ordered by winning date asc — then start_time asc NULLS FIRST, then a STABLE
 * `polls.id` tiebreaker so two finalized polls sharing the same date+time have a
 * deterministic feed order (EP-FEED-ORDER; prevents non-deterministic ICS output
 * and flaky tests).
 *
 * Selects PARTICIPANT-SAFE columns ONLY — id/title/description/winningOptionId
 * plus the winning option's date/startTime. It DELIBERATELY OMITS admin_url_id,
 * participant_url_id, edit_token, participant names/emails, and votes: the feed
 * is a public bearer-token surface and must leak none of them (LD-7 / T-sn2-01).
 * An OPEN poll (winning_option_id NULL) is excluded by isNotNull. An unknown
 * organizerId matches no rows → Drizzle returns [] (no throw, no oracle).
 */
export async function getFinalizedPollsByOrganizerId(organizerId: string) {
  return db
    .select({
      id: polls.id,
      title: polls.title,
      description: polls.description,
      winningOptionId: polls.winningOptionId,
      winningDate: options.date,
      winningStartTime: options.startTime,
    })
    .from(polls)
    .leftJoin(options, eq(options.id, polls.winningOptionId))
    .where(
      and(
        eq(polls.organizerId, organizerId),
        eq(polls.status, "closed"),
        isNotNull(polls.winningOptionId),
      ),
    )
    .orderBy(
      asc(options.date),
      sql`${options.startTime} asc nulls first`,
      asc(polls.id),
    );
}

/**
 * The "Your polls" dashboard read (MYP-01 / MYP-04 / MYP-05 / MYP-07). Returns
 * EVERY poll — open AND closed — for one `lfg_organizer` token, newest-first,
 * with per-poll aggregate counts. Unlike getFinalizedPollsByOrganizerId (the
 * calendar feed), an OPEN poll (winning_option_id NULL) IS included: the LEFT
 * JOIN on winning_option_id simply yields winningDate/winningStartTime = null
 * for it, and the caller branches on `status`.
 *
 * ORDER BY created_at DESC with a STABLE `polls.id` tiebreaker (MYP-01) so two
 * polls sharing the same created_at have a deterministic order across repeated
 * calls (mirrors the feed's EP-FEED-ORDER; prevents flaky ordering).
 *
 * Selects PARTICIPANT-SAFE columns ONLY — the organizer owns these admin links,
 * so `adminUrlId` IS selected, but the shape DELIBERATELY OMITS
 * participant_url_id, edit_token, participant names/emails, and creator_email:
 * the dashboard renders per-poll summaries without exposing any participant
 * identity or third token (T-06-01 / PROH-2). `optionCount`/`responseCount` are
 * correlated `COUNT(*)` subqueries cast to `::int` so neon returns a JS number
 * (never a bigint string) and an empty poll yields 0, never null (MYP-04).
 *
 * A single-statement read (no interactive transaction, neon-http safe). Guards
 * MYP-05 up front: an empty or whitespace-only organizerId returns [] BEFORE any
 * query is issued — an empty/whitespace token is never a wildcard, mirroring the
 * create-poll organizer normalization. The exact `eq(polls.organizerId,
 * organizerId)` predicate is a SQL `= $1` that never matches a NULL organizer_id
 * (MYP-07 / PROH-1), so a null-organizer poll can never appear.
 */
/**
 * The admin-only respondent-tracking read (RESP-01). Returns ONE row per
 * invitation on the poll — the invited `email` (as originally entered) plus a
 * `responded` flag — ordered by `invitedAt` asc (stable send order) with a
 * STABLE `invitations.id` tiebreaker so two invitations sharing an `invited_at`
 * have a deterministic order across repeated calls (prevents flaky ordering).
 *
 * `responded` is a correlated EXISTS: true iff SOME participant ON THE SAME POLL
 * has a case-insensitively matching email. The subquery is correlated to
 * `invitations.poll_id` (CROSS-POLL ISOLATION, T-07-10) — a same-email voter on
 * a DIFFERENT poll can never flip this poll's invitation to responded. Because
 * `participants.email` is nullable and `lower(NULL) = lower(x)` is NULL (never
 * true), a participant with no email never matches — the correct, accepted
 * limitation (CONTEXT RESP-01).
 *
 * This is a NEW admin-only read: it deliberately RETURNS invitation emails (the
 * organizer needs to SEE who was invited), but — exactly like getVoterEmailsForPoll
 * / getPollAdminNotifyTargets — it is NEVER called by any participant-facing
 * route, and no participant-facing query selects the invitations table (D-09
 * no-leak). No throw / empty-array on miss, matching the other read helpers here.
 */
export async function getInvitationTrackingForPoll(
  pollId: string,
): Promise<{ email: string; responded: boolean }[]> {
  return db
    .select({
      email: invitations.email,
      // Correlated EXISTS written with EXPLICIT literal table qualifiers rather
      // than drizzle `${column}` interpolation: this query's main FROM has a
      // SINGLE table (invitations), so drizzle omits ALL column qualifiers when
      // rendering, which would collapse the correlation to `poll_id = poll_id`
      // (trivially true). Hardcoding `p.*` (subquery) vs `invitations.*` (outer)
      // keeps the correlation — and the cross-poll isolation — unambiguous.
      responded: sql<boolean>`exists (select 1 from participants p where p.poll_id = invitations.poll_id and lower(p.email) = lower(invitations.email))`,
    })
    .from(invitations)
    .where(eq(invitations.pollId, pollId))
    .orderBy(asc(invitations.invitedAt), asc(invitations.id));
}

export async function getPollsByOrganizerId(organizerId: string) {
  // MYP-05: empty/whitespace token is ABSENT, never a wildcard — no query.
  if (!organizerId || !organizerId.trim()) return [];

  return db
    .select({
      adminUrlId: polls.adminUrlId,
      title: polls.title,
      status: polls.status,
      winningDate: options.date,
      winningStartTime: options.startTime,
      optionCount: sql<number>`(select count(*) from ${options} where ${options.pollId} = ${polls.id})::int`,
      responseCount: sql<number>`(select count(*) from ${participants} where ${participants.pollId} = ${polls.id})::int`,
    })
    .from(polls)
    .leftJoin(options, eq(options.id, polls.winningOptionId))
    .where(eq(polls.organizerId, organizerId))
    .orderBy(desc(polls.createdAt), asc(polls.id));
}

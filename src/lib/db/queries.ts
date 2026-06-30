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
import { polls, options } from "@/lib/db/schema";
import { eq, asc, sql } from "drizzle-orm";

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

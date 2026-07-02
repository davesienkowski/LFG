// Hosted iCalendar route `/p/[participantUrlId]/event.ics` (CAL-01..10). A GET
// Route Handler that serves `text/calendar` for the winning date of a CLOSED
// poll, so the finalization email's "Add to Apple / Outlook Calendar" link (and
// the attached event.ics) resolve to a real file. iOS Mail / Apple Calendar /
// Outlook consume this directly.
//
// Load-bearing invariants:
//  - Keyed by the PARTICIPANT token only (getFinalizedPollByParticipantUrlId,
//    which OMITS admin_url_id) — the route never touches or exposes the admin
//    token (D-09 / P2).
//  - Serves ONLY a closed/finalized poll. A missing row, a non-"closed" status,
//    a null winningOptionId, or a null winning date all return an IDENTICAL bare
//    404 — open, undecided, and unknown polls are indistinguishable (no oracle),
//    mirroring the app's notFound() discipline.
//  - Best-effort build: any buildIcs throw degrades to a 404, never leaking an
//    internal error.
//  - Cache-Control: no-store (the poll can close/re-open; never cache a 404 as a
//    200 or vice-versa at a shared cache).
import { getFinalizedPollByParticipantUrlId } from "@/lib/db/queries";
import { buildIcs } from "@/lib/calendar/links";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ participantUrlId: string }> },
) {
  const { participantUrlId } = await params;
  const poll = await getFinalizedPollByParticipantUrlId(participantUrlId);

  // Identical 404 for unknown / open / undecided — no oracle.
  if (
    !poll ||
    poll.status !== "closed" ||
    !poll.winningOptionId ||
    !poll.winningDate
  ) {
    return new Response(null, { status: 404 });
  }

  let ics: string;
  try {
    ics = buildIcs({
      title: poll.title,
      description: poll.description,
      date: poll.winningDate,
      // DB returns 'HH:MM:SS' for a timed option; slice to the 'HH:MM' the
      // builder expects. Null (all-day) passes through unchanged.
      startTime: poll.winningStartTime ? poll.winningStartTime.slice(0, 5) : null,
      uid: `${poll.id}-${poll.winningOptionId}@lfg`,
    });
  } catch {
    // Best-effort: a builder throw must never leak an internal error — 404.
    return new Response(null, { status: 404 });
  }

  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="event.ics"',
      "Cache-Control": "no-store",
    },
  });
}

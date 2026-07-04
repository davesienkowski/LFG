// Organizer calendar-feed route `/feed/[organizerId]/calendar.ics` (LD-3 / LD-7).
// A GET Route Handler that serves a subscribable `text/calendar` VCALENDAR with
// one VEVENT per FINALIZED (closed + winner) poll under the organizer token. The
// organizer adds this feed once (webcal:// from the admin card) and every future
// "Book it" appears automatically. The `calendar.ics` folder is the final path
// segment, mirroring src/app/p/[participantUrlId]/event.ics/route.ts.
//
// Load-bearing invariants:
//  - Keyed by the organizer bearer token via getFinalizedPollsByOrganizerId,
//    which selects participant-safe columns ONLY — the feed never exposes an
//    admin/participant/edit token, a participant name/email, or a vote (LD-7 /
//    T-sn2-01).
//  - ALWAYS 200. An unknown token and an organizer with zero closed polls both
//    yield an IDENTICAL empty VCALENDAR — no 404 oracle distinguishes a real
//    organizer from a random token, so a client can subscribe BEFORE the first
//    poll closes (LD-3 / T-sn2-02).
//  - EP-FEED-EMPTY: a finalized row with a missing winning date is FILTERED OUT
//    before build, so one malformed row can never blank the whole feed. The
//    try/catch is only a last-resort backstop (T-sn2-05).
//  - Cache-Control: no-store — polls open/close; never cache the feed.
import { getFinalizedPollsByOrganizerId } from "@/lib/db/queries";
import { buildVcalendar } from "@/lib/calendar/links";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ organizerId: string }> },
) {
  const { organizerId } = await params;

  let body: string;
  try {
    const rows = await getFinalizedPollsByOrganizerId(organizerId);
    const events = rows
      // EP-FEED-EMPTY defensive filter: the query already guarantees a winning
      // option (isNotNull), but drop any row with a falsy winning date so a
      // single malformed/edge row can never make veventLines throw and blank the
      // ENTIRE feed.
      .filter((r) => r.winningDate)
      .map((r) => ({
        title: r.title,
        description: r.description,
        date: r.winningDate as string,
        // DB returns 'HH:MM:SS' for a timed option; slice to the 'HH:MM' the
        // builder expects (exactly like the event.ics route). Null passes through.
        startTime: r.winningStartTime ? r.winningStartTime.slice(0, 5) : null,
        // Stable per-poll UID so subscribed clients UPDATE rather than duplicate
        // events across refreshes (EP-FEED-ORDER / T-sn2 dedup key).
        uid: `${r.id}-${r.winningOptionId}@lfg`,
      }));
    body = buildVcalendar(events, { calName: "My LFG booked dates" });
  } catch {
    // Last-resort backstop: any throw degrades to a valid empty 200 — never leak
    // an internal error, never a distinguishing status (preserves no-oracle).
    body = buildVcalendar([], { calName: "My LFG booked dates" });
  }

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Presentational poll row for the `/polls` dashboard (MYP-02). Pure/server
// component — no DB, no cookies, no client JS — so it composes cleanly in the
// page-wiring plan (06-03) and the admin-swap plan (06-04).
//
// Encodes two ★ edge rules in one place:
//   - Pluralization: "1 date" vs "{n} dates", "1 response" vs "{n} responses",
//     and "0 responses" always renders (never blank). Compares the NUMERIC count
//     `=== 1` (the query casts COUNT to int, so these arrive as JS numbers).
//   - Closed-poll null-winningDate fallback: a closed poll with a null winning
//     date still renders the "Booked" badge and does NOT crash (mirrors the feed's
//     EP-FEED-EMPTY defensive handling) — we guard on winningDate before ever
//     calling formatDateWithTime.
//
// Dates render via formatDateWithTime (string-based, timezone-safe D-11/P3) —
// never new Date() on the date-only value. DB startTime is 'HH:MM:SS'; slice to
// 'HH:MM' before passing (mirrors the admin page).
import Link from "next/link";
import { formatDateWithTime } from "@/lib/format-date";

// The participant-safe shape returned by getPollsByOrganizerId — EXACTLY these 7
// columns (PROH-2 / T-06-07). It structurally cannot carry a participant
// name/email, edit token, or participant URL: those fields simply do not exist
// on the type, so the component cannot leak them.
export type PollListRow = {
  adminUrlId: string;
  title: string;
  status: string;
  winningDate: string | null;
  winningStartTime: string | null;
  optionCount: number;
  responseCount: number;
};

export function PollListItem({ poll }: { poll: PollListRow }) {
  const isClosed = poll.status === "closed";

  // Summary line: closed → the booked date (only when winningDate is non-null —
  // defensive fallback renders nothing on a null date, no crash); open → the
  // candidate-count. Pluralization is a numeric `=== 1` compare.
  const bookedDate =
    isClosed && poll.winningDate
      ? formatDateWithTime(
          poll.winningDate,
          poll.winningStartTime ? poll.winningStartTime.slice(0, 5) : null,
        )
      : null;
  const candidateSummary = !isClosed
    ? `${poll.optionCount} ${poll.optionCount === 1 ? "date" : "dates"}`
    : null;
  const responseSummary = `${poll.responseCount} ${
    poll.responseCount === 1 ? "response" : "responses"
  }`;

  return (
    <Link
      href={`/a/${poll.adminUrlId}`}
      className="flex flex-col gap-1 rounded-xl bg-card p-5 text-card-foreground ring-1 ring-foreground/10 transition-colors hover:bg-muted"
    >
      <div className="flex items-center gap-3">
        <span className="text-lg font-semibold leading-snug">{poll.title}</span>
        {isClosed ? (
          <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
            Booked
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
            Open
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        {bookedDate ? <span>{bookedDate}</span> : null}
        {candidateSummary ? <span>{candidateSummary}</span> : null}
        <span>{responseSummary}</span>
      </div>
    </Link>
  );
}

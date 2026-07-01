// Admin page `/a/[adminUrlId]` (UI-SPEC Surface 2). RSC: resolve the poll by
// admin token, 404 on miss, render the poll, chronological candidate dates, and
// BOTH share links. The admin link card always carries the amber "Keep private"
// badge AND the do-not-share warning copy (UI-P1) — never the link alone.
//
// Dates render via formatDateWithTime (string-based, D-11/P3) — never new Date()
// on the date-only value. DB returns start_time as 'HH:MM:SS'; we slice to
// 'HH:MM' for the formatter.
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getPollByAdminUrlId,
  getOptionsForPoll,
  getResultsForPoll,
} from "@/lib/db/queries";
import {
  resolveBaseUrl,
  buildParticipantUrl,
  buildAdminUrl,
} from "@/lib/urls";
import { formatDateWithTime } from "@/lib/format-date";
import { computeResults } from "@/lib/results";
import { PollSummary } from "@/components/poll-summary";
import { CopyLinkButton } from "@/components/copy-link-button";
import { ResultsGrid } from "@/components/results-grid";
import { Card } from "@/components/ui/card";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ adminUrlId: string }>;
}) {
  const { adminUrlId } = await params;

  const poll = await getPollByAdminUrlId(adminUrlId);
  if (!poll) notFound();

  const options = await getOptionsForPoll(poll.id);
  const participants = await getResultsForPoll(poll.id);
  const results = computeResults(participants, options);

  const h = await headers();
  const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  const participantUrl = buildParticipantUrl(base, poll.participantUrlId);
  const adminLink = buildAdminUrl(base, poll.adminUrlId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">{poll.title}</h1>
        <PollSummary
          description={poll.description}
          location={poll.location}
        />
      </div>

      <ul className="flex flex-col gap-1">
        {options.map((opt) => (
          <li key={opt.id} className="text-base">
            {formatDateWithTime(
              opt.date,
              opt.startTime ? opt.startTime.slice(0, 5) : null,
            )}
          </li>
        ))}
      </ul>

      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold leading-snug">Share your poll</h2>

        {/* Participant link — safe to share */}
        <Card className="flex flex-col gap-2 p-6">
          <span className="text-sm font-semibold">Participant link</span>
          <span className="text-base text-muted-foreground">
            Share this link with your group
          </span>
          <span className="font-mono text-sm truncate">{participantUrl}</span>
          <div>
            <CopyLinkButton
              url={participantUrl}
              label="Copy participant link"
            />
          </div>
        </Card>

        {/* Admin link — private management credential (UI-P1) */}
        <Card className="flex flex-col gap-2 p-6 border-amber-200">
          <span className="flex items-center gap-2">
            <span className="text-sm font-semibold">Admin link</span>
            <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 text-xs font-semibold">
              Keep private
            </span>
          </span>
          <span className="text-base text-muted-foreground">
            Do not share this link. It grants full management access to this
            poll.
          </span>
          <span className="font-mono text-sm truncate">{adminLink}</span>
          <div>
            <CopyLinkButton url={adminLink} label="Copy admin link" />
          </div>
        </Card>
      </div>

      {/* Results (DASH-01..05) — appended as the last section, below Share. */}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold leading-snug">Results</h2>
        <ResultsGrid
          options={options}
          participants={participants}
          results={results}
        />
      </div>
    </main>
  );
}

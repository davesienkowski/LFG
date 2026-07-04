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
  getPollWithWinningOption,
  getOptionsForPoll,
  getResultsForPoll,
} from "@/lib/db/queries";
import {
  resolveBaseUrl,
  buildParticipantUrl,
  buildAdminUrl,
  buildOrganizerFeedUrl,
  buildOrganizerWebcalUrl,
} from "@/lib/urls";
import { formatDateWithTime } from "@/lib/format-date";
import { computeResults } from "@/lib/results";
import { PollSummary } from "@/components/poll-summary";
import { CopyLinkButton } from "@/components/copy-link-button";
import { ResultsGrid } from "@/components/results-grid";
import { InviteByEmailForm } from "@/components/invite-by-email-form";
import { BookItControl } from "@/components/book-it-control";
import { Card } from "@/components/ui/card";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ adminUrlId: string }>;
}) {
  const { adminUrlId } = await params;

  const poll = await getPollWithWinningOption(adminUrlId);
  if (!poll) notFound();

  const isClosed = poll.status === "closed";

  const options = await getOptionsForPoll(poll.id);
  const participants = await getResultsForPoll(poll.id);
  const results = computeResults(participants, options);

  const h = await headers();
  const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  const participantUrl = buildParticipantUrl(base, poll.participantUrlId);
  const adminLink = buildAdminUrl(base, poll.adminUrlId);

  // Server-only email-configured check (MAIL-03): unset, "", and "none" are all
  // treated identically as unconfigured. Never a client check — the flag never
  // crosses to the browser.
  const emailProvider = process.env.EMAIL_PROVIDER;
  const emailConfigured =
    emailProvider !== undefined &&
    emailProvider !== "" &&
    emailProvider !== "none";
  // No inviting to a closed poll (04-02 finalize closes the poll).
  const showInvite = !isClosed;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold leading-tight">{poll.title}</h1>
          {/* "Booked" emerald pill — only once the poll is finalized (closed). */}
          {isClosed ? (
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              Booked
            </span>
          ) : null}
        </div>
        <PollSummary
          description={poll.description}
          location={poll.location}
        />
      </div>

      <ul className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <li
            key={opt.id}
            className="inline-flex items-center rounded-full border bg-muted px-3 py-1 text-sm"
          >
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

        {/* Subscribe to the booked-dates calendar feed (LD-6). Rendered ONLY when
            the poll has an organizer token — legacy polls (organizerId null) hide
            it entirely. NEUTRAL severity: it is an unguessable bearer link but
            exposes only booked dates/titles (no participant data), so it carries
            NO amber border and NO "Keep private" badge (LD-7 / T-sn2-04). */}
        {poll.organizerId ? (
          <Card className="flex flex-col gap-2 p-6">
            <span className="text-sm font-semibold">
              Subscribe to your booked-dates calendar
            </span>
            <span className="text-base text-muted-foreground">
              Add this once to your phone/desktop calendar; every poll you
              finalize appears automatically.
            </span>
            <span className="text-sm text-muted-foreground">
              This is a group-shareable link — it shows only booked dates and
              poll titles, never any participant data.
            </span>
            <span className="font-mono text-sm truncate">
              {buildOrganizerFeedUrl(base, poll.organizerId)}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={buildOrganizerWebcalUrl(base, poll.organizerId)}
                className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                Subscribe in calendar
              </a>
              <CopyLinkButton
                url={buildOrganizerFeedUrl(base, poll.organizerId)}
                label="Copy calendar link"
              />
            </div>
          </Card>
        ) : null}

        {/* Invite by email (MAIL-01/02/03). Hidden on a closed poll. When email
            is configured, render the send-invites form; otherwise degrade to the
            explanatory copy-link fallback — the actionable copy button already
            lives in the Participant-link Card above (D-05 / MAIL-03). */}
        {showInvite ? (
          emailConfigured ? (
            <InviteByEmailForm adminUrlId={poll.adminUrlId} />
          ) : (
            <Card className="flex flex-col gap-2 p-6">
              <h3 className="text-2xl font-semibold leading-snug">
                Email isn&apos;t set up
              </h3>
              <p className="text-base text-muted-foreground">
                Copy the participant link above and share it manually.
              </p>
            </Card>
          )
        ) : null}
      </div>

      {/* Results (DASH-01..05) — below Share, above Book it. */}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold leading-snug">Results</h2>
        <ResultsGrid
          options={options}
          participants={participants}
          results={results}
        />
      </div>

      {/* Book it (FNL-01/02/03). Renders EXACTLY ONE of {picker, finalized card}
          based on poll.status — never both, never neither. */}
      {isClosed ? (
        <Card className="flex flex-col gap-2 p-6 border-emerald-200 bg-emerald-50/40">
          <h2 className="text-2xl font-semibold leading-snug">Poll finalized</h2>
          <p className="text-base text-muted-foreground">
            {poll.winningDate
              ? `${formatDateWithTime(
                  poll.winningDate,
                  poll.winningStartTime ? poll.winningStartTime.slice(0, 5) : null,
                )} is booked. `
              : ""}
            {/* Best-effort framing: "should get", NOT "was notified" (D-09). */}
            Everyone who voted and gave an email should get a confirmation.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold leading-snug">Book it</h2>
          <p className="text-base text-muted-foreground">
            Pick the date you&apos;re going with. This closes voting for everyone.
          </p>
          <BookItControl
            adminUrlId={poll.adminUrlId}
            options={options}
            results={results}
          />
        </div>
      )}
    </main>
  );
}

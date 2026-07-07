// Admin page `/a/[adminUrlId]` (UI-SPEC Surface 2). RSC: resolve the poll by
// admin token, 404 on miss, render the poll, chronological candidate dates, and
// BOTH share links. The admin link card always carries the amber "Keep private"
// badge AND the do-not-share warning copy (UI-P1) — never the link alone.
//
// Layout (tv3 + follow-up): a single full-width column (max-w-6xl) stacked as
// header (title + location) -> compact candidate-date echo (small chips) ->
// full-width Results hero -> share/invite -> Book-it. Results spans the full
// content width so the participants × dates table has maximum horizontal room.
// PURE layout — every query, action, and branch is preserved verbatim.
//
// Dates render via formatDateWithTime (string-based, D-11/P3) — never new Date()
// on the date-only value. DB returns start_time as 'HH:MM:SS'; we slice to
// 'HH:MM' for the formatter. The candidate-date echo shows the CONDENSED label
// but carries the FULL date in title + aria-label (a11y + hover, TV3-08).
import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ChevronRight } from "lucide-react";
import {
  getPollWithWinningOption,
  getOptionsForPoll,
  getResultsForPoll,
  getInvitationTrackingForPoll,
} from "@/lib/db/queries";
import {
  resolveBaseUrl,
  buildParticipantUrl,
  buildAdminUrl,
} from "@/lib/urls";
import {
  formatDateWithTime,
  formatDateWithTimeShort,
  formatMonthYear,
} from "@/lib/format-date";
import { computeResults } from "@/lib/results";
import { isVotingOpen } from "@/lib/poll-status";
import type { VoteState } from "@/components/availability-grid";
import { PollSummary } from "@/components/poll-summary";
import { DeadlineControl } from "@/components/deadline-control";
import { OrganizerAvailabilityControl } from "@/components/organizer-availability-control";
import { CopyLinkButton } from "@/components/copy-link-button";
import { ResultsGrid } from "@/components/results-grid";
import { InviteByEmailForm } from "@/components/invite-by-email-form";
import { WhosRespondedCard } from "@/components/whos-responded-card";
import { BookItControl } from "@/components/book-it-control";
import { SubscribeCard } from "@/components/subscribe-card";
import { Card } from "@/components/ui/card";

type AdminOption = { id: string; date: string; startTime: string | null };

// Group options by calendar month via a pure string prefix (YYYY-MM) — no Date
// construction, timezone-safe by construction. First-appearance (chronological)
// order preserved; each group keeps its options in source order; a month-boundary
// date groups under its own month (edges TV3-02/06).
function groupByMonth(
  opts: AdminOption[],
): { key: string; options: AdminOption[] }[] {
  const groups: { key: string; options: AdminOption[] }[] = [];
  const byKey = new Map<string, { key: string; options: AdminOption[] }>();
  for (const opt of opts) {
    const key = opt.date.slice(0, 7);
    let group = byKey.get(key);
    if (!group) {
      group = { key, options: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.options.push(opt);
  }
  return groups;
}

function CandidateChip({ opt }: { opt: AdminOption }) {
  const hhmm = opt.startTime ? opt.startTime.slice(0, 5) : null;
  const full = formatDateWithTime(opt.date, hhmm);
  return (
    <li
      title={full}
      aria-label={full}
      className="inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 text-sm"
    >
      {formatDateWithTimeShort(opt.date, hhmm)}
    </li>
  );
}

export default async function AdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ adminUrlId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { adminUrlId } = await params;
  // One-time "poll created" flag from the create redirect (UX-UAT F5). Present
  // only on the creator's first arrival; a refresh without the param drops it.
  const justCreated = (await searchParams).created === "1";

  const poll = await getPollWithWinningOption(adminUrlId);
  if (!poll) notFound();

  const isClosed = poll.status === "closed";

  // Deadline state (DEAD-01 / LOCKED 3, 5). deadlinePassed is the "open-but-
  // expired" case that drives the amber header pill and the passed-state card
  // copy — mutually exclusive with Booked by construction (isClosed wins; the
  // card + pill are only ever evaluated when !isClosed, UI Probe #2). Only a
  // STRING ISO instant crosses to the client island, never a raw Date (LOCKED 5).
  const now = new Date();
  const deadlinePassed =
    !isClosed && poll.deadline != null && poll.deadline <= now;
  const deadlineIso = poll.deadline ? poll.deadline.toISOString() : null;

  const options = await getOptionsForPoll(poll.id);
  const participants = await getResultsForPoll(poll.id);
  const results = computeResults(participants, options);

  // Organizer's own availability (ORG-01). The organizer row is already loaded by
  // getResultsForPoll (now carrying isOrganizer + votes) — derive it here, no
  // extra query. votingOpen gates the "Your availability" card the SAME way it
  // gates participant voting (isVotingOpen; LOCKED 4). Only booleans/strings cross
  // to the client island — never a raw Date (LOCKED 5).
  const organizerRow = participants.find((p) => p.isOrganizer);
  const votingOpen = isVotingOpen(poll, now);

  // Admin-only respondent tracking (RESP-01). This read RETURNS invitation
  // emails and is consumed ONLY by WhosRespondedCard below — never passed to
  // ResultsGrid or any participant-facing surface (D-09 / T-07-01 no-leak).
  const invitations = await getInvitationTrackingForPoll(poll.id);

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

  const monthGroups = groupByMonth(options);
  const multiMonth = monthGroups.length > 1;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
      {/* Entry links (MYP-06): navigation back to the organizer's dashboard and
          to create another poll. Small muted text links — navigation, not
          primary buttons. Both are static paths (no token embedded, T-06-09). */}
      <nav className="flex items-center gap-4 text-sm">
        <Link
          href="/polls"
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          Your polls
        </Link>
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground hover:underline"
        >
          Create a poll
        </Link>
      </nav>

      {/* Header: poll title + status pill + location/description (TBD). */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-semibold leading-tight">{poll.title}</h1>
          {/* Header status pill (UI Probe #2): an if/else so the two pills are
              MUTUALLY EXCLUSIVE by construction — a real finalize (Booked) always
              wins; the amber deadline-passed pill is only evaluated in the else
              branch, and its card is hidden entirely once isClosed. */}
          {isClosed ? (
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              Booked
            </span>
          ) : deadlinePassed ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Voting closed — deadline passed
            </span>
          ) : null}
        </div>
        <PollSummary description={poll.description} location={poll.location} />
      </div>

      {/* Poll-created confirmation (UX-UAT F5) — the primary next action on a
          fresh poll is to SHARE, so name it explicitly and point at the link
          below. Shown once (created=1) and never on a finalized poll. */}
      {justCreated && !isClosed ? (
        <Card className="flex flex-col gap-1 border-emerald-200 bg-emerald-50/50 p-5">
          <span className="text-base font-semibold text-emerald-800">
            Poll created — you&apos;re all set.
          </span>
          <span className="text-base text-muted-foreground">
            Share the participant link below with your group to start collecting
            availability. This admin page is your private link to manage the
            poll — bookmark it.
          </span>
        </Card>
      ) : null}

      {/* Voting deadline (DEAD-01). A poll-level scheduling control belongs at
          the top of the page. Rendered ONLY when !isClosed — once booked, the
          "Poll finalized" card owns the terminal state and this card (and its
          amber pill) is hidden entirely, which is what makes the Booked/
          deadline-passed pills mutually exclusive (UI-SPEC Surface 1). */}
      {!isClosed ? (
        <DeadlineControl
          adminUrlId={poll.adminUrlId}
          deadlineIso={deadlineIso}
          deadlinePassed={deadlinePassed}
        />
      ) : null}

      {/* Condensed candidate-date echo — short visible label, FULL date in
            title + aria-label; month-grouped only when the set spans >1 month.
            Wrapped in a native <details> closed by default (no client JS): the
            summary toggles the chip list on click/Enter with SR disclosure +
            keyboard focus for free. Breakpoint-agnostic (desktop + mobile). */}
      <details className="group flex flex-col gap-2">
        <summary className="flex min-h-11 cursor-pointer select-none list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 shrink-0 transition-transform group-open:rotate-90"
          />
          Candidate dates ({options.length})
        </summary>
        {multiMonth ? (
          <div className="flex flex-col gap-4">
            {monthGroups.map((group) => (
              <section key={group.key} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {formatMonthYear(group.options[0].date)}
                </h3>
                <ul className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                  {group.options.map((opt) => (
                    <CandidateChip key={opt.id} opt={opt} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {options.map((opt) => (
              <CandidateChip key={opt.id} opt={opt} />
            ))}
          </ul>
        )}
      </details>

      {/* Your availability (ORG-01) — the organizer adds/edits their OWN row
          BEFORE reading results, so their vote is already folded into what they
          see next. Editable while voting is open; hidden (no row) or read-only
          (row exists) once voting closes (UI Probe #1). The saved row appears
          "(you)" in the Results grid below. */}
      <OrganizerAvailabilityControl
        adminUrlId={poll.adminUrlId}
        options={options}
        initialName={organizerRow?.name ?? ""}
        initialVotes={organizerRow?.votes as Record<string, VoteState> | undefined}
        hasRow={!!organizerRow}
        votingOpen={votingOpen}
      />

      {/* Results (DASH-01..05) — full-width hero directly under the header.
          min-w-0 lets the wide table scroll inside its own overflow-x-auto
          rather than forcing document-level horizontal scroll. */}
      <Card className="flex min-w-0 flex-col gap-4 p-6">
        <h2 className="text-2xl font-semibold leading-snug">Results</h2>
        <ResultsGrid
          options={options}
          participants={participants}
          results={results}
        />
      </Card>

      {/* Who's responded (RESP-01/02) — between Results and Book it so the flow
          reads: see the grid -> see who's missing -> decide whether to nudge
          before booking. Admin-only; reuses the page's isClosed + emailConfigured
          gates (never recomputed). Invitation data flows ONLY here. */}
      <WhosRespondedCard
        invitations={invitations}
        adminUrlId={poll.adminUrlId}
        isClosed={isClosed}
        emailConfigured={emailConfigured}
      />

      {/* Book it (FNL-01/02/03). Renders EXACTLY ONE of {picker, finalized card}
          based on poll.status — never both, never neither. BookItControl already
          emits its own Card, so the open-poll branch is NOT double-wrapped
          (edge TV3-10). */}
      {isClosed ? (
        <Card className="flex flex-col gap-2 p-6 border-emerald-200 bg-emerald-50/40">
          <h2 className="text-2xl font-semibold leading-snug">
            Poll finalized
          </h2>
          <p className="text-base text-muted-foreground">
            {poll.winningDate
              ? `${formatDateWithTime(
                  poll.winningDate,
                  poll.winningStartTime
                    ? poll.winningStartTime.slice(0, 5)
                    : null,
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
            Pick the date you&apos;re going with. This closes voting for
            everyone.
          </p>
          <BookItControl
            adminUrlId={poll.adminUrlId}
            options={options}
            results={results}
          />
        </div>
      )}

      {/* Share your poll + invite ("the other stuff"), below the results. */}
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
          <SubscribeCard base={base} organizerId={poll.organizerId} />
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
    </main>
  );
}

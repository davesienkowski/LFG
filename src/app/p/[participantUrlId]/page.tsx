// Participant vote view `/p/[participantUrlId]` (UI-SPEC Surface 1/2). RSC:
// resolve the poll by participant token via getPollByParticipantUrlId — which
// selects ONLY participant-safe columns and DELIBERATELY OMITS admin_url_id, so
// the rendered HTML and RSC payload can never carry the admin token
// (D-09 / prohibition P2). 404 on miss.
//
// Same-device auto-load (VOTE-05): read the httpOnly `lfg_edit_<participantUrlId>`
// cookie via next/headers. When it resolves to a participant OF THIS POLL,
// preload their prior name/email/votes and point the shared VoteForm at
// updateResponse (carrying the editToken) so a re-submit UPDATES that one
// participant — never creates a duplicate (edge-probe resolution). When the
// cookie is absent OR resolves to a different poll's participant, render the
// fresh submitResponse form (02-01). The preload only fills client state — it
// NEVER auto-submits. The cookie is convenience-only; the DB row + token remain
// the sole edit authority (D2-08).
//
// When poll.status != 'open' the form renders read-only (disabled inputs,
// non-interactive grid, no submit button) and the action rejects the write
// server-side.
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
  getParticipantByEditToken,
  getVotesForParticipant,
} from "@/lib/db/queries";
import { submitResponse } from "@/lib/actions/submit-response";
import { updateResponse } from "@/lib/actions/update-response";
import { PollSummary } from "@/components/poll-summary";
import { VoteForm } from "@/components/vote-form";
import type { VoteState } from "@/components/availability-grid";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ participantUrlId: string }>;
}) {
  const { participantUrlId } = await params;

  const poll = await getPollByParticipantUrlId(participantUrlId);
  if (!poll) notFound();

  const options = await getOptionsForPoll(poll.id);

  // Same-device auto-load: the cookie is convenience-only and is validated
  // against THIS poll before any preload (never authoritative for the write).
  const cookieStore = await cookies();
  const editToken = cookieStore.get(`lfg_edit_${participantUrlId}`)?.value;
  let priorParticipant: { name: string; email: string | null } | null = null;
  let priorVotes: Record<string, VoteState> | null = null;
  if (editToken) {
    const participant = await getParticipantByEditToken(editToken);
    if (participant && participant.pollId === poll.id) {
      priorParticipant = { name: participant.name, email: participant.email };
      priorVotes = (await getVotesForParticipant(
        participant.id,
      )) as Record<string, VoteState>;
    }
  }
  const isReturning = priorParticipant !== null;

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">{poll.title}</h1>
        <PollSummary description={poll.description} location={poll.location} />
      </div>

      {isReturning ? (
        <p className="text-base text-muted-foreground">
          Showing your previous response. Submit again to update it.
        </p>
      ) : null}

      <VoteForm
        action={isReturning ? updateResponse : submitResponse}
        participantUrlId={participantUrlId}
        editToken={isReturning ? editToken : undefined}
        options={options.map((o) => ({
          id: o.id,
          date: o.date,
          startTime: o.startTime,
        }))}
        initialName={priorParticipant?.name ?? ""}
        initialEmail={priorParticipant?.email ?? ""}
        initialVotes={priorVotes ?? undefined}
        readOnly={poll.status !== "open"}
        submitLabel="Submit availability"
        pendingLabel="Submitting..."
      />
    </main>
  );
}

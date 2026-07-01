// Participant edit view `/p/[participantUrlId]/edit/[editToken]` (UI-SPEC Surface
// 4; VOTE-05 / VOTE-06). RSC: resolve the poll by participant token
// (getPollByParticipantUrlId omits admin_url_id — P2), then RE-DERIVE the
// participant from the URL's editToken via getParticipantByEditToken and
// cross-check participant.pollId === poll.id. A null participant (unknown/empty
// token) OR a token owned by a participant of a DIFFERENT poll both notFound()
// with the IDENTICAL 404 surface — no branch-specific copy, no token-format
// oracle (T-02-08). This route is reached only via the participant's own token,
// so the prior response preloads UNCONDITIONALLY — no cookie dependency.
//
// The shared VoteForm is pointed at updateResponse (carrying the editToken); on a
// closed poll it renders read-only (disabled inputs, non-interactive grid, no
// submit button) and updateResponse rejects the write server-side.
import { notFound } from "next/navigation";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
  getParticipantByEditToken,
  getVotesForParticipant,
} from "@/lib/db/queries";
import { updateResponse } from "@/lib/actions/update-response";
import { PollSummary } from "@/components/poll-summary";
import { VoteForm } from "@/components/vote-form";
import type { VoteState } from "@/components/availability-grid";

export default async function EditParticipantPage({
  params,
}: {
  params: Promise<{ participantUrlId: string; editToken: string }>;
}) {
  const { participantUrlId, editToken } = await params;

  const poll = await getPollByParticipantUrlId(participantUrlId);
  if (!poll) notFound();

  // Token ownership authority (VOTE-06): unknown/empty token OR wrong-poll token
  // => identical notFound(). Never trust the URL's participantUrlId alone.
  const participant = await getParticipantByEditToken(editToken);
  if (!participant || participant.pollId !== poll.id) notFound();

  const [options, priorVotes] = await Promise.all([
    getOptionsForPoll(poll.id),
    getVotesForParticipant(participant.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">{poll.title}</h1>
        <PollSummary description={poll.description} location={poll.location} />
      </div>

      <VoteForm
        action={updateResponse}
        participantUrlId={participantUrlId}
        editToken={editToken}
        options={options.map((o) => ({
          id: o.id,
          date: o.date,
          startTime: o.startTime,
        }))}
        initialName={participant.name}
        initialEmail={participant.email ?? ""}
        initialVotes={priorVotes as Record<string, VoteState>}
        readOnly={poll.status !== "open"}
        heading="Edit your availability"
        submitLabel="Save changes"
        pendingLabel="Saving..."
      />
    </main>
  );
}

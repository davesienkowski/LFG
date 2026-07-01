// Participant vote view `/p/[participantUrlId]` (UI-SPEC Surface 1/2). RSC:
// resolve the poll by participant token via getPollByParticipantUrlId — which
// selects ONLY participant-safe columns and DELIBERATELY OMITS admin_url_id, so
// the rendered HTML and RSC payload can never carry the admin token
// (D-09 / prohibition P2). 404 on miss.
//
// Renders the shared VoteForm pointed at submitResponse. This is a FRESH submit
// form: there is NO same-device cookie preload here — the returning-participant
// auto-load + updateResponse routing is deliberately 02-02's slice (scope note).
// When poll.status != 'open' the form renders read-only (disabled inputs,
// non-interactive grid, no submit button) and submitResponse rejects the write
// server-side.
import { notFound } from "next/navigation";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
} from "@/lib/db/queries";
import { submitResponse } from "@/lib/actions/submit-response";
import { PollSummary } from "@/components/poll-summary";
import { VoteForm } from "@/components/vote-form";

export default async function ParticipantPage({
  params,
}: {
  params: Promise<{ participantUrlId: string }>;
}) {
  const { participantUrlId } = await params;

  const poll = await getPollByParticipantUrlId(participantUrlId);
  if (!poll) notFound();

  const options = await getOptionsForPoll(poll.id);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold leading-tight">{poll.title}</h1>
        <PollSummary description={poll.description} location={poll.location} />
      </div>

      <VoteForm
        action={submitResponse}
        participantUrlId={participantUrlId}
        options={options.map((o) => ({
          id: o.id,
          date: o.date,
          startTime: o.startTime,
        }))}
        readOnly={poll.status !== "open"}
        submitLabel="Submit availability"
        pendingLabel="Submitting..."
      />
    </main>
  );
}

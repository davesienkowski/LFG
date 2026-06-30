// Participant shell `/p/[participantUrlId]` (UI-SPEC Surface 3). RSC: resolve the
// poll by participant token via getPollByParticipantUrlId, which selects ONLY
// participant-safe columns and DELIBERATELY OMITS admin_url_id — so the rendered
// HTML and the serialized RSC payload can never contain the admin token
// (D-09 / prohibition P2). 404 on miss. Voting UI is deferred to Phase 2.
import { notFound } from "next/navigation";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
} from "@/lib/db/queries";
import { formatDateWithTime } from "@/lib/format-date";
import { PollSummary } from "@/components/poll-summary";

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

      <div className="rounded-lg border bg-muted p-6 text-center">
        <h2 className="text-2xl font-semibold leading-snug">
          Voting isn&apos;t available yet
        </h2>
        <p className="text-base text-muted-foreground">
          The organizer is still setting up this poll. Check back soon.
        </p>
      </div>
    </main>
  );
}

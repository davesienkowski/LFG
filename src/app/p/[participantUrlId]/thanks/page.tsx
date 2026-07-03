// Thanks confirmation `/p/[participantUrlId]/thanks` (UI-SPEC Surface 3; D2-09).
// RSC: resolve the poll (404 on miss), read the just-set httpOnly edit cookie,
// and surface the personal edit link. notFound() when the cookie is absent so a
// direct navigation without a submit does not render a bare page.
//
// The edit token is an UNAUTHENTICATED BEARER CREDENTIAL (VOTE-06): the card
// carries the explicit "don't share" warning, never the link alone. Only
// participant-safe columns are read — the admin token never reaches this surface.
import { notFound } from "next/navigation";
import { headers, cookies } from "next/headers";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
  getResultsForPoll,
} from "@/lib/db/queries";
import { resolveBaseUrl, buildEditUrl } from "@/lib/urls";
import { computeResults } from "@/lib/results";
import { CopyLinkButton } from "@/components/copy-link-button";
import { ResultsGrid } from "@/components/results-grid";
import { Card } from "@/components/ui/card";

export default async function ThanksPage({
  params,
}: {
  params: Promise<{ participantUrlId: string }>;
}) {
  const { participantUrlId } = await params;

  const poll = await getPollByParticipantUrlId(participantUrlId);
  if (!poll) notFound();

  const cookieStore = await cookies();
  const editToken = cookieStore.get(`lfg_edit_${participantUrlId}`)?.value;
  if (!editToken) notFound();

  // Participant-safe reads (T-pdt-01/02): getResultsForPoll omits
  // email + edit/admin tokens; getOptionsForPoll returns id/date/startTime/
  // position. Keyed by poll.id — never a client-supplied id. Same wiring as the
  // admin page. cookies()/headers() force dynamic rendering, so these reflect
  // the just-submitted vote (no stale cache).
  const options = await getOptionsForPoll(poll.id);
  const participants = await getResultsForPoll(poll.id);
  const results = computeResults(participants, options);

  const h = await headers();
  const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  const editUrl = buildEditUrl(base, participantUrlId, editToken);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold leading-snug">
          Thanks for responding!
        </h2>
        <p className="text-base">Your availability has been saved.</p>
      </div>

      <Card className="flex flex-col gap-2 p-6">
        <span className="text-sm font-semibold">Your personal link</span>
        <span className="text-base text-muted-foreground">
          Bookmark this to change your answer later.
        </span>
        {/* Bearer-credential warning (VOTE-06) — never surface the link alone. */}
        <span className="text-base text-amber-700">
          Don&apos;t share this link — anyone who has it can change your answer.
        </span>
        <span className="font-mono text-sm truncate">{editUrl}</span>
        <div>
          <CopyLinkButton url={editUrl} label="Copy edit link" />
        </div>
      </Card>

      <p className="text-base text-muted-foreground">
        No email was sent — save this link now.
      </p>

      {/* Current results (DASH-01) — read-only, participant-safe. ResultsGrid
          owns its own empty state; the just-submitted participant is always
          counted here so it never renders empty. */}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold leading-snug">Current results</h2>
        <p className="text-base text-muted-foreground">
          See how the group&apos;s availability is shaping up so far.
        </p>
        <ResultsGrid
          options={options}
          participants={participants}
          results={results}
        />
      </div>
    </main>
  );
}

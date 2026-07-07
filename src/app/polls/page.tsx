// The "Your polls" dashboard `/polls` (MYP-01..04). RSC: read the httpOnly
// `lfg_organizer` cookie via next/headers, call getPollsByOrganizerId (06-01),
// and render EITHER the organizer's owned polls newest-first — one PollListItem
// per poll (06-02) with the SubscribeCard on top — OR an identical no-oracle
// empty state.
//
// Reading cookies() forces a dynamic render in Next 16 — that is how PROH-3 is
// satisfied WITHOUT any `dynamic`/`revalidate` export. A static-cache export
// would share one organizer's list across cookies and leak it to another — never
// add one.
//
// No-oracle discipline (MYP-03 / PROH-4): the page NEVER notFound()s or throws
// for an absent/unknown organizer — it always returns HTTP 200. When there are
// zero owned polls (absent cookie, empty/whitespace cookie, OR an unknown
// organizer) it renders a byte-identical empty state that embeds NO SubscribeCard
// and NO organizer feed token, so nothing distinguishes "no cookie" from "unknown
// organizer". The subscribe card (and its feed token) renders ONLY in the ≥1-poll
// branch, where `organizerId` is provably defined.
//
// No-leak (PROH-2): the ONLY poll read here is getPollsByOrganizerId, whose shape
// carries just participant-safe columns (no participant name/email, no edit
// token, no participant_url_id) — the page issues no other participant query.
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getPollsByOrganizerId } from "@/lib/db/queries";
import { resolveBaseUrl } from "@/lib/urls";
import { PollListItem } from "@/components/poll-list-item";
import { SubscribeCard } from "@/components/subscribe-card";

export default async function PollsPage() {
  // Same-browser scoping: the organizer cookie is the sole selector. Normalize
  // an empty/whitespace token to absent BEFORE the query (mirrors create-poll and
  // the getPollsByOrganizerId MYP-05 guard) so a blank cookie is never a wildcard.
  const cookieStore = await cookies();
  const rawOrganizer = cookieStore.get("lfg_organizer")?.value;
  const organizerId =
    rawOrganizer && rawOrganizer.trim() ? rawOrganizer : undefined;

  // Skip the query entirely when the cookie is absent/blank; an unknown organizer
  // token that IS present still resolves to [] inside getPollsByOrganizerId — both
  // land in the identical empty state below (no oracle).
  const polls = organizerId ? await getPollsByOrganizerId(organizerId) : [];

  // Resolve the absolute base for the subscribe feed URL ONLY in the populated
  // branch — the empty state embeds no organizer token (PROH-4), so it never
  // touches the base/feed URL at all.
  let base: string | null = null;
  if (polls.length > 0) {
    const h = await headers();
    base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12">
      {/* Header: title + a persistent path back to create another poll. */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold leading-tight">Your polls</h1>
        <Link
          href="/"
          className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Create a poll
        </Link>
      </div>

      {polls.length === 0 ? (
        // No-oracle empty state (MYP-03 / PROH-4): identical for an absent cookie
        // and an unknown organizer. Renders NO SubscribeCard and NO feed token.
        <div className="flex flex-col items-start gap-3 rounded-xl bg-card p-8 text-card-foreground ring-1 ring-foreground/10">
          <h2 className="text-lg font-semibold">
            You haven&apos;t created any polls yet
          </h2>
          <p className="text-sm text-muted-foreground">
            Polls you create from this browser show up here.
          </p>
          <Link
            href="/"
            className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
          >
            Create a poll
          </Link>
        </div>
      ) : (
        <>
          {/* organizerId + base are both defined in the ≥1-poll branch. */}
          <SubscribeCard base={base!} organizerId={organizerId!} />
          <ul className="flex flex-col gap-3">
            {polls.map((poll) => (
              <li key={poll.adminUrlId}>
                <PollListItem poll={poll} />
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}

// Shared booked-dates subscribe card (LD-6 / MYP-08). Extracted verbatim from the
// admin page's inlined subscribe Card so both the admin page (06-04 swaps to this)
// and the new `/polls` dashboard (06-03) render one tested source of truth.
//
// NEUTRAL severity by design (LD-7 / T-sn2-04): the organizer feed link is an
// unguessable bearer link but exposes only booked dates + poll titles (no
// participant data), so this card carries NO amber border and NO "Keep private"
// badge. Every asserted subscribe-card string is preserved so the admin render
// test still passes after the swap.
//
// MYP-08: adds one muted line of same-browser guidance so organizers understand
// that creating polls from the same browser is what keeps them in one calendar.
//
// Pure/presentational: callers supply `base` + `organizerId` (no cookie/DB read
// inside), keeping props clean and JSON-serializable.
import {
  buildOrganizerFeedUrl,
  buildOrganizerWebcalUrl,
} from "@/lib/urls";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Card } from "@/components/ui/card";

export function SubscribeCard({
  base,
  organizerId,
}: {
  base: string;
  organizerId: string;
}) {
  const feedUrl = buildOrganizerFeedUrl(base, organizerId);
  const webcalUrl = buildOrganizerWebcalUrl(base, organizerId);

  return (
    <Card className="flex flex-col gap-2 p-6">
      <span className="text-sm font-semibold">
        Subscribe to your booked-dates calendar
      </span>
      <span className="text-base text-muted-foreground">
        Add this once to your phone/desktop calendar; every poll you finalize
        appears automatically.
      </span>
      <span className="text-sm text-muted-foreground">
        This is a group-shareable link — it shows only booked dates and poll
        titles, never any participant data.
      </span>
      {/* MYP-08 same-browser guidance. */}
      <span className="text-sm text-muted-foreground">
        Create your polls from the same browser to keep them all in one
        calendar.
      </span>
      <span className="font-mono text-sm truncate">{feedUrl}</span>
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={webcalUrl}
          className="inline-flex items-center rounded-md border px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Subscribe in calendar
        </a>
        <CopyLinkButton url={feedUrl} label="Copy calendar link" />
      </div>
    </Card>
  );
}

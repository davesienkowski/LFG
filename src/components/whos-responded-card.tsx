// WhosRespondedCard (RESP-01, admin-only RSC — NO "use client"). Renders the
// "Who's responded" tracking card that sits between Results and Book it on the
// admin page. Three mutually-exclusive states per the UI-SPEC "New Surfaces"
// table: EMPTY, POPULATED-open, POPULATED-closed.
//
// No-leak discipline (D-09 / T-07-01): this component receives invitation emails
// and is rendered ONLY on the admin route. It is never mounted on a
// participant-facing surface, and it passes NO invitation data to ResultsGrid or
// any participant prop.
//
// Prohibition Probe #2 (T-07-07): the "N of M responded" summary NEVER renders
// without its disambiguating caption — the stat and caption are a single unit so
// the organizer can't misread it as total poll participation.
//
// Accessibility (WCAG 1.4.1): status is conveyed by a text label paired with
// color, never color alone — matching the hand-rolled Booked/Best/Keep-private
// badge idiom already used site-wide (no shadcn Badge primitive installed).
import { Card } from "@/components/ui/card";
import { NudgeControl } from "@/components/nudge-control";

export function WhosRespondedCard({
  invitations,
  adminUrlId,
  isClosed,
  emailConfigured,
}: {
  invitations: { email: string; responded: boolean }[];
  adminUrlId: string;
  isClosed: boolean;
  emailConfigured: boolean;
}) {
  const total = invitations.length;
  const respondedCount = invitations.filter((i) => i.responded).length;
  const nonRespondentCount = total - respondedCount;

  return (
    <Card className="flex flex-col gap-4 p-6">
      <h2 className="text-2xl font-semibold leading-snug">Who&apos;s responded</h2>

      {total === 0 ? (
        // EMPTY: body copy only — no summary, no badge list, no nudge control.
        <p className="text-base text-muted-foreground">
          No invitations sent yet. Invite people by email above and we&apos;ll
          track who&apos;s responded here.
        </p>
      ) : (
        <>
          {/* Summary stat + MANDATORY caption (Prohibition Probe #2) — always
              rendered together so the stat is never read as total participation. */}
          <div className="flex flex-col gap-1">
            <p className="text-base font-semibold">
              {respondedCount} of {total} responded
            </p>
            <p className="text-sm text-muted-foreground">
              Only counts people invited by email through this tool.
            </p>
          </div>

          {/* Badge list — one row per invitation: email + emerald/amber status
              badge (text-on-color, never a bare swatch). Mirrors the invite
              result list markup exactly. */}
          <ul className="flex flex-col gap-2">
            {invitations.map((invitation) => (
              <li
                key={invitation.email}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-semibold">{invitation.email}</span>
                {invitation.responded ? (
                  <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    Responded
                  </span>
                ) : (
                  // Amber — an EXPECTED pending state, NEVER destructive/red.
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    Not yet responded
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* Nudge slot: rendered ONLY on an open poll with email configured.
              On a closed poll NO nudge control renders (hidden, not disabled).
              When email isn't configured, render nothing — the page's existing
              "Email isn't set up" fallback covers that once for invites. */}
          {!isClosed && emailConfigured ? (
            <NudgeControl
              adminUrlId={adminUrlId}
              nonRespondentCount={nonRespondentCount}
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

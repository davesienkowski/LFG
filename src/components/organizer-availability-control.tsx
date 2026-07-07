"use client";

// OrganizerAvailabilityControl (UI-SPEC "Your availability" Card; ORG-01 / LOCKED
// constraint 6; UI Probe #1). The organizer's admin-only client island for adding
// or editing THEIR OWN availability row — reusing AvailabilityGrid verbatim, with
// NO email field (the row's name defaults to "You"). Modeled on vote-form.tsx's
// useActionState + serialized-votes-hidden-input composition, minus the email.
//
// Visibility gating (UI Probe #1 — the editable grid must NEVER render once voting
// is closed, so an organizer can't imply votes still matter post-close):
//  - votingOpen === false AND hasRow  -> read-only summary (disabled grid, no Save)
//  - votingOpen === false AND !hasRow -> render nothing (card hidden entirely)
//  - votingOpen === true              -> the editable add/edit branch below
//
// The at-most-one organizer row invariant (LOCKED 6) is enforced server-side by
// saveOrganizerAvailability's find-or-create upsert; on the client, the form's
// isPending disabled state is the single-submit guard that bounds the concurrency
// window. Submit is additionally gated on allAnswered (mirrors VoteForm) so the
// organizer's row can never be saved half-answered.
import { useActionState, useId, useState } from "react";
import {
  AvailabilityGrid,
  type VoteState,
  type GridOption,
} from "@/components/availability-grid";
import {
  saveOrganizerAvailability,
  type SaveOrganizerAvailabilityState,
} from "@/lib/actions/save-organizer-availability";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export function OrganizerAvailabilityControl({
  adminUrlId,
  options,
  initialName,
  initialVotes,
  hasRow,
  votingOpen,
}: {
  adminUrlId: string;
  options: GridOption[];
  initialName: string;
  initialVotes?: Record<string, VoteState>;
  hasRow: boolean;
  votingOpen: boolean;
}) {
  // All hooks run unconditionally BEFORE any early return (Rules of Hooks).
  const [state, formAction, isPending] = useActionState<
    SaveOrganizerAvailabilityState,
    FormData
  >(saveOrganizerAvailability, null);
  // Collapsed by default: the summary + Add/Edit button; the inline form reveals
  // on click. Cancel collapses back with zero side effects (BookItControl
  // precedent) — it never resets already-saved data.
  const [open, setOpen] = useState(false);
  // `null` = unanswered (a CLIENT-ONLY sentinel that never crosses the wire).
  // Only answered rows serialize; the server gap-fills any omitted option to "no".
  const [votes, setVotes] = useState<
    { optionId: string; state: VoteState | null }[]
  >(() =>
    options.map((o) => ({ optionId: o.id, state: initialVotes?.[o.id] ?? null })),
  );
  const nameId = useId();

  // Card hidden entirely: voting closed and nothing to show read-only.
  if (!votingOpen && !hasRow) return null;

  // Read-only summary: voting closed but the organizer's row exists. The editable
  // form (grid + Save) never renders here (UI Probe #1) — the disabled grid uses
  // AvailabilityGrid's existing closed-chip rendering.
  if (!votingOpen) {
    return (
      <Card className="flex flex-col gap-3 p-6">
        <h2 className="text-2xl font-semibold leading-snug">Your availability</h2>
        <p className="text-base text-muted-foreground">
          Voting is closed — you can no longer change your availability.
        </p>
        <AvailabilityGrid
          options={options}
          initial={initialVotes}
          disabled
          onChange={() => {}}
        />
      </Card>
    );
  }

  const answeredCount = votes.filter((v) => v.state !== null).length;
  const allAnswered = answeredCount === options.length;
  // Serialize only ANSWERED rows; Submit is gated on allAnswered, so the filter is
  // the belt-and-suspenders guard keeping the sentinel off the wire.
  const votesPayload = JSON.stringify(votes.filter((v) => v.state !== null));
  const errors = state?.errors ?? {};

  return (
    <Card className="flex flex-col gap-3 p-6">
      <h2 className="text-2xl font-semibold leading-snug">Your availability</h2>

      {!open ? (
        <div className="flex flex-col gap-2">
          {hasRow ? (
            <p className="text-base font-semibold text-emerald-700">
              Added — showing as &quot;{initialName || "You"}&quot; in the results
              below.
            </p>
          ) : (
            <p className="text-base text-muted-foreground">
              You haven&apos;t added your own availability yet.
            </p>
          )}
          <div>
            <Button
              type="button"
              variant={hasRow ? "outline" : "default"}
              className="h-11"
              onClick={() => setOpen(true)}
            >
              {hasRow ? "Edit your availability" : "Add your availability"}
            </Button>
          </div>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-4">
          {/* Admin token is the sole authorization; the votes JSON is the
              serialization seam (mirrors VoteForm). No email field (LOCKED 6). */}
          <input type="hidden" name="adminUrlId" value={adminUrlId} />
          <input type="hidden" name="votes" value={votesPayload} />

          {errors._form ? (
            <p role="alert" className="text-destructive text-sm">
              {errors._form[0]}
            </p>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label htmlFor={nameId}>Display name</Label>
            <Input
              id={nameId}
              name="name"
              type="text"
              maxLength={100}
              defaultValue={initialName || "You"}
              disabled={isPending}
              className="h-11"
            />
          </div>

          <AvailabilityGrid
            options={options}
            initial={initialVotes}
            disabled={isPending}
            onChange={setVotes}
          />

          {/* Tell the organizer why Save is disabled and how many dates remain. */}
          {!allAnswered ? (
            <p className="text-sm text-muted-foreground" role="status">
              Choose an option for every date to submit
              {options.length - answeredCount > 0
                ? ` — ${options.length - answeredCount} left`
                : ""}
              .
            </p>
          ) : null}

          <div className="flex gap-2">
            {/* isPending disabled = the single-submit guard (LOCKED 6). */}
            <Button
              type="submit"
              className="h-11"
              disabled={isPending || !allAnswered}
            >
              {isPending ? "Saving…" : "Save my availability"}
            </Button>
            {/* type="button" — collapses with zero side effects, never submits. */}
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => setOpen(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

"use client";

// VoteForm (UI-SPEC Surface 1/2; D2-07). The single shared vote form, posted to a
// server action via useActionState — the same client-island + hidden-input
// pattern poll-create-form uses. Parameterized over action / initial values /
// readOnly so the 02-02 edit route can reuse it verbatim with updateResponse.
//
// The AvailabilityGrid emits its selections through onChange; they are serialized
// into a single hidden "votes" input (the D2-07 serialization seam). When
// readOnly (closed poll) the submit button is OMITTED entirely (not disabled),
// inputs carry `disabled`, and the grid renders non-interactive spans.
import { useActionState, useId, useState } from "react";
import {
  AvailabilityGrid,
  type VoteState,
  type GridOption,
} from "@/components/availability-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ActionState = { errors?: Record<string, string[]> } | null;
type VoteAction = (
  prevState: ActionState,
  formData: FormData,
) => Promise<ActionState>;

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  );
}

export function VoteForm({
  action,
  options,
  participantUrlId,
  editToken,
  initialName = "",
  initialEmail = "",
  initialVotes,
  readOnly = false,
  bookedLabel,
  heading = "Your availability",
  submitLabel,
  pendingLabel,
}: {
  action: VoteAction;
  options: GridOption[];
  participantUrlId: string;
  editToken?: string;
  initialName?: string;
  initialEmail?: string;
  initialVotes?: Record<string, VoteState>;
  readOnly?: boolean;
  // The finalized date, preformatted server-side, shown in the closed-poll
  // banner so a returning participant learns the outcome on-page (UX-UAT F2).
  bookedLabel?: string;
  heading?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  // `null` = "not answered yet" — a CLIENT-ONLY sentinel that never crosses the
  // wire (UX-UAT F1). It replaces the old pessimal "default everything to No":
  // an untouched date now reads as unanswered, and Submit is gated until every
  // date has an explicit choice, so a skimmer can't silently record all-No.
  // Only answered rows are serialized; the shared VoteState stays yes|ifneedbe|no
  // and the server still gap-fills any omitted option to "no", so nothing
  // downstream (Zod, DB, results) changes.
  const [votes, setVotes] = useState<
    { optionId: string; state: VoteState | null }[]
  >(() =>
    options.map((o) => ({
      optionId: o.id,
      state: initialVotes?.[o.id] ?? null,
    })),
  );
  const answeredCount = votes.filter((v) => v.state !== null).length;
  const allAnswered = answeredCount === options.length;

  const nameId = useId();
  const nameErrorId = `${nameId}-error`;
  const emailId = useId();
  const emailErrorId = `${emailId}-error`;
  const emailHelpId = `${emailId}-help`;

  const errors = state?.errors ?? {};
  // Serialize only ANSWERED rows; unanswered (null) rows are omitted. Submit is
  // gated on allAnswered, so in the normal path every row is present; the filter
  // is the belt-and-suspenders guard that keeps the sentinel off the wire.
  const votesPayload = JSON.stringify(votes.filter((v) => v.state !== null));

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="participantUrlId" value={participantUrlId} />
      {editToken ? (
        <input type="hidden" name="editToken" value={editToken} />
      ) : null}
      <input type="hidden" name="votes" value={votesPayload} />

      <h2 className="text-2xl font-semibold leading-snug">{heading}</h2>

      {errors._form ? (
        <p role="alert" className="text-destructive text-sm">
          {errors._form[0]}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {/* Name — required */}
        <div className="flex flex-col gap-2">
          <Label htmlFor={nameId}>
            Your name <span aria-hidden>*</span>
          </Label>
          <Input
            id={nameId}
            name="name"
            type="text"
            required
            maxLength={100}
            placeholder="e.g. Alex"
            defaultValue={initialName}
            disabled={isPending || readOnly}
            aria-describedby={errors.name ? nameErrorId : undefined}
            aria-invalid={errors.name ? true : undefined}
            className="h-11"
          />
          <FieldError id={nameErrorId} messages={errors.name} />
        </div>

        {/* Email — optional */}
        <div className="flex flex-col gap-2">
          <Label htmlFor={emailId}>Email (optional)</Label>
          <Input
            id={emailId}
            name="email"
            type="email"
            maxLength={200}
            placeholder="you@example.com"
            defaultValue={initialEmail}
            disabled={isPending || readOnly}
            aria-describedby={
              errors.email ? emailErrorId : emailHelpId
            }
            aria-invalid={errors.email ? true : undefined}
            className="h-11"
          />
          <p id={emailHelpId} className="text-muted-foreground text-base">
            We&apos;ll use this later if the organizer emails a confirmation. No
            account, no spam.
          </p>
          <FieldError id={emailErrorId} messages={errors.email} />
        </div>
      </div>

      <AvailabilityGrid
        options={options}
        initial={initialVotes}
        disabled={isPending || readOnly}
        onChange={setVotes}
      />

      {/*
        D-03: on mobile the primary action (submit when open, the closed banner
        when readOnly) is a `position: sticky` pinned footer so a long date list
        never buries it — the content scrolls, this block stays visible at the
        bottom of the viewport. `-mx-4 px-4` bleeds the bar to the page edges
        (the parent `main` has `px-4`); at `sm:` everything reverts to the
        shipped static flow. The prototype's mobileScroll/mobileViewportH knobs
        are demo-only and are NOT ported.
      */}
      {readOnly ? (
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-muted p-6 text-center sm:static sm:mx-0 sm:rounded-lg sm:border">
          {/* F2: lead with the outcome the participant came back for. */}
          {bookedLabel ? (
            <p className="text-lg font-semibold text-emerald-700">
              The group is meeting {bookedLabel}.
            </p>
          ) : (
            <h2 className="text-2xl font-semibold leading-snug">
              Voting is closed
            </h2>
          )}
          <p className="text-base text-muted-foreground">
            {bookedLabel
              ? "The organizer has finalized this date. Voting is closed."
              : "The organizer has closed this poll. You can no longer submit or change your availability."}
          </p>
        </div>
      ) : (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background px-4 py-4 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
          {/* F1: tell the user why Submit is disabled and how many dates remain. */}
          {!allAnswered ? (
            <p className="text-sm text-muted-foreground" role="status">
              Choose an option for every date to submit
              {options.length - answeredCount > 0
                ? ` — ${options.length - answeredCount} left`
                : ""}
              .
            </p>
          ) : null}
          <div>
            <Button
              type="submit"
              disabled={isPending || !allAnswered}
              className="w-full sm:w-auto"
            >
              {isPending ? pendingLabel : submitLabel}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

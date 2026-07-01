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
  heading?: string;
  submitLabel: string;
  pendingLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    null,
  );

  const [votes, setVotes] = useState<{ optionId: string; state: VoteState }[]>(
    () =>
      options.map((o) => ({
        optionId: o.id,
        state: initialVotes?.[o.id] ?? "no",
      })),
  );

  const nameId = useId();
  const nameErrorId = `${nameId}-error`;
  const emailId = useId();
  const emailErrorId = `${emailId}-error`;
  const emailHelpId = `${emailId}-help`;

  const errors = state?.errors ?? {};
  const votesPayload = JSON.stringify(votes);

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

      {readOnly ? (
        <div className="rounded-lg border bg-muted p-6 text-center">
          <h2 className="text-2xl font-semibold leading-snug">
            Voting is closed
          </h2>
          <p className="text-base text-muted-foreground">
            The organizer has closed this poll. You can no longer submit or
            change your availability.
          </p>
        </div>
      ) : (
        <div>
          <Button
            type="submit"
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? pendingLabel : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

"use client";

// Creation form (UI-SPEC Surface 1). Submits to the createPoll server action via
// useActionState; field order, copy, and validation messages are lifted verbatim
// from the UI-SPEC Copywriting Contract. Date rows are managed in client state
// and serialized into a single hidden input "dates" (JSON) for the action.
import { useActionState, useId, useState } from "react";
import { createPoll, type CreatePollState } from "@/lib/actions/create-poll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDatePicker } from "@/components/calendar-date-picker";
import { type DatePayloadEntry } from "@/lib/date-input";

const TITLE_MAX = 200;
const TITLE_COUNTER_AT = 180;

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  );
}

export function PollCreateForm() {
  const [state, formAction, isPending] = useActionState<
    CreatePollState,
    FormData
  >(createPoll, null);

  const [title, setTitle] = useState("");
  // The calendar picker owns selection; it emits the serialized payload here.
  const [dates, setDates] = useState<DatePayloadEntry[]>([]);

  const titleId = useId();
  const titleErrorId = `${titleId}-error`;
  const descriptionId = useId();
  const descriptionErrorId = `${descriptionId}-error`;
  const locationId = useId();
  const locationErrorId = `${locationId}-error`;
  const creatorEmailId = useId();
  const creatorEmailErrorId = `${creatorEmailId}-error`;
  const datesErrorId = useId();

  const errors = state?.errors ?? {};

  // The picker already emits a sorted, de-duplicated, date-only-safe array; an
  // untouched form yields [] and surfaces "Add at least one candidate date".
  const datesPayload = JSON.stringify(dates);

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="dates" value={datesPayload} />

      <div className="flex flex-col gap-4">
        {/* Title — required */}
        <div className="flex flex-col gap-2">
          <Label htmlFor={titleId}>
            Poll title <span aria-hidden>*</span>
          </Label>
          <Input
            id={titleId}
            name="title"
            type="text"
            required
            maxLength={TITLE_MAX}
            placeholder="e.g. D&D Session — July"
            disabled={isPending}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-describedby={errors.title ? titleErrorId : undefined}
            aria-invalid={errors.title ? true : undefined}
          />
          {title.length >= TITLE_COUNTER_AT ? (
            <p className="text-muted-foreground text-sm">
              {title.length}/{TITLE_MAX}
            </p>
          ) : null}
          <FieldError id={titleErrorId} messages={errors.title} />
        </div>

        {/* Description — optional */}
        <div className="flex flex-col gap-2">
          <Label htmlFor={descriptionId}>Description (optional)</Label>
          <Textarea
            id={descriptionId}
            name="description"
            rows={3}
            maxLength={2000}
            placeholder="Add notes for your group — location details, what to bring, etc."
            disabled={isPending}
            aria-describedby={
              errors.description ? descriptionErrorId : undefined
            }
            aria-invalid={errors.description ? true : undefined}
          />
          <FieldError
            id={descriptionErrorId}
            messages={errors.description}
          />
        </div>

        {/* Location — optional */}
        <div className="flex flex-col gap-2">
          <Label htmlFor={locationId}>Location (optional)</Label>
          <Input
            id={locationId}
            name="location"
            type="text"
            maxLength={200}
            placeholder="e.g. Dave's place, Discord, Tavern on Main St"
            disabled={isPending}
            aria-describedby={errors.location ? locationErrorId : undefined}
            aria-invalid={errors.location ? true : undefined}
          />
          <FieldError id={locationErrorId} messages={errors.location} />
        </div>

        {/* Email me the admin link — optional (260703-rqc) */}
        <div className="flex flex-col gap-2">
          <Label htmlFor={creatorEmailId}>
            Email me the admin link (optional)
          </Label>
          <Input
            id={creatorEmailId}
            name="creatorEmail"
            type="email"
            maxLength={200}
            placeholder="you@example.com"
            disabled={isPending}
            aria-describedby={
              errors.creatorEmail ? creatorEmailErrorId : undefined
            }
            aria-invalid={errors.creatorEmail ? true : undefined}
          />
          <p className="text-muted-foreground text-sm">
            This link is the only way to manage or close your poll — we&apos;ll
            email you a copy so you don&apos;t lose it.
          </p>
          <FieldError
            id={creatorEmailErrorId}
            messages={errors.creatorEmail}
          />
        </div>
      </div>

      {/* Candidate dates */}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold leading-snug">Candidate dates</h2>
        <CalendarDatePicker disabled={isPending} onChange={setDates} />
        <FieldError id={datesErrorId} messages={errors.dates} />
      </div>

      {/*
        Board 3a-m: on mobile the `Create poll` action is a `position: sticky`
        pinned footer (border-top bar) so a long candidate-date list never
        buries it — content scrolls, this block stays visible at the viewport
        bottom. `-mx-4` bleeds the bar to the page edges (the root `main` has
        `px-4`; the desktop card wrapper adds padding only at `sm:`). At `sm:`
        everything reverts to the shipped static inline flow (board 3a). Mirrors
        the vote-screen submit footer (D-03 / 05-03).
      */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background px-4 py-4 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto"
        >
          {isPending ? "Creating..." : "Create poll"}
        </Button>
      </div>
    </form>
  );
}

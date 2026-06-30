"use client";

// Creation form (UI-SPEC Surface 1). Submits to the createPoll server action via
// useActionState; field order, copy, and validation messages are lifted verbatim
// from the UI-SPEC Copywriting Contract. Date rows are managed in client state
// and serialized into a single hidden input "dates" (JSON) for the action.
import { useActionState, useId, useState } from "react";
import { Plus } from "lucide-react";
import { createPoll, type CreatePollState } from "@/lib/actions/create-poll";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateRow, type DateRowValue } from "@/components/date-row";

const TITLE_MAX = 200;
const TITLE_COUNTER_AT = 180;

function newRow(): DateRowValue {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    date: "",
    startTime: "",
  };
}

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
  const [rows, setRows] = useState<DateRowValue[]>(() => [newRow()]);
  const [focusId, setFocusId] = useState<string | null>(null);

  const titleId = useId();
  const titleErrorId = `${titleId}-error`;
  const descriptionId = useId();
  const descriptionErrorId = `${descriptionId}-error`;
  const locationId = useId();
  const locationErrorId = `${locationId}-error`;
  const datesErrorId = useId();

  const errors = state?.errors ?? {};

  function addDate() {
    const row = newRow();
    setRows((prev) => [...prev, row]);
    setFocusId(row.id);
  }

  function removeDate(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function updateRow(
    id: string,
    patch: Partial<Pick<DateRowValue, "date" | "startTime">>,
  ) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  }

  // Serialize only rows with a date; drop empty rows so an untouched form yields
  // [] and surfaces "Add at least one candidate date" rather than a date error.
  const datesPayload = JSON.stringify(
    rows
      .filter((r) => r.date !== "")
      .map((r) => ({ date: r.date, startTime: r.startTime || null })),
  );

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
      </div>

      {/* Candidate dates */}
      <div className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold leading-snug">Candidate dates</h2>
        <div className="flex flex-col gap-4">
          {rows.map((row, index) => (
            <DateRow
              key={row.id}
              row={row}
              index={index}
              showRemove={rows.length > 1}
              disabled={isPending}
              shouldFocus={focusId === row.id}
              onChange={(patch) => updateRow(row.id, patch)}
              onRemove={() => removeDate(row.id)}
            />
          ))}
        </div>
        <FieldError id={datesErrorId} messages={errors.dates} />
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            onClick={addDate}
          >
            <Plus />
            Add date
          </Button>
        </div>
      </div>

      <div>
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

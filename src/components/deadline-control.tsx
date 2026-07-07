"use client";

// DeadlineControl (UI-SPEC "Voting deadline" Card; DEAD-01 / LOCKED 3, 5; UI
// Probes #2, #4). The organizer's admin-only client island for setting,
// updating, or clearing the optional voting deadline — modeled on
// InviteByEmailForm's useActionState + hidden-input pattern.
//
// Why a client island (not an RSC): the deadline is a timezone-independent
// INSTANT, but the organizer thinks in their OWN local wall-clock. This
// component converts both directions in the browser so voting never closes
// early/late by the server offset (LOCKED 5):
//  - Inbound: the server passes `deadlineIso` (a UTC instant STRING, never a raw
//    Date). We convert it to the browser-local `YYYY-MM-DDTHH:mm` for the
//    datetime-local input and format the human status copy in the browser
//    locale/TZ.
//  - Outbound: the datetime-local value is a NAIVE wall-clock. `new Date(value)`
//    interprets it in the browser TZ; `.toISOString()` yields the correct UTC
//    instant, posted as the hidden `deadlineIso` field that setDeadline parses.
//
// The TZ-dependent conversions are derived during render from the browser's TZ.
// Because the server render has no browser TZ, the two TZ-dependent nodes (the
// input value and the human status copy) carry `suppressHydrationWarning`: React
// keeps the client-computed (correct-TZ) values after hydration without a
// mismatch warning. Branching between unset/future/passed uses the
// server-authoritative `deadlinePassed` boolean + `hasDeadline`, both
// TZ-independent, so the visible structure never diverges.
//
// The `min` attribute is a UX hint only; the authoritative future-only check is
// server-side in setDeadline and surfaces here via FieldError (UI Probe #4).
import { useActionState, useId, useState } from "react";
import {
  setDeadline,
  type SetDeadlineState,
} from "@/lib/actions/set-deadline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages || messages.length === 0) return null;
  return (
    <p id={id} role="alert" className="text-destructive text-sm">
      {messages[0]}
    </p>
  );
}

// A UTC instant string -> the browser-local `YYYY-MM-DDTHH:mm` the
// datetime-local input expects (local getters, so it reflects the organizer's TZ).
function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// A UTC instant string -> a human, browser-locale/TZ label, e.g.
// "Saturday, July 18 at 6:00 PM".
function formatInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const datePart = d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}

// Current instant -> browser-local `YYYY-MM-DDTHH:mm` for the input `min` hint.
function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString());
}

export function DeadlineControl({
  adminUrlId,
  deadlineIso,
  deadlinePassed,
}: {
  adminUrlId: string;
  deadlineIso: string | null;
  deadlinePassed: boolean;
}) {
  const [state, formAction, isPending] = useActionState<
    SetDeadlineState,
    FormData
  >(setDeadline, null);

  const hasDeadline = deadlineIso != null;

  // The datetime-local input is controlled. Its initial value is the saved
  // instant converted to the browser-local wall-clock (lazy initializer — runs
  // on server with the server TZ and on client with the browser TZ; the client
  // value wins after hydration and the input carries suppressHydrationWarning).
  const [localValue, setLocalValue] = useState(() =>
    deadlineIso ? isoToLocalInput(deadlineIso) : "",
  );
  // The `min` hint, computed once from "now" in the browser-local wall-clock.
  const [minValue] = useState(() => nowLocalInput());

  const deadlineId = useId();
  const errId = `${deadlineId}-error`;
  const errors = state?.errors ?? {};

  // The converted UTC instant posted to the action. Empty when the input is
  // empty (the server rejects that with the future-only field error).
  const isoToPost = localValue ? new Date(localValue).toISOString() : "";

  // The saved deadline formatted in the browser locale/TZ (null when unset).
  const humanDeadline = deadlineIso ? formatInstant(deadlineIso) : null;

  // Status copy per state (unset / future / passed).
  let statusCopy: string;
  if (!hasDeadline) {
    statusCopy = "No deadline set — voting stays open until you book a date.";
  } else if (deadlinePassed) {
    statusCopy = `Voting closed on ${humanDeadline} — the deadline has passed.`;
  } else {
    statusCopy = `Voting closes ${humanDeadline}.`;
  }

  return (
    <Card className="flex flex-col gap-3 p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-semibold leading-snug">
            Voting deadline
          </h2>
          {deadlinePassed ? (
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              Voting closed — deadline passed
            </span>
          ) : null}
        </div>
        <p
          className="text-base text-muted-foreground"
          suppressHydrationWarning
        >
          {statusCopy}
        </p>
      </div>

      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="adminUrlId" value={adminUrlId} />
        {/* The converted UTC instant — the ONLY deadline field the server reads.
            The visible datetime-local input is intentionally unnamed so its naive
            wall-clock value never reaches the server (LOCKED 5). */}
        <input type="hidden" name="deadlineIso" value={isoToPost} />

        <div className="flex flex-col gap-1">
          <Label htmlFor={deadlineId}>Voting deadline</Label>
          <Input
            id={deadlineId}
            type="datetime-local"
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            min={minValue || undefined}
            disabled={isPending}
            className="h-11"
            suppressHydrationWarning
            aria-describedby={errors.deadline ? errId : undefined}
            aria-invalid={errors.deadline ? true : undefined}
          />
          <FieldError id={errId} messages={errors.deadline} />
        </div>

        <Button type="submit" className="h-11" disabled={isPending}>
          {isPending
            ? "Saving…"
            : hasDeadline
              ? "Update deadline"
              : "Save deadline"}
        </Button>

        {hasDeadline ? (
          <Button
            type="submit"
            name="intent"
            value="clear"
            variant="outline"
            className="h-11"
            disabled={isPending}
          >
            Clear deadline
          </Button>
        ) : null}
      </form>
    </Card>
  );
}

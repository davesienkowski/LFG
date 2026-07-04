"use client";

// BookItControl (UI-SPEC "Book-it Finalize Control"; FNL-01, D-08). The
// organizer's finalize island: a native radio picker over the candidate dates
// (the computed best day pre-selected) plus a two-step confirm disclosure. The
// same client-island + hidden-input + useActionState pattern vote-form.tsx uses.
//
// Load-bearing invariant (two-step confirm, UI-SPEC prohibition): "Book this
// date" is `type="button"` — it only REVEALS the amber confirm panel client-side
// and NEVER submits. The closePoll server action fires ONLY from "Confirm and
// close poll" (`type="submit"`). "Keep poll open" collapses the panel with zero
// side effects. This makes an accidental one-click close structurally impossible.
import { useActionState, useState } from "react";
import { closePoll, type ClosePollState } from "@/lib/actions/close-poll";
import {
  formatDateWithTime,
  formatDateWithTimeShort,
} from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type BookItOption = {
  id: string;
  date: string;
  startTime: string | null;
};

// Structurally compatible with computeResults' OptionResult (extra tally fields
// are ignored) — only optionId + isBest drive the pre-selection/badge.
type BookItResult = {
  optionId: string;
  isBest: boolean;
};

export function BookItControl({
  adminUrlId,
  options,
  results,
}: {
  adminUrlId: string;
  options: BookItOption[];
  results: BookItResult[];
}) {
  const [state, formAction, isPending] = useActionState<
    ClosePollState,
    FormData
  >(closePoll, null);
  const [showConfirm, setShowConfirm] = useState(false);

  const bestIds = new Set(
    results.filter((r) => r.isBest).map((r) => r.optionId),
  );
  // Pre-check the chronologically-first best option (options arrive in
  // chronological order). If NO option is "best" (zero votes cast), fall back to
  // the first candidate so exactly one radio is always pre-checked — native
  // radios permit a single defaultChecked, and closePoll needs a winningOptionId.
  const preselectedId =
    options.find((o) => bestIds.has(o.id))?.id ?? options[0]?.id;

  const formError = state?.errors?._form?.[0];

  return (
    <form action={formAction}>
      <input type="hidden" name="adminUrlId" value={adminUrlId} />
      <Card className="flex flex-col gap-3 p-6">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Candidate dates</legend>
          {/* Denser responsive grid (it now lives in the narrower-then-full
              right hero). CSS grid flows in options.map SOURCE (chronological)
              order, so the chronologically-first-best preselection + Suggested
              badge stay correct (edge TV3-11). Short visible label; FULL date in
              title + aria-label for AT + hover. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2">
            {options.map((opt) => {
              const hhmm = opt.startTime ? opt.startTime.slice(0, 5) : null;
              const full = formatDateWithTime(opt.date, hhmm);
              return (
                <label
                  key={opt.id}
                  title={full}
                  aria-label={full}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-base has-[:checked]:border-foreground has-[:checked]:bg-muted"
                >
                  <input
                    type="radio"
                    name="winningOptionId"
                    value={opt.id}
                    defaultChecked={opt.id === preselectedId}
                    disabled={isPending}
                    className="size-4"
                  />
                  {formatDateWithTimeShort(opt.date, hhmm)}
                  {bestIds.has(opt.id) ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Suggested
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        {!showConfirm ? (
          <div>
            {/* type="button" — reveals the confirm panel, NEVER submits. */}
            <Button
              type="button"
              className="h-11"
              onClick={() => setShowConfirm(true)}
            >
              Book this date
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3">
            <p className="text-base">
              This closes voting for everyone. Participants who already voted
              will get an email with this date. This can&apos;t be undone.
            </p>
            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            <div className="flex gap-2">
              {/* The ONLY control that fires closePoll. */}
              <Button type="submit" className="h-11" disabled={isPending}>
                {isPending ? "Booking…" : "Confirm and close poll"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
              >
                Keep poll open
              </Button>
            </div>
          </div>
        )}
      </Card>
    </form>
  );
}

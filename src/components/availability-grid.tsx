"use client";

// AvailabilityGrid (UI-SPEC Component Spec; SPEC VOTE-02/VOTE-07; D2-06/07).
//
// A click-to-cycle 3-state grid. Each candidate option is one row: a single
// <button> that cycles no -> yes -> ifneedbe -> no on each activation. State is
// held as a Record<optionId, VoteState> and emitted upward via onChange — the
// same client-island + serialize pattern calendar-date-picker uses (D2-07); the
// surrounding VoteForm holds the hidden "votes" input.
//
// Load-bearing UI invariants:
//  - color is NEVER the only signal: every cell renders a lucide icon AND a
//    visible text label for all 3 states (accessibility precedent).
//  - the default/untouched state ("no") renders the FULL "Not available"
//    icon+label, identical in weight to a chosen cell — never blank/dimmed, so a
//    participant sees an unclicked date reads "Not available" before submitting.
//  - when disabled (closed poll) each cell is a non-interactive <span>, NOT a
//    disabled <button>, and the bulk-action row is absent entirely.
//  - date labels use formatDateWithTime (timezone-safe, D-11/P3), never new Date.
import { useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { formatDateWithTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { STATE_META, type VoteState } from "@/lib/vote-state";

// Re-export VoteState so existing importers of this module keep working
// unchanged (vote-form.tsx and the two participant-route pages import the type
// from here). The vocabulary now lives in @/lib/vote-state (single source of
// truth shared with the read-side results grid).
export type { VoteState };

export type GridOption = {
  id: string;
  date: string;
  startTime: string | null;
};

// Click order (D2-06): from the default "no", advance Available -> If-need-be ->
// Not available -> back.
const CYCLE: VoteState[] = ["yes", "ifneedbe", "no"];

function optionLabel(opt: GridOption): string {
  return formatDateWithTime(
    opt.date,
    opt.startTime ? opt.startTime.slice(0, 5) : null,
  );
}

export function AvailabilityGrid({
  options,
  initial,
  disabled = false,
  onChange,
}: {
  options: GridOption[];
  initial?: Record<string, VoteState>;
  disabled?: boolean;
  onChange: (votes: { optionId: string; state: VoteState }[]) => void;
}) {
  const [cellState, setCellState] = useState<Record<string, VoteState>>(() =>
    Object.fromEntries(options.map((o) => [o.id, initial?.[o.id] ?? "no"])),
  );
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    onChange(
      options.map((o) => ({ optionId: o.id, state: cellState[o.id] ?? "no" })),
    );
  }, [cellState, options, onChange]);

  function cycleCell(opt: GridOption) {
    const current = cellState[opt.id] ?? "no";
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    // Pure updater: merge prev (so concurrent updates to OTHER keys aren't
    // clobbered by a stale closure) with the precomputed next for THIS key.
    setCellState((prev) => ({ ...prev, [opt.id]: next }));
    // Announcement lives OUTSIDE the updater (mirrors setAll), removing the
    // Strict/concurrent-render double-invocation risk on the aria-live region.
    setAnnouncement(`${optionLabel(opt)} set to ${STATE_META[next].label}`);
  }

  function setAll(state: VoteState) {
    setCellState(Object.fromEntries(options.map((o) => [o.id, state])));
    setAnnouncement(`All dates set to ${STATE_META[state].label}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page-level live region: announces each state change for AT users. */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Bulk actions (VOTE-07) — absent entirely when read-only. */}
      {!disabled ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setAll("yes")}
          >
            <Check aria-hidden />
            Set all Available
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setAll("no")}
          >
            <X aria-hidden />
            Set all Not available
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setAll("no")}
          >
            <RotateCcw aria-hidden />
            Clear
          </Button>
        </div>
      ) : null}

      {/* One row per option, in getOptionsForPoll order (no re-sort). */}
      <ul className="flex flex-col gap-2">
        {options.map((opt) => {
          const state = cellState[opt.id] ?? "no";
          const meta = STATE_META[state];
          const label = optionLabel(opt);
          const { Icon } = meta;
          const cellClasses = `inline-flex min-h-12 w-full items-center justify-center gap-1 rounded-lg border px-3 text-sm font-semibold sm:w-auto ${meta.className}`;

          return (
            <li
              key={opt.id}
              className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-base">{label}</span>
              {disabled ? (
                <span className={cellClasses}>
                  <Icon aria-hidden className="size-4" />
                  <span>{meta.label}</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => cycleCell(opt)}
                  aria-label={`${label}: currently ${meta.label}. Activate to change.`}
                  className={`${cellClasses} cursor-pointer outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50`}
                >
                  <Icon aria-hidden className="size-4" />
                  <span>{meta.label}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

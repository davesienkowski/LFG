"use client";

// AvailabilityGrid (UI-SPEC Component Spec; SPEC VOTE-02/VOTE-07; D-01..D-08).
//
// A radio-matrix 3-state grid (Phase 5 "Matrix / 1c" redesign). Each candidate
// option is one row rendered as a role="radiogroup" of three role="radio" cells
// (Available / If-need-be / Not available) with exactly one aria-checked at a
// time — tap the state you mean, no click-to-cycle button remains. State is held
// as a Record<optionId, VoteState> and emitted upward via onChange — the same
// client-island + serialize pattern calendar-date-picker uses; the surrounding
// VoteForm holds the hidden "votes" input.
//
// Load-bearing UI invariants:
//  - color is NEVER the only signal (WCAG AA, icon-or-color-never-alone):
//      * DESKTOP (>=640px) cells are ICON-ONLY; their TEXT label lives in the
//        persistent labelled column header (grid-template-columns 1.6fr 1fr 1fr
//        1fr). This is the a11y exception for this component — the icon-only
//        radio inherits its meaning from the labelled column it sits under, and
//        each radio still carries an explicit aria-label="{date}: {state}".
//      * MOBILE (<640px) collapses to stacked full-width segments (>=48px), each
//        carrying its OWN icon AND visible text — no icon-only cell exists at
//        mobile width.
//  - EDGE-A11Y-EXCL: BOTH layouts live in the DOM; the hidden layer is removed
//    from the accessibility tree via display:none (`hidden sm:block` /
//    `sm:hidden`) so exactly ONE radiogroup-per-date is exposed to AT at any
//    viewport — the reader never announces two radiogroups for one date.
//  - the default/untouched state ("no") renders with the "Not available" radio
//    aria-checked — never blank/dimmed, so an unclicked date reads "Not
//    available" before submitting (D-04 never-blank).
//  - EDGE-IDEMPOTENT: re-selecting the already-checked state is a no-op that
//    keeps exactly one radio checked per row — a radio can never toggle OFF to a
//    blank row (reinforces D-04).
//  - EDGE-KBD: every role="radio" is a plain focusable <button> (Tab-reachable,
//    Enter/Space-activatable) — no negative tab index and no roving-tabindex, so
//    all three states stay keyboard-reachable (WCAG 2.1.1).
//  - when disabled (closed poll) each row renders a single non-interactive
//    <span> chip (icon+text), NOT a disabled <button>; no matrix, no segments,
//    and the bulk-action row is absent entirely.
//  - date labels use formatDateWithTime (timezone-safe, D-11/P3), never new Date.
import { useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import { formatDateWithTime } from "@/lib/format-date";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

// Column / segment display order (mock states 2a/2d): Available, If-need-be,
// Not available — left-to-right on desktop, top-to-bottom on mobile.
const STATE_ORDER: VoteState[] = ["yes", "ifneedbe", "no"];

// Desktop state-header text colors (mock 2a): the label row above the matrix.
const HEADER_COLOR: Record<VoteState, string> = {
  yes: "text-emerald-700",
  ifneedbe: "text-amber-700",
  no: "text-muted-foreground",
};

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

  // Direct selection (the matrix has no cycling): set THIS row to `next`. Merge
  // prev (so concurrent updates to OTHER keys aren't clobbered by a stale
  // closure). Re-selecting the already-checked state writes the same value — a
  // no-op that keeps exactly one radio checked, never blanking the row
  // (EDGE-IDEMPOTENT).
  function selectCell(opt: GridOption, next: VoteState) {
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

      {disabled ? (
        /* Closed poll (mock 2c/2e): one non-interactive chip per row — no
           matrix, no segments, no bulk row. */
        <ul className="flex flex-col gap-2.5">
          {options.map((opt) => {
            const state = cellState[opt.id] ?? "no";
            const meta = STATE_META[state];
            const { Icon } = meta;
            return (
              <li
                key={opt.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-base">{optionLabel(opt)}</span>
                <span
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold",
                    meta.className,
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          {/* DESKTOP matrix (>=640px). display:none at <640px removes this whole
              layer from the a11y tree (EDGE-A11Y-EXCL). */}
          <div data-testid="matrix-desktop" className="hidden sm:block">
            {/* Persistent labelled column headers — the icon+text that the
                icon-only radio cells below inherit their meaning from (D-02). */}
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-end gap-2 border-b px-1 pb-2.5">
              <span />
              {STATE_ORDER.map((s) => {
                const meta = STATE_META[s];
                const { Icon } = meta;
                return (
                  <span
                    key={s}
                    className={cn(
                      "flex flex-col items-center gap-1.5 text-sm font-semibold",
                      HEADER_COLOR[s],
                    )}
                  >
                    <Icon aria-hidden className="size-[18px]" />
                    {meta.label}
                  </span>
                );
              })}
            </div>

            {options.map((opt) => {
              const state = cellState[opt.id] ?? "no";
              const label = optionLabel(opt);
              return (
                <div
                  key={opt.id}
                  role="radiogroup"
                  aria-label={label}
                  className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-2 border-b px-1 py-3"
                >
                  <span className="text-base">{label}</span>
                  {STATE_ORDER.map((s) => {
                    const meta = STATE_META[s];
                    const { Icon } = meta;
                    const checked = state === s;
                    return (
                      <div key={s} className="flex justify-center">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={checked}
                          aria-label={`${label}: ${meta.label}`}
                          onClick={() => selectCell(opt, s)}
                          className={cn(
                            "flex size-11 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                            checked
                              ? meta.className
                              : "border-border bg-white",
                          )}
                        >
                          {checked ? (
                            <Icon aria-hidden className="size-5" />
                          ) : null}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* MOBILE stacked segments (<640px). display:none at >=640px removes
              this whole layer from the a11y tree (EDGE-A11Y-EXCL). Each segment
              carries its OWN icon AND visible text — no icon-only cell (D-03). */}
          <div
            data-testid="segments-mobile"
            className="flex flex-col gap-5 sm:hidden"
          >
            {options.map((opt) => {
              const state = cellState[opt.id] ?? "no";
              const label = optionLabel(opt);
              return (
                <div
                  key={opt.id}
                  role="radiogroup"
                  aria-label={label}
                  className="flex flex-col gap-2"
                >
                  <span className="text-base font-semibold">{label}</span>
                  {STATE_ORDER.map((s) => {
                    const meta = STATE_META[s];
                    const { Icon } = meta;
                    const checked = state === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={`${label}: ${meta.label}`}
                        onClick={() => selectCell(opt, s)}
                        className={cn(
                          "flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border text-[15px] font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                          checked
                            ? meta.className
                            : "border-border bg-white text-muted-foreground",
                        )}
                      >
                        <Icon aria-hidden className="size-[18px]" />
                        {meta.label}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

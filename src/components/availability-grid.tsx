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
//  - the default/untouched state is UNANSWERED: no radio is aria-checked and the
//    three cells carry a dashed "needs a choice" outline (UX-UAT F1, supersedes
//    the old D-04 "never-blank / default No"). VoteForm gates Submit until every
//    row is answered, so an untouched date is never silently recorded as "No".
//    Unanswered is a CLIENT-ONLY state (VoteState | null) — it never serializes;
//    the wire vocabulary stays yes|ifneedbe|no.
//  - EDGE-IDEMPOTENT: re-selecting the already-checked state is a no-op that
//    keeps that one radio checked (a chosen row never toggles back to unanswered
//    by re-clicking the same cell).
//  - EDGE-KBD: every role="radio" is a plain focusable <button> (Tab-reachable,
//    Enter/Space-activatable) — no negative tab index and no roving-tabindex, so
//    all three states stay keyboard-reachable (WCAG 2.1.1).
//  - when disabled (closed poll) each row renders a single non-interactive
//    <span> chip (icon+text), NOT a disabled <button>; no matrix, no segments,
//    and the bulk-action row is absent entirely.
//  - date labels use formatDateWithTime (timezone-safe, D-11/P3), never new Date.
import { useEffect, useState } from "react";
import { Check, X, RotateCcw } from "lucide-react";
import {
  formatDateWithTime,
  formatDateWithTimeShort,
  formatMonthYear,
} from "@/lib/format-date";
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

// FULL date label — used for every aria-label / role=radiogroup label / live
// announcement so assistive tech still gets the unabbreviated date (D-11/P3).
function optionLabel(opt: GridOption): string {
  return formatDateWithTime(
    opt.date,
    opt.startTime ? opt.startTime.slice(0, 5) : null,
  );
}

// CONDENSED label — the VISIBLE desktop text only (the a11y name stays full via
// optionLabel above). Halves the row width so the 2-column matrix fits.
function optionLabelShort(opt: GridOption): string {
  return formatDateWithTimeShort(
    opt.date,
    opt.startTime ? opt.startTime.slice(0, 5) : null,
  );
}

// Group options by calendar month using a pure string prefix (YYYY-MM) — no
// Date construction, so it is timezone-safe by construction. First-appearance
// (chronological) order is preserved; each group keeps its options in source
// order. A date on a month boundary groups under its OWN month (edges
// TV3-02/06). >1 distinct key => multi-month (month subheadings shown).
function groupByMonth(
  options: GridOption[],
): { key: string; options: GridOption[] }[] {
  const groups: { key: string; options: GridOption[] }[] = [];
  const byKey = new Map<string, { key: string; options: GridOption[] }>();
  for (const opt of options) {
    const key = opt.date.slice(0, 7);
    let group = byKey.get(key);
    if (!group) {
      group = { key, options: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.options.push(opt);
  }
  return groups;
}

// One labelled state-header block (empty spacer + the three icon+text column
// headers). Rendered TWICE on desktop at lg (the second mirrored above the
// right body column) so every icon-only radio still sits beneath a labelled
// header (D-02/D-06). `className` carries the display toggle (grid vs
// hidden lg:grid) so the base `grid` never conflicts on the mirrored copy.
function StateHeaderRow({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "grid-cols-[1.6fr_1fr_1fr_1fr] items-end gap-2 border-b px-1 pb-2.5",
        className,
      )}
    >
      <span />
      {STATE_ORDER.map((s) => {
        const meta = STATE_META[s];
        const { Icon } = meta;
        return (
          <span
            key={s}
            className={cn(
              "flex flex-col items-center gap-1.5 whitespace-nowrap text-sm font-semibold",
              HEADER_COLOR[s],
            )}
          >
            <Icon aria-hidden className="size-[18px]" />
            {meta.label}
          </span>
        );
      })}
    </div>
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
  onChange: (votes: { optionId: string; state: VoteState | null }[]) => void;
}) {
  // `null` = unanswered (UX-UAT F1). A returning voter seeds real states from
  // `initial`; a fresh voter starts every row unanswered.
  const [cellState, setCellState] = useState<Record<string, VoteState | null>>(
    () => Object.fromEntries(options.map((o) => [o.id, initial?.[o.id] ?? null])),
  );
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    onChange(
      options.map((o) => ({ optionId: o.id, state: cellState[o.id] ?? null })),
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

  // `state: null` clears every row back to unanswered (the "Clear" action);
  // a concrete VoteState is the "Set all …" bulk fill.
  function setAll(state: VoteState | null) {
    setCellState(Object.fromEntries(options.map((o) => [o.id, state])));
    setAnnouncement(
      state ? `All dates set to ${STATE_META[state].label}` : "All dates cleared",
    );
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
            onClick={() => setAll(null)}
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
            // Unanswered (null) is preserved distinctly here too (UX-UAT F1):
            // a participant who never voted before the poll closed reads as
            // "No response", NOT a definite "Not available" — the read-only
            // recap must not misrepresent a non-response as a deliberate No.
            const state = cellState[opt.id] ?? null;
            const meta = state ? STATE_META[state] : null;
            const Icon = meta?.Icon;
            return (
              <li
                key={opt.id}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-base">{optionLabel(opt)}</span>
                {meta && Icon ? (
                  <span
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-4 text-sm font-semibold",
                      meta.className,
                    )}
                  >
                    <Icon aria-hidden className="size-4" />
                    {meta.label}
                  </span>
                ) : (
                  <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed px-4 text-sm font-medium text-muted-foreground">
                    No response
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          {/* DESKTOP matrix (>=640px). display:none at <640px removes this whole
              layer from the a11y tree (EDGE-A11Y-EXCL). At lg it becomes a
              responsive 2-column matrix so long date lists fill the width
              instead of a 1000px+ single-column stack. */}
          <div data-testid="matrix-desktop" className="hidden sm:block">
            {/* Persistent labelled column headers — the icon+text that the
                icon-only radio cells below inherit their meaning from (D-02).
                Mirrored at lg so BOTH body columns sit under a labelled header. */}
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
              <StateHeaderRow className="grid" />
              <StateHeaderRow className="hidden lg:grid" />
            </div>

            {/* Body: exactly ONE role=radiogroup per option (source order, no
                duplication) laid out across a 2-column grid at lg. Month
                subheadings appear ONLY when the set spans >1 month; each <h3>
                is a full-width presentational grid item OUTSIDE every
                radiogroup, so radio semantics are never broken. */}
            {(() => {
              const groups = groupByMonth(options);
              const multiMonth = groups.length > 1;
              return (
                <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8 gap-y-0">
                  {groups.flatMap((group) => {
                    const rows = group.options.map((opt) => {
                      const state = cellState[opt.id] ?? null;
                      const rowUnanswered = state === null;
                      const label = optionLabel(opt);
                      const shortLabel = optionLabelShort(opt);
                      return (
                        <div
                          key={opt.id}
                          role="radiogroup"
                          aria-label={label}
                          className="grid grid-cols-[1.6fr_1fr_1fr_1fr] items-center gap-2 border-b px-1 py-3"
                        >
                          <span className="text-base">{shortLabel}</span>
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
                                      : rowUnanswered
                                        ? "border-dashed border-muted-foreground/40 bg-white hover:border-muted-foreground/70"
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
                    });
                    if (!multiMonth) return rows;
                    return [
                      <h3
                        key={`month-${group.key}`}
                        className="lg:col-span-2 pt-4 pb-1 text-sm font-semibold text-muted-foreground"
                      >
                        {formatMonthYear(group.options[0].date)}
                      </h3>,
                      ...rows,
                    ];
                  })}
                </div>
              );
            })()}
          </div>

          {/* MOBILE stacked segments (<640px). display:none at >=640px removes
              this whole layer from the a11y tree (EDGE-A11Y-EXCL). Each segment
              carries its OWN icon AND visible text — no icon-only cell (D-03). */}
          <div
            data-testid="segments-mobile"
            className="flex flex-col gap-5 sm:hidden"
          >
            {options.map((opt) => {
              const state = cellState[opt.id] ?? null;
              const rowUnanswered = state === null;
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
                            : rowUnanswered
                              ? "border-dashed border-muted-foreground/40 bg-white text-muted-foreground"
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

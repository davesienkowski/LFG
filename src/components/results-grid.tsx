"use client";

// ResultsGrid (UI-SPEC Component Spec; SPEC DASH-01..05; D3-04..07).
//
// The organizer-facing decision surface: a read-only participants × dates table
// rendered from plan 03-01's server-computed props, with three-state cells,
// per-date tallies, best-day highlighting, and a client-only date/status filter.
//
// Load-bearing invariants:
//  - color is NEVER the only signal: every cell renders a lucide icon AND a
//    visible text label (STATE_META reuse, identical to AvailabilityGrid); the
//    best-day highlight always carries the literal "Best" text alongside the
//    emerald tint.
//  - EVERY cell routes its raw vote through normalizeVoteState — a missing vote
//    or unrecognized literal renders the "Not available" chip, never blank,
//    never throws (D3-03 / SPEC AC-3).
//  - the filter is 100% in-memory over already-delivered props: no fetch, no
//    Server Action, no client navigation refresh (D3-06). The visible-row set
//    is DERIVED
//    purely during render from { dateId, status } + props (never mirrored into a
//    second useState), and the aria-live announcement is set OUTSIDE any
//    setState updater — this kills the React 19 Strict/concurrent
//    double-invocation desync Phase 2 already hit (post-quick-task-260701-il0).
//  - date labels use formatDateWithTime (timezone-safe, D-11/P3), never new Date.
//  - the component accepts NO email prop and renders no participant email or
//    token anywhere (SPEC Prohibition #1).
import { useState } from "react";
import { X } from "lucide-react";
import { formatDateWithTime } from "@/lib/format-date";
import { STATE_META, normalizeVoteState, type VoteState } from "@/lib/vote-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GridOption } from "@/components/availability-grid";
import type { OptionResult, ResultsParticipant } from "@/lib/results";

// Pure-CSS horizontal scroll-shadow (Lea Verou technique) — the right-edge fade
// cues off-screen date columns (including any best-day column) on narrow
// viewports (UI prohibition-probe: a plain overflow-x-auto with no cue is not
// acceptable). "Cover" layers are attached `local` (scroll with content) so they
// paint over the shadow at each scroll extreme; "shadow" layers are attached
// `scroll` (fixed to the scroll box) so a fade shows only while more content
// exists in that direction. Covers are listed first so they sit on top.
const SCROLL_FADE_STYLE: React.CSSProperties = {
  background: [
    "linear-gradient(to right, var(--background) 30%, transparent) 0 0 / 24px 100% no-repeat local",
    "linear-gradient(to left, var(--background) 30%, transparent) 100% 0 / 24px 100% no-repeat local",
    "linear-gradient(to right, rgba(0,0,0,0.12), transparent) 0 0 / 12px 100% no-repeat scroll",
    "linear-gradient(to left, rgba(0,0,0,0.12), transparent) 100% 0 / 12px 100% no-repeat scroll",
  ].join(", "),
};

function optionLabel(opt: GridOption): string {
  return formatDateWithTime(
    opt.date,
    opt.startTime ? opt.startTime.slice(0, 5) : null,
  );
}

function BestDayBadge() {
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
      Best
    </span>
  );
}

export function ResultsGrid({
  options,
  participants,
  results,
}: {
  options: GridOption[];
  participants: ResultsParticipant[];
  results: OptionResult[];
}) {
  const [filter, setFilter] = useState<{
    dateId: string | null;
    status: VoteState;
  }>({ dateId: null, status: "yes" });
  const [announcement, setAnnouncement] = useState("");

  // Empty state (SPEC AC-1/AC-7): no responses -> banner only, NO table, NO
  // filter control. Rendered instead of a broken/empty grid, then return early.
  if (participants.length === 0) {
    return (
      <div className="rounded-lg border bg-muted p-6 text-center">
        <p className="text-2xl font-semibold leading-snug">No responses yet</p>
        <p className="mt-2 text-base text-muted-foreground">
          No one has responded yet. Share the participant link above to start
          collecting availability.
        </p>
      </div>
    );
  }

  const resultByOption = new Map(results.map((r) => [r.optionId, r]));
  const { dateId, status } = filter;

  // DERIVED purely during render — never copied into a second useState that
  // could desync under React 19 Strict/concurrent double-invocation (DASH-05
  // concurrency finding). Filtering preserves props order (stable).
  const visible = dateId
    ? participants.filter((p) => normalizeVoteState(p.votes[dateId]) === status)
    : participants;

  function labelForDate(id: string): string {
    const opt = options.find((o) => o.id === id);
    return opt ? optionLabel(opt) : "";
  }

  // Announcement is computed from the NEXT selection values and set OUTSIDE any
  // setState updater (mirrors AvailabilityGrid's post-260701-il0 fix).
  function announceFilter(nextDateId: string | null, nextStatus: VoteState) {
    if (!nextDateId) {
      setAnnouncement(`Showing all ${participants.length} participants`);
      return;
    }
    const count = participants.filter(
      (p) => normalizeVoteState(p.votes[nextDateId]) === nextStatus,
    ).length;
    setAnnouncement(
      `${count} of ${participants.length} participants shown for ${labelForDate(nextDateId)}, ${STATE_META[nextStatus].label}`,
    );
  }

  function clearFilter() {
    setFilter({ dateId: null, status: "yes" });
    setAnnouncement(`Showing all ${participants.length} participants`);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filter control (D3-06) — pure in-memory, no network round-trip. */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="results-filter-date"
              className="text-sm font-semibold"
            >
              Date
            </label>
            <select
              id="results-filter-date"
              className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              value={dateId ?? ""}
              onChange={(e) => {
                const nextDateId = e.target.value || null;
                setFilter((f) => ({ ...f, dateId: nextDateId }));
                announceFilter(nextDateId, status);
              }}
            >
              <option value="">Choose a date…</option>
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionLabel(o)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="results-filter-status"
              className="text-sm font-semibold"
            >
              Status
            </label>
            <select
              id="results-filter-status"
              className="h-11 rounded-lg border border-input bg-background px-3 text-base"
              value={status}
              onChange={(e) => {
                const nextStatus = e.target.value as VoteState;
                setFilter((f) => ({ ...f, status: nextStatus }));
                announceFilter(dateId, nextStatus);
              }}
            >
              <option value="yes">Available</option>
              <option value="ifneedbe">If-need-be</option>
              <option value="no">Not available</option>
            </select>
          </div>

          <Button
            type="button"
            variant="ghost"
            className="h-11"
            disabled={!dateId}
            onClick={clearFilter}
          >
            <X aria-hidden />
            Clear filter
          </Button>
        </div>

        {dateId ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs font-semibold">
              {labelForDate(dateId)} · {STATE_META[status].label}
            </span>
            <span className="text-sm text-muted-foreground">
              {visible.length} of {participants.length} participants
            </span>
          </div>
        ) : null}

        {/* sr-only live region — mirrors AvailabilityGrid's announcement. */}
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </div>

      {/* overflow-x-auto wrapper carrying the scroll-edge fade affordance. */}
      <div className="overflow-x-auto" style={SCROLL_FADE_STYLE}>
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Availability results by candidate date
          </caption>
          <thead>
            <tr className="border-b">
              <th
                scope="col"
                className="sticky left-0 z-10 border-r bg-background px-3 py-2 text-left text-sm font-semibold"
              >
                Participant
              </th>
              {options.map((opt) => {
                const r = resultByOption.get(opt.id);
                const isBest = r?.isBest ?? false;
                return (
                  <th
                    key={opt.id}
                    scope="col"
                    className={cn(
                      "px-3 py-2 align-bottom text-center",
                      isBest && "bg-emerald-50",
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {optionLabel(opt)}
                      </span>
                      {isBest ? <BestDayBadge /> : null}
                      <span className="text-xs font-normal text-muted-foreground whitespace-nowrap">
                        {r?.yes ?? 0} yes · {r?.ifneedbe ?? 0} if-need-be
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {visible.length === 0 ? (
            // Zero-match filter (SPEC AC-6) — table + headers stay, tbody is a
            // single full-width message row. Distinct from the zero-participants
            // banner above (which renders no table at all).
            <tbody>
              <tr>
                <td
                  colSpan={options.length + 1}
                  className="px-3 py-8 text-center"
                >
                  <p className="text-2xl font-semibold leading-snug">
                    No participants match
                  </p>
                  <p className="mt-2 text-base text-muted-foreground">
                    Try a different date or status, or clear the filter.
                  </p>
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-b even:bg-muted/40">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 border-r bg-background px-3 py-2 text-left text-sm font-semibold whitespace-nowrap"
                  >
                    {p.name}
                  </th>
                  {options.map((opt) => {
                    const state = normalizeVoteState(p.votes[opt.id]);
                    const meta = STATE_META[state];
                    const Icon = meta.Icon;
                    const isBest = resultByOption.get(opt.id)?.isBest ?? false;
                    return (
                      <td
                        key={opt.id}
                        className={cn(
                          "px-3 py-2 text-center",
                          isBest && "bg-emerald-50/50",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
                            meta.className,
                          )}
                        >
                          <Icon aria-hidden className="size-3.5" />
                          {meta.label}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
    </div>
  );
}

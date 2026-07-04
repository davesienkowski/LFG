"use client";

// ResultsGrid (UI-SPEC Component Spec; SPEC DASH-01..05; D3-04..07).
//
// The organizer-facing decision surface: a read-only participants × dates table
// rendered from plan 03-01's server-computed props, with three-state cells,
// per-date tallies, best-day highlighting, and a client-only date/status filter.
//
// Live-UX rework (quick task 260703-r8r):
//  - BEST-FIRST COLUMNS: the best day column(s) render as the LEFTMOST data
//    column(s) via a single derived `displayOptions` array (isBest first, then
//    the chronological remainder). `displayOptions` is the SINGLE ordering
//    source — header, body cells, zero-match colSpan, and the date dropdown all
//    enumerate it, so they can never disagree. Co-best ties stay in stable
//    chronological order among themselves (Array.filter preserves order).
//  - BEST-DAY SUMMARY: a short summary above the grid names the best day(s) with
//    their real tallies, derived from the SAME resultByOption.isBest predicate
//    that drives the header "Best" badge (one source of truth — never a second
//    ranking), or "No clear best day yet" when no date has any yes vote.
//  - DECOUPLED, ALWAYS-ACTIVE FILTER: the date select offers Best day (default)
//    / specific dates (best-first) / All dates. The status filter is ALWAYS
//    applied; with "All dates" it filters standalone (participants holding the
//    status on at least one date) — no need to first pick a date.
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
//    is DERIVED purely during render from { dateSel, status } + props (never
//    mirrored into a second useState), and the aria-live announcement is set
//    OUTSIDE any setState updater — this kills the React 19 Strict/concurrent
//    double-invocation desync Phase 2 already hit (post-quick-task-260701-il0).
//  - date labels use formatDateWithTime (timezone-safe, D-11/P3), never new Date.
//  - the component accepts NO email prop and renders no participant email or
//    token anywhere (SPEC Prohibition #1).
import { useState } from "react";
import { X } from "lucide-react";
import { formatDateWithTime, formatDateWithTimeShort } from "@/lib/format-date";
import { STATE_META, normalizeVoteState, type VoteState } from "@/lib/vote-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GridOption } from "@/components/availability-grid";
import type { OptionResult, ResultsParticipant } from "@/lib/results";

// Sentinel <select> values for the two non-specific date modes. 21-char nanoids
// (the real optionIds) can never collide with these double-underscore tokens.
const BEST_DAY_VALUE = "__best__";
const ALL_DATES_VALUE = "__all__";

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

// Condensed sibling of optionLabel for the mobile date-cards (e.g. "Sat, Jul 12
// · 2:00 PM"). Same timezone-safe formatter family; never new Date().
function optionLabelShort(opt: GridOption): string {
  return formatDateWithTimeShort(
    opt.date,
    opt.startTime ? opt.startTime.slice(0, 5) : null,
  );
}

// Pure derivation: resolve the selected date-mode to a concrete optionId (or
// null = "no single date" i.e. All-dates / no-options). Used by BOTH render and
// the announcement so they can never drift.
//  - ALL_DATES_VALUE -> null (handled specially by filterParticipants)
//  - BEST_DAY_VALUE  -> displayOptions[0]?.id (leftmost = best; or, when there
//    is NO best, simply the first chronological date — deterministic degenerate
//    resolution, edge R8R-06, never a crash) ?? null (no options at all)
//  - anything else    -> that value verbatim (a specific optionId)
function resolveDateId(
  dateSel: string,
  displayOptions: GridOption[],
): string | null {
  if (dateSel === ALL_DATES_VALUE) return null;
  if (dateSel === BEST_DAY_VALUE) return displayOptions[0]?.id ?? null;
  return dateSel;
}

// Pure filter over already-delivered props (no I/O). All-dates mode is the
// decoupled standalone status filter: a participant matches when SOME option
// carries the chosen status. Otherwise resolve the single dateId and match on
// it (or return all participants when there is no date to match on).
function filterParticipants(
  participants: ResultsParticipant[],
  options: GridOption[],
  displayOptions: GridOption[],
  dateSel: string,
  status: VoteState,
): ResultsParticipant[] {
  if (dateSel === ALL_DATES_VALUE) {
    return participants.filter((p) =>
      options.some((o) => normalizeVoteState(p.votes[o.id]) === status),
    );
  }
  const dateId = resolveDateId(dateSel, displayOptions);
  if (!dateId) return participants;
  return participants.filter(
    (p) => normalizeVoteState(p.votes[dateId]) === status,
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
    dateSel: string;
    status: VoteState;
  }>({ dateSel: BEST_DAY_VALUE, status: "yes" });
  const [announcement, setAnnouncement] = useState("");
  // Mobile-only display toggle: zero-vote dates are hidden behind a "Show all
  // dates (+N)" button by default. Pure in-memory boolean (no I/O, no derived-
  // state mirror) — idempotent round-trip, D3-06 preserved.
  const [showZeroVote, setShowZeroVote] = useState(false);

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
  const { dateSel, status } = filter;

  // BEST-FIRST COLUMN ORDER (the SINGLE ordering source). `options` arrives
  // chronological; Array.filter preserves order, so best options keep their
  // chronological order among themselves (stable co-best order, edge R8R-02)
  // and the non-best remainder stays chronological. Never mutate/re-sort
  // `options`; derive a fresh array. Reordering is safe because resultByOption
  // is keyed by optionId (order-independent) and tallies/best flags are never
  // re-derived here.
  const bestOptions = options.filter((o) => resultByOption.get(o.id)?.isBest);
  const restOptions = options.filter((o) => !resultByOption.get(o.id)?.isBest);
  const displayOptions: GridOption[] = [...bestOptions, ...restOptions];

  // MOBILE partition (best-first order preserved within each group): split
  // displayOptions into dates that received ANY vote vs zero-vote dates. The two
  // predicates are exact De Morgan complements, so every date lands in exactly
  // one group. The best day always has yes>0, so it is ALWAYS in votedOptions
  // (never hidden behind the toggle). Reuses resultByOption verbatim — no
  // re-computation, no re-rank.
  const votedOptions = displayOptions.filter((o) => {
    const r = resultByOption.get(o.id);
    return (r?.yes ?? 0) > 0 || (r?.ifneedbe ?? 0) > 0;
  });
  const zeroVoteOptions = displayOptions.filter((o) => {
    const r = resultByOption.get(o.id);
    return (r?.yes ?? 0) === 0 && (r?.ifneedbe ?? 0) === 0;
  });

  // DERIVED purely during render — never copied into a second useState that
  // could desync under React 19 Strict/concurrent double-invocation
  // (post-260701-il0). filterParticipants preserves props order (stable).
  const visible = filterParticipants(
    participants,
    options,
    displayOptions,
    dateSel,
    status,
  );

  function labelForDate(id: string): string {
    const opt = options.find((o) => o.id === id);
    return opt ? optionLabel(opt) : "";
  }

  // Human-readable descriptor of the current selection, shared by the on-screen
  // chip and the announcement so they can never drift.
  function describeSelection(nextDateSel: string, nextStatus: VoteState): string {
    const statusLabel = STATE_META[nextStatus].label;
    if (nextDateSel === ALL_DATES_VALUE) {
      return `All dates · ${statusLabel}`;
    }
    if (nextDateSel === BEST_DAY_VALUE) {
      const id = resolveDateId(nextDateSel, displayOptions);
      const lbl = id ? labelForDate(id) : "—";
      return `Best day: ${lbl} · ${statusLabel}`;
    }
    return `${labelForDate(nextDateSel)} · ${statusLabel}`;
  }

  // Announcement is computed from the NEXT selection values and set OUTSIDE any
  // setState updater (mirrors AvailabilityGrid's post-260701-il0 fix): never
  // read post-update state. This is the load-bearing guard against the React 19
  // Strict/concurrent double-invocation desync (edge R8R-09 concurrency).
  function announce(nextDateSel: string, nextStatus: VoteState) {
    const count = filterParticipants(
      participants,
      options,
      displayOptions,
      nextDateSel,
      nextStatus,
    ).length;
    setAnnouncement(
      `${count} of ${participants.length} participants shown for ${describeSelection(nextDateSel, nextStatus)}`,
    );
  }

  function clearFilter() {
    setFilter({ dateSel: BEST_DAY_VALUE, status: "yes" });
    announce(BEST_DAY_VALUE, "yes");
  }

  const isAtDefault = dateSel === BEST_DAY_VALUE && status === "yes";

  // Single per-date mobile card renderer — voted and zero-vote cards render
  // IDENTICALLY. Default-open is gated on the partition-independent
  // `isBest && opt.id === displayOptions[0]?.id` (displayOptions[0] is always
  // the single leftmost/first-best card; zero-vote cards are never best -> never
  // open), preserving EDGE WFM-03 (co-best tie -> only first best opens) and
  // WFM-01/02 (no best -> none open).
  function renderDateCard(opt: GridOption) {
    const r = resultByOption.get(opt.id);
    const isBest = r?.isBest ?? false;
    return (
      <li
        key={opt.id}
        data-testid="result-date-card"
        className={cn("rounded-xl border p-4", isBest && "bg-emerald-50")}
      >
        <div className="flex flex-wrap items-center gap-2">
          {isBest ? <BestDayBadge /> : null}
          <span className="text-base font-semibold">
            {optionLabelShort(opt)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {r?.yes ?? 0} available · {r?.ifneedbe ?? 0} if-need-be
        </p>
        <details open={isBest && opt.id === displayOptions[0]?.id}>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold">
            Who&apos;s available
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {participants.map((p) => {
              const state = normalizeVoteState(p.votes[opt.id]);
              const meta = STATE_META[state];
              const Icon = meta.Icon;
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span className="text-sm">{p.name}</span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold whitespace-nowrap",
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
        </details>
      </li>
    );
  }

  // MOBILE render policy (edge XBO-04-empty handled — the list is NEVER an empty
  // list with only a toggle): when NO date has any vote, show ALL cards and NO
  // toggle; otherwise show voted cards + a "Show all dates (+N)" toggle that
  // reveals the zero-vote cards below.
  const hasVoted = votedOptions.length > 0;
  const showToggle = hasVoted && zeroVoteOptions.length > 0;
  const defaultCards = hasVoted ? votedOptions : displayOptions;

  return (
    <div className="flex flex-col gap-4">
      {/* Best-day summary — read STRICTLY from resultByOption.isBest (the SAME
          predicate as the header "Best" badge, guaranteeing the summary and the
          badged column(s) always name the identical day(s); no re-ranking,
          prohibition-probe #2). No descendant here has exact textContent
          "Best" (the phrasing is deliberately longer) so the tests' exact
          getByText("Best") queries only count header badges. */}
      {bestOptions.length === 0 ? (
        <p className="text-base font-semibold text-muted-foreground">
          No clear best day yet
        </p>
      ) : bestOptions.length === 1 ? (
        <p className="text-base font-semibold">
          Best day so far: {optionLabel(bestOptions[0])} —{" "}
          {resultByOption.get(bestOptions[0].id)?.yes ?? 0} available,{" "}
          {resultByOption.get(bestOptions[0].id)?.ifneedbe ?? 0} if-need-be
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold">Best days so far (tied):</p>
          <ul className="list-disc pl-5 text-base">
            {bestOptions.map((o) => (
              <li key={o.id}>
                {optionLabel(o)} — {resultByOption.get(o.id)?.yes ?? 0} available,{" "}
                {resultByOption.get(o.id)?.ifneedbe ?? 0} if-need-be
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter control (D3-06) — pure in-memory, no network round-trip.
          DESKTOP-ONLY (hidden sm:flex): the participant-row filter is a
          desktop affordance; the mobile surface is the date-card list below
          (locked design). At sm:+ this resolves to the ORIGINAL flex layout,
          so desktop is byte-identical. */}
      <div className="hidden sm:flex flex-col gap-3">
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
              className="h-11 min-w-[180px] rounded-lg border border-input bg-background px-3 text-base"
              value={dateSel}
              onChange={(e) => {
                const nextDateSel = e.target.value;
                setFilter((f) => ({ ...f, dateSel: nextDateSel }));
                announce(nextDateSel, status);
              }}
            >
              <option value={BEST_DAY_VALUE}>Best day</option>
              {displayOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {optionLabel(o)}
                </option>
              ))}
              <option value={ALL_DATES_VALUE}>All dates</option>
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
              className="h-11 min-w-[140px] rounded-lg border border-input bg-background px-3 text-base"
              value={status}
              onChange={(e) => {
                const nextStatus = e.target.value as VoteState;
                setFilter((f) => ({ ...f, status: nextStatus }));
                announce(dateSel, nextStatus);
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
            disabled={isAtDefault}
            onClick={clearFilter}
          >
            <X aria-hidden />
            Clear filter
          </Button>
        </div>

        {/* Selection descriptor + count — ALWAYS shown (participants exist), so
            the filtered default is never silent. */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border bg-muted px-2 py-0.5 text-xs font-semibold">
            {describeSelection(dateSel, status)}
          </span>
          <span className="text-sm text-muted-foreground">
            {visible.length} of {participants.length} participants
          </span>
        </div>

        {/* sr-only live region — mirrors AvailabilityGrid's announcement. */}
        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>
      </div>

      {/* overflow-x-auto wrapper carrying the scroll-edge fade affordance,
          inside the bordered/rounded results card container (board 3d).
          BOUNDED vertical scroll box (max-h + overflow-y-auto): required so the
          sticky <thead> top-0 actually pins — overflow-x:auto already forces
          overflow-y to compute to auto, making THIS wrapper the sticky
          containing block, so it must be a bounded box (edge TV3-09). The 70vh
          cap is generous: short tables (the common D&D case) never gain a
          vertical scrollbar and behave exactly as before; only a tall table
          scrolls internally with the header pinned. */}
      <div
        className="hidden sm:block max-h-[70vh] overflow-x-auto overflow-y-auto rounded-xl border"
        style={SCROLL_FADE_STYLE}
      >
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">
            Availability results by candidate date
          </caption>
          <thead>
            <tr className="border-b">
              <th
                scope="col"
                className="sticky top-0 left-0 z-30 border-r bg-background px-4 py-3 text-left text-sm font-semibold whitespace-nowrap"
              >
                Participant
              </th>
              {displayOptions.map((opt) => {
                const r = resultByOption.get(opt.id);
                const isBest = r?.isBest ?? false;
                return (
                  <th
                    key={opt.id}
                    scope="col"
                    className={cn(
                      // sticky top-0 + opaque bg so scrolled body cells don't
                      // show through; emerald (listed last) overrides the plain
                      // background on best columns.
                      "sticky top-0 z-20 bg-background px-4 py-3 align-bottom text-center",
                      isBest && "bg-emerald-50",
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="text-sm font-semibold whitespace-nowrap">
                        {optionLabel(opt)}
                      </span>
                      {isBest ? <BestDayBadge /> : null}
                      <span className="text-sm font-normal text-muted-foreground whitespace-nowrap">
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
                  colSpan={displayOptions.length + 1}
                  className="px-4 py-8 text-center"
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
                    className="sticky left-0 z-10 border-r bg-background px-4 py-3 text-left text-sm font-semibold whitespace-nowrap"
                  >
                    {p.name}
                  </th>
                  {displayOptions.map((opt) => {
                    const state = normalizeVoteState(p.votes[opt.id]);
                    const meta = STATE_META[state];
                    const Icon = meta.Icon;
                    const isBest = resultByOption.get(opt.id)?.isBest ?? false;
                    return (
                      <td
                        key={opt.id}
                        className={cn(
                          "px-4 py-3 text-center",
                          isBest && "bg-emerald-50/50",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm font-semibold whitespace-nowrap",
                            meta.className,
                          )}
                        >
                          <Icon aria-hidden className="size-4" />
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

      {/* MOBILE date-cards (sm:hidden) — sibling to the desktop table above.
          Best-first, reusing displayOptions (SAME ordering source) and
          resultByOption tallies verbatim (no re-ranking, no computeResults).
          Reads `participants` directly (unfiltered) because the row filter is
          desktop-only by locked design. The zero-participants early return
          fires before this is reached, so it never renders for empty input. */}
      <ul
        data-testid="results-cards-mobile"
        className="flex flex-col gap-3 sm:hidden"
      >
        {defaultCards.map((opt) => renderDateCard(opt))}
        {/* Zero-vote toggle — rendered ONLY when there ARE voted dates AND there
            ARE zero-vote dates to reveal (never a lone toggle over an empty
            list). <button aria-expanded> over the pure showZeroVote boolean;
            ≥44px tap target (min-h-11). */}
        {showToggle ? (
          <li>
            <button
              type="button"
              aria-expanded={showZeroVote}
              onClick={() => setShowZeroVote((v) => !v)}
              className="min-h-11 w-full rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {showZeroVote
                ? "Show fewer"
                : `Show all dates (+${zeroVoteOptions.length})`}
            </button>
          </li>
        ) : null}
        {showToggle && showZeroVote
          ? zeroVoteOptions.map((opt) => renderDateCard(opt))
          : null}
      </ul>
    </div>
  );
}

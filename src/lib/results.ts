// Pure results aggregation (DASH-03 tallies / DASH-04 best-day, D3-02).
//
// No DB, no I/O, never throws — takes getResultsForPoll's output plus
// getOptionsForPoll's chronological order and returns per-option yes/if-need-be
// tallies + best-day `isBest` flags in a single pass. The tie-break is the
// single highest-risk correctness surface in this phase: it lives here as a
// unit-testable pure function and is NEVER re-derived in SQL or in ResultsGrid.
//
// Ranking key is lexicographic yes desc, then if-need-be desc. Chronological
// order is only the array/display order (the caller's getOptionsForPoll order,
// which this function preserves — no re-sort); it never hides a genuine
// co-leader. All options sharing the maximal (yes, if-need-be) pair are flagged
// isBest; no option is isBest when the max yes count is 0.
import { normalizeVoteState } from "@/lib/vote-state";

export type ResultsParticipant = {
  id: string;
  name: string;
  // ORG-01 presentation flag: true for the single organizer's own row, which the
  // results grid labels "(you)". computeResults NEVER reads this — it folds in as
  // a normal participant (SC5), so best-day/tallies are unchanged. Optional so
  // pure-function callers (tests) may omit it.
  isOrganizer?: boolean;
  votes: Record<string, string>; // optionId -> raw state string (may be unrecognized)
};

export type OptionResult = {
  optionId: string;
  yes: number;
  ifneedbe: number;
  isBest: boolean;
};

export function computeResults(
  participants: ResultsParticipant[],
  options: { id: string }[], // must already be in chronological order (getOptionsForPoll)
): OptionResult[] {
  const tallies = options.map((opt) => {
    let yes = 0;
    let ifneedbe = 0;
    for (const p of participants) {
      // Gap-fill (missing vote) + unrecognized-literal fallback route through
      // the shared helper so counting and cell display never drift (D3-03).
      const state = normalizeVoteState(p.votes[opt.id]);
      if (state === "yes") yes++;
      else if (state === "ifneedbe") ifneedbe++;
    }
    return { optionId: opt.id, yes, ifneedbe };
  });

  // Best-day selection (DASH-04). No sort of `options` — chronological order is
  // already the array order; the ranking key only selects winners.
  const maxYes = tallies.reduce((m, t) => Math.max(m, t.yes), 0);
  const bestIds = new Set<string>();
  if (maxYes > 0) {
    const yesLeaders = tallies.filter((t) => t.yes === maxYes);
    const maxIfNeedBe = yesLeaders.reduce((m, t) => Math.max(m, t.ifneedbe), 0);
    for (const t of yesLeaders) {
      if (t.ifneedbe === maxIfNeedBe) bestIds.add(t.optionId); // all co-leaders
    }
  }

  return tallies.map((t) => ({ ...t, isBest: bestIds.has(t.optionId) }));
}

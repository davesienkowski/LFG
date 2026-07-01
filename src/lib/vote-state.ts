// Shared three-state availability vocabulary (D3-05 / D3-03; SPEC DASH-02).
//
// The invariant: there is exactly ONE source of truth for what the three vote
// states look like (icon + label + className) AND for what counts as an
// "unrecognized" state. Both the write-side AvailabilityGrid (cell rendering)
// and the read-side results surface (computeResults counting + ResultsGrid cell
// rendering) import from here, so the two paths can never silently drift on the
// gap-fill / unrecognized-literal fallback.
//
// Why a normalize helper: `votes.state` is a text column with NO DB CHECK
// constraint (schema.ts) — validated only by Zod at the write boundary. A
// missing (participant, option) vote, or a stray/legacy state literal, must
// resolve to "no" rather than throw or render `undefined` (closes Phase 2
// REVIEW #4; SPEC AC-3). Indexing STATE_META with a raw DB value directly is a
// bug — always route through normalizeVoteState first.
import { Check, CircleHelp, X } from "lucide-react";

export type VoteState = "yes" | "ifneedbe" | "no";

export const STATE_META: Record<
  VoteState,
  { label: string; className: string; Icon: typeof Check }
> = {
  yes: {
    label: "Available",
    Icon: Check,
    className: "bg-emerald-50 text-emerald-700 border-emerald-300",
  },
  ifneedbe: {
    label: "If-need-be",
    Icon: CircleHelp,
    className: "bg-amber-50 text-amber-700 border-amber-300",
  },
  no: {
    label: "Not available",
    Icon: X,
    className: "bg-muted text-muted-foreground border-border",
  },
};

/**
 * Gap-fill + unrecognized-literal fallback (D3-03 / SPEC AC-3, closes P2
 * REVIEW #4). Returns `state` only when it is exactly "yes" or "ifneedbe";
 * everything else — `undefined` (no vote row) or any unrecognized literal —
 * resolves to "no". Single source of truth for both counting (computeResults)
 * and cell display (ResultsGrid), so the two never drift.
 */
export function normalizeVoteState(state: string | undefined): VoteState {
  return state === "yes" || state === "ifneedbe" ? state : "no";
}

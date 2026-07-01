# Phase 3: Results Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 3-results-dashboard
**Mode:** `--auto` (recommended defaults auto-selected; requirements locked by 03-SPEC.md)
**Areas discussed:** Data fetch & aggregation, Grid layout & rendering, Sort/filter interaction, Best-day highlight

---

## Data fetch & aggregation

| Option | Description | Selected |
|--------|-------------|----------|
| Single fetch + pure helper | One admin-only read of participants+votes; per-date tallies + best-day ranking in a pure `computeResults()` TS function | ✓ |
| SQL `GROUP BY` aggregation | `getResultsAggregation` computes tallies in Postgres; separate per-participant read for cells | |

**Choice:** Single fetch + pure helper (D-01/02). **Notes:** Cells already need all vote rows, so tallies are free in JS — no 2nd query. The lexicographic tie-break (yes↓, ifneedbe↓, date↑) is the highest-risk correctness surface; a pure function makes it unit-testable. SQL GROUP BY deferred as a scaling alternative.

---

## Grid layout & rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Semantic `<table>` | `th scope=row` names, `th scope=col` dates, `overflow-x-auto` for mobile | ✓ |
| CSS-grid divs | Flex/grid divs with ARIA roles | |

**Choice:** Semantic `<table>` (D-04). **Notes:** Correct accessible structure for a 2-D grid — screen readers announce row/column headers. Cells reuse `STATE_META` icon+label (color never the only signal).

---

## Sort/filter interaction (DASH-05)

| Option | Description | Selected |
|--------|-------------|----------|
| Client filter-hide | Client island; date+status selector; hide non-matching rows; active chip + Clear + empty message | ✓ |
| Sort-to-top | Move matching rows to top, keep all visible | |
| Server round-trip | Re-query on filter change | |

**Choice:** Client-side filter-hide (D-06). **Notes:** Organizer's real question is "who's available on date X" — hiding non-matches answers it directly. All data already client-side; no round-trip. Zero-match shows an explicit message.

---

## Best-day highlight

| Option | Description | Selected |
|--------|-------------|----------|
| "Best" pill + emerald tint | Badge on winning column header(s) + emerald column tint (STATE_META.yes palette); all co-leaders badged | ✓ |
| Color tint only | Tint winning column with no text label | |

**Choice:** "Best" pill + emerald tint (D-07). **Notes:** The "Best" text label carries the signal so the highlight isn't color-only. All co-leaders (tied on yes then if-need-be) badged; none when no date has ≥1 yes.

---

## Claude's Discretion

- Exact Tailwind classes, one-component-vs-split for grid+filter, sticky-first-column detail, badge copy.

## Deferred Ideas

- SQL `GROUP BY` aggregation (scaling alternative to `computeResults`).
- Live-updating results (websockets/polling).
- CSV export / share results.
- Percentages / charts / weighted scoring.
- Participant-facing results view (intentionally admin-only).

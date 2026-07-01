// Pure computeResults tests (DASH-03 tallies / DASH-04 best-day tie-break).
//
// No DB, no DATABASE_URL, no mocks — mirrors format-date.test.ts. Every SPEC
// Edge Coverage case for DASH-03/DASH-04 is one explicit `it` with exact-value
// assertions, since the best-day tie-break is the highest-risk correctness
// surface in this phase (D3-02).
import { describe, it, expect } from "vitest";
import {
  computeResults,
  type ResultsParticipant,
  type OptionResult,
} from "./results";

const OPTIONS = [{ id: "opt-1" }, { id: "opt-2" }, { id: "opt-3" }];

function p(
  id: string,
  votes: Record<string, string>,
): ResultsParticipant {
  return { id, name: `Name ${id}`, votes };
}

function byId(results: OptionResult[]): Record<string, OptionResult> {
  return Object.fromEntries(results.map((r) => [r.optionId, r]));
}

describe("computeResults", () => {
  it("flags only the single date with the strictly highest yes count as isBest", () => {
    const participants = [
      p("a", { "opt-1": "yes", "opt-2": "yes", "opt-3": "no" }),
      p("b", { "opt-1": "yes", "opt-2": "no", "opt-3": "no" }),
      p("c", { "opt-1": "yes", "opt-2": "ifneedbe", "opt-3": "yes" }),
    ];
    const r = byId(computeResults(participants, OPTIONS));
    expect(r["opt-1"].yes).toBe(3);
    expect(r["opt-1"].isBest).toBe(true);
    expect(r["opt-2"].isBest).toBe(false);
    expect(r["opt-3"].isBest).toBe(false);
  });

  it("flags all co-leading dates tied on both yes and if-need-be", () => {
    const participants = [
      p("a", { "opt-1": "yes", "opt-2": "yes" }),
      p("b", { "opt-1": "yes", "opt-2": "yes" }),
      p("c", { "opt-1": "ifneedbe", "opt-2": "ifneedbe" }),
    ];
    const r = byId(computeResults(participants, OPTIONS));
    expect(r["opt-1"]).toMatchObject({ yes: 2, ifneedbe: 1, isBest: true });
    expect(r["opt-2"]).toMatchObject({ yes: 2, ifneedbe: 1, isBest: true });
    // opt-3 has no votes at all -> not a co-leader.
    expect(r["opt-3"]).toMatchObject({ yes: 0, ifneedbe: 0, isBest: false });
  });

  it("breaks a yes-tie by if-need-be: only the higher if-need-be date isBest", () => {
    const participants = [
      p("a", { "opt-1": "yes", "opt-2": "yes" }),
      p("b", { "opt-1": "yes", "opt-2": "yes" }),
      p("c", { "opt-1": "ifneedbe", "opt-2": "no" }),
    ];
    const r = byId(computeResults(participants, OPTIONS));
    expect(r["opt-1"]).toMatchObject({ yes: 2, ifneedbe: 1, isBest: true });
    expect(r["opt-2"]).toMatchObject({ yes: 2, ifneedbe: 0, isBest: false });
  });

  it("flags no date isBest when the max yes count is 0", () => {
    const participants = [
      p("a", { "opt-1": "ifneedbe", "opt-2": "no", "opt-3": "no" }),
      p("b", { "opt-1": "no", "opt-2": "ifneedbe", "opt-3": "no" }),
    ];
    const results = computeResults(participants, OPTIONS);
    expect(results.every((t) => t.isBest === false)).toBe(true);
    const r = byId(results);
    expect(r["opt-1"]).toMatchObject({ yes: 0, ifneedbe: 1 });
    expect(r["opt-2"]).toMatchObject({ yes: 0, ifneedbe: 1 });
  });

  it("returns all-zero tallies with zero participants and no throw", () => {
    const results = computeResults([], OPTIONS);
    expect(results).toEqual([
      { optionId: "opt-1", yes: 0, ifneedbe: 0, isBest: false },
      { optionId: "opt-2", yes: 0, ifneedbe: 0, isBest: false },
      { optionId: "opt-3", yes: 0, ifneedbe: 0, isBest: false },
    ]);
  });

  it("counts exact integer tallies for a known distribution (3 yes / 1 if-need-be)", () => {
    const participants = [
      p("a", { "opt-1": "yes" }),
      p("b", { "opt-1": "yes" }),
      p("c", { "opt-1": "yes" }),
      p("d", { "opt-1": "ifneedbe" }),
      p("e", { "opt-1": "no" }),
    ];
    const r = byId(computeResults(participants, OPTIONS));
    expect(r["opt-1"].yes).toBe(3);
    expect(r["opt-1"].ifneedbe).toBe(1);
  });

  it("gap-fills a missing (participant, option) vote to 'no' (not counted as yes/if-need-be)", () => {
    const participants = [
      // 'a' only voted opt-1; opt-2 and opt-3 are absent from the record.
      p("a", { "opt-1": "yes" }),
    ];
    const r = byId(computeResults(participants, OPTIONS));
    expect(r["opt-1"]).toMatchObject({ yes: 1, ifneedbe: 0 });
    expect(r["opt-2"]).toMatchObject({ yes: 0, ifneedbe: 0 });
    expect(r["opt-3"]).toMatchObject({ yes: 0, ifneedbe: 0 });
  });

  it("treats an unrecognized state literal as 'no' and never throws", () => {
    const participants = [
      p("a", { "opt-1": "maybe", "opt-2": "YES", "opt-3": "yes" }),
    ];
    let results: OptionResult[] | undefined;
    expect(() => {
      results = computeResults(participants, OPTIONS);
    }).not.toThrow();
    const r = byId(results!);
    // "maybe" and "YES" are unrecognized -> counted as "no", never yes/ifneedbe.
    expect(r["opt-1"]).toMatchObject({ yes: 0, ifneedbe: 0 });
    expect(r["opt-2"]).toMatchObject({ yes: 0, ifneedbe: 0 });
    expect(r["opt-3"]).toMatchObject({ yes: 1, ifneedbe: 0 });
  });

  it("returns results in the same order as the input options array (no re-sort)", () => {
    // opt-3 is the strict yes-leader; output order must still be 1,2,3.
    const participants = [
      p("a", { "opt-3": "yes" }),
      p("b", { "opt-3": "yes" }),
      p("c", { "opt-1": "yes" }),
    ];
    const results = computeResults(participants, OPTIONS);
    expect(results.map((t) => t.optionId)).toEqual(["opt-1", "opt-2", "opt-3"]);
    // The winner is still correctly flagged despite being last in display order.
    expect(byId(results)["opt-3"].isBest).toBe(true);
  });
});

// @vitest-environment jsdom
//
// ResultsGrid tests (UI prohibition-probe negatives + DASH-01..05 behavior +
// the DASH-05 concurrency/derived-state finding + the 260703-r8r rework):
//  - color is never the only signal: every cell renders a lucide icon AND a
//    visible text label; every isBest header carries "Best" AND its tally.
//  - a missing vote and an unrecognized state literal both render the
//    "Not available" chip (never blank, never throw).
//  - the tally caption is always rendered, including "0 yes · 0 if-need-be".
//  - co-leaders tied on (yes, ifneedbe) both render "Best"; all-zero-yes renders
//    no "Best" anywhere.
//  - zero participants -> "No responses yet" banner, NO <table>, NO filter.
//  - filter hides non-matching rows + shows "{count} of {total} participants";
//    zero matches renders "No participants match" with the headers intact.
//  - a rapid date->status change tracks the FINAL selection (no stale desync).
//  - selecting a date/status never invokes fetch (D3-06 no round-trip).
//
// 260703-r8r rework coverage:
//  - default selection is Best day + Available; Clear filter resets to and is
//    disabled at that default.
//  - the best day column(s) render as the LEFTMOST data column(s), even when a
//    later date is best; co-best ties stay chronological among themselves.
//  - the best-day summary names the SAME day(s) as the header "Best" badge.
//  - the status filter works standalone with Date = "All dates".
//  - "No clear best day yet" when no column has any yes vote (deterministic,
//    no crash).
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { ResultsGrid } from "./results-grid";
import { computeResults } from "@/lib/results";
import type { GridOption } from "./availability-grid";
import type { ResultsParticipant } from "@/lib/results";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const OPTIONS: GridOption[] = [
  { id: "opt-1", date: "2026-07-12", startTime: null },
  { id: "opt-2", date: "2026-07-19", startTime: "14:00:00" },
  { id: "opt-3", date: "2026-07-20", startTime: null },
];

// opt-1: yes=2 (Alex, Sam), ifneedbe=1 (Jordan) -> strict best.
// opt-2: yes=1 (Sam), ifneedbe=1 (Alex).
// opt-3: yes=0, ifneedbe=0 -> zero-vote date (Alex missing, Jordan unrecognized).
const PARTICIPANTS: ResultsParticipant[] = [
  { id: "p-alex", name: "Alex", votes: { "opt-1": "yes", "opt-2": "ifneedbe" } },
  {
    id: "p-sam",
    name: "Sam",
    votes: { "opt-1": "yes", "opt-2": "yes", "opt-3": "no" },
  },
  {
    id: "p-jordan",
    name: "Jordan",
    votes: { "opt-1": "ifneedbe", "opt-2": "no", "opt-3": "bogus-state" },
  },
];

function renderMain() {
  return render(
    <ResultsGrid
      options={OPTIONS}
      participants={PARTICIPANTS}
      results={computeResults(PARTICIPANTS, OPTIONS)}
    />,
  );
}

describe("ResultsGrid cells (color is never the only signal)", () => {
  it("renders every state chip with BOTH a lucide icon and a visible text label", () => {
    // Default (Best day + Available) shows Alex + Sam, whose cells together span
    // all three states (Available, If-need-be on opt-2, Not available on opt-3).
    renderMain();
    const table = screen.getByRole("table");

    for (const label of ["Available", "If-need-be", "Not available"]) {
      const cells = within(table).getAllByText(label);
      expect(cells.length).toBeGreaterThan(0);
      for (const cell of cells) {
        expect(cell.querySelector("svg")).not.toBeNull(); // icon present
        expect(cell.textContent).toContain(label); // label present
      }
    }
  });

  it("renders the 'Not available' chip for BOTH a missing vote and an unrecognized literal", () => {
    const opts: GridOption[] = [{ id: "o1", date: "2026-07-12", startTime: null }];
    const participants: ResultsParticipant[] = [
      { id: "miss", name: "Missing", votes: {} }, // no vote row for o1
      { id: "weird", name: "Weird", votes: { o1: "not-a-real-state" } }, // unrecognized
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    // o1 has no yes vote -> not best -> the Best day default resolves to o1 and,
    // under the always-active status filter, "Available" hides both rows. Switch
    // status to "Not available" so both no-vote rows are visible, then assert the
    // preserved behavioral intent: missing + unrecognized both render the chip.
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "no" } });

    const table = screen.getByRole("table");
    const chips = within(table).getAllByText("Not available");
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      expect(chip.querySelector("svg")).not.toBeNull();
    }
  });
});

describe("ResultsGrid column headers (tallies + best-day)", () => {
  it("always renders the exact '{yes} yes · {ifneedbe} if-need-be' tally, including the zero-vote date", () => {
    renderMain();
    expect(screen.getByText("2 yes · 1 if-need-be")).toBeTruthy(); // opt-1
    expect(screen.getByText("1 yes · 1 if-need-be")).toBeTruthy(); // opt-2
    expect(screen.getByText("0 yes · 0 if-need-be")).toBeTruthy(); // opt-3 zero-vote
  });

  it("renders the 'Best' badge only on the strict yes-leader column", () => {
    renderMain();
    // Scoped to the table: the mobile date-cards ALSO badge the best day, so an
    // unscoped getAllByText would double-count (jsdom renders both branches).
    expect(
      within(screen.getByRole("table")).getAllByText("Best"),
    ).toHaveLength(1); // opt-1 only
  });

  it("renders 'Best' on BOTH co-leading columns tied on (yes, ifneedbe)", () => {
    const opts: GridOption[] = [
      { id: "a", date: "2026-07-12", startTime: null },
      { id: "b", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { a: "yes", b: "yes" } },
      { id: "p2", name: "P2", votes: { a: "yes", b: "yes" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    expect(
      within(screen.getByRole("table")).getAllByText("Best"),
    ).toHaveLength(2); // both co-leaders
  });

  it("renders NO 'Best' badge when no column has any yes vote", () => {
    const opts: GridOption[] = [
      { id: "a", date: "2026-07-12", startTime: null },
      { id: "b", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { a: "ifneedbe", b: "no" } },
      { id: "p2", name: "P2", votes: { a: "no", b: "ifneedbe" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    expect(screen.queryByText("Best")).toBeNull();
  });

  it("renders 'Best' AND its supporting tally together in the same column header (badge never alone)", () => {
    renderMain();
    const badge = within(screen.getByRole("table")).getByText("Best");
    const header = badge.closest("th");
    expect(header).not.toBeNull();
    // the SAME <th> carries the tally caption — the badge is never shown alone.
    expect(within(header as HTMLElement).getByText("2 yes · 1 if-need-be")).toBeTruthy();
  });
});

describe("ResultsGrid best-first column order (260703-r8r)", () => {
  it("renders the best day as the LEFTMOST data column even when a later date is best", () => {
    // e2 (July 19) is the strict best though it is NOT chronologically first.
    const opts: GridOption[] = [
      { id: "e1", date: "2026-07-12", startTime: null },
      { id: "e2", date: "2026-07-19", startTime: null },
      { id: "e3", date: "2026-07-26", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { e1: "yes", e2: "yes", e3: "no" } },
      { id: "p2", name: "P2", votes: { e1: "no", e2: "yes", e3: "no" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    // index 0 is the sticky "Participant" header; index 1 is the FIRST data col.
    expect(within(headers[0]).getByText("Participant")).toBeTruthy();
    expect(within(headers[1]).getByText("Best")).toBeTruthy();
    expect(within(headers[1]).getByText(/July 19/)).toBeTruthy(); // best is leftmost
    // 7/12 (chronologically earlier, non-best) is pushed to a LATER column.
    const laterLabels = headers
      .slice(2)
      .some((h) => /July 12/.test(h.textContent ?? ""));
    expect(laterLabels).toBe(true);
  });

  it("renders co-best (tied) days as separate LEFTMOST columns in chronological order among themselves", () => {
    // c1 (7/12) and c2 (7/19) are co-best; mid (7/15) is non-best.
    const opts: GridOption[] = [
      { id: "c1", date: "2026-07-12", startTime: null },
      { id: "mid", date: "2026-07-15", startTime: null },
      { id: "c2", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { c1: "yes", mid: "no", c2: "yes" } },
      { id: "p2", name: "P2", votes: { c1: "yes", mid: "no", c2: "yes" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    const headers = screen.getAllByRole("columnheader");
    // co-best leftmost, chronological among themselves: 7/12 then 7/19.
    expect(within(headers[1]).getByText(/July 12/)).toBeTruthy();
    expect(within(headers[1]).getByText("Best")).toBeTruthy();
    expect(within(headers[2]).getByText(/July 19/)).toBeTruthy();
    expect(within(headers[2]).getByText("Best")).toBeTruthy();
    // non-best 7/15 pushed right (after the co-best group).
    expect(within(headers[3]).getByText(/July 15/)).toBeTruthy();
    expect(
      within(screen.getByRole("table")).getAllByText("Best"),
    ).toHaveLength(2);
  });

  it("names the SAME best day in the summary as the header 'Best' badge (one source of truth)", () => {
    renderMain();
    const summary = screen.getByText(/Best day so far/);
    // opt-1 (July 12) is the badged column; the summary references it + its tally.
    expect(summary.textContent).toMatch(/July 12/);
    expect(summary.textContent).toMatch(/2 available/);
    expect(summary.textContent).toMatch(/1 if-need-be/);
  });
});

describe("ResultsGrid empty vs zero-match states (distinct)", () => {
  it("zero participants renders the 'No responses yet' banner, NO table, NO filter control", () => {
    render(<ResultsGrid options={OPTIONS} participants={[]} results={computeResults([], OPTIONS)} />);
    expect(screen.getByText("No responses yet")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.queryByLabelText("Date")).toBeNull(); // filter control absent
    expect(screen.queryByLabelText("Status")).toBeNull();
  });

  it("a zero-match filter renders 'No participants match' WITH the table + headers intact", () => {
    renderMain();
    // opt-3 has zero yes votes; default status is Available -> zero matches.
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "opt-3" } });

    expect(screen.getByText("No participants match")).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy(); // table still present
    expect(screen.getByText("2 yes · 1 if-need-be")).toBeTruthy(); // headers intact
    expect(screen.getByText("0 of 3 participants")).toBeTruthy();
    // no participant rows visible IN THE TABLE (mobile cards list all names).
    expect(within(screen.getByRole("table")).queryByText("Alex")).toBeNull();
  });

  it("renders 'No clear best day yet' when no column has any yes vote, without throwing", () => {
    const opts: GridOption[] = [
      { id: "a", date: "2026-07-12", startTime: null },
      { id: "b", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { a: "ifneedbe", b: "no" } },
      { id: "p2", name: "P2", votes: { a: "no", b: "ifneedbe" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    expect(screen.getByText(/No clear best day yet/)).toBeTruthy();
    expect(screen.queryByText("Best")).toBeNull(); // no badge anywhere
    // Best day mode resolves deterministically to the first date -> a valid
    // (here zero-match) render, not a crash.
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("ResultsGrid client-only filter (D3-06)", () => {
  it("defaults to Best day + Available with the Clear button disabled", () => {
    renderMain();
    expect((screen.getByLabelText("Date") as HTMLSelectElement).value).toBe("__best__");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("yes");
    // Best resolves to opt-1; Available -> Alex + Sam visible, Jordan hidden.
    // Table-scoped: the mobile date-cards list ALL names unfiltered.
    const table = screen.getByRole("table");
    expect(screen.getByText("2 of 3 participants")).toBeTruthy();
    expect(within(table).getByText("Alex")).toBeTruthy();
    expect(within(table).getByText("Sam")).toBeTruthy();
    expect(within(table).queryByText("Jordan")).toBeNull();
    expect(
      (screen.getByRole("button", { name: /Clear filter/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("hides non-matching rows and shows '{count} of {total} participants'", () => {
    renderMain();
    // Default status "Available"; select opt-1 (Alex + Sam are yes).
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "opt-1" } });

    const table = screen.getByRole("table");
    expect(screen.getByText("2 of 3 participants")).toBeTruthy();
    expect(within(table).getByText("Alex")).toBeTruthy();
    expect(within(table).getByText("Sam")).toBeTruthy();
    expect(within(table).queryByText("Jordan")).toBeNull(); // ifneedbe on opt-1 -> hidden
  });

  it("filters by status standalone with Date = All dates (across all dates)", () => {
    renderMain();
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "__all__" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ifneedbe" } });

    // Alex (opt-2 if-need-be) + Jordan (opt-1 if-need-be) hold the status on
    // SOME date; Sam holds it on none -> hidden. Proves status filters WITHOUT
    // a specific date selected.
    const table = screen.getByRole("table");
    expect(screen.getByText("2 of 3 participants")).toBeTruthy();
    expect(within(table).getByText("Alex")).toBeTruthy();
    expect(within(table).getByText("Jordan")).toBeTruthy();
    expect(within(table).queryByText("Sam")).toBeNull();
  });

  it("tracks the FINAL selection after a rapid date->status change (no stale desync)", () => {
    renderMain();
    // date -> opt-1 (status still Available: Alex, Sam)
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "opt-1" } });
    // status -> If-need-be (opt-1 ifneedbe: only Jordan)
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ifneedbe" } });

    const table = screen.getByRole("table");
    expect(screen.getByText("1 of 3 participants")).toBeTruthy();
    expect(within(table).getByText("Jordan")).toBeTruthy();
    expect(within(table).queryByText("Alex")).toBeNull();
    expect(within(table).queryByText("Sam")).toBeNull();
  });

  it("does NOT invoke fetch when the filter selection changes", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    renderMain();

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "opt-1" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "ifneedbe" } });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("'Clear filter' resets to the Best day + Available default and disables itself", () => {
    renderMain();
    // Move OFF default in both dimensions.
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "__all__" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "no" } });

    fireEvent.click(screen.getByRole("button", { name: /Clear filter/ }));

    // Back to the Best day + Available default.
    const table = screen.getByRole("table");
    expect((screen.getByLabelText("Date") as HTMLSelectElement).value).toBe("__best__");
    expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("yes");
    expect(screen.getByText("2 of 3 participants")).toBeTruthy();
    expect(within(table).getByText("Alex")).toBeTruthy();
    expect(within(table).getByText("Sam")).toBeTruthy();
    expect(within(table).queryByText("Jordan")).toBeNull();
    expect(
      (screen.getByRole("button", { name: /Clear filter/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });
});

describe("ResultsGrid mobile date-cards (260703-wfm)", () => {
  it("renders only VOTED date-cards by default, best-first, badged (opt-3 zero-vote hidden)", () => {
    renderMain();
    const mobile = screen.getByTestId("results-cards-mobile");
    const cards = within(mobile).getAllByTestId("result-date-card");
    expect(cards).toHaveLength(2); // opt-1 + opt-2 (opt-3 zero-vote hidden)
    // opt-1 (July 12) is the strict best -> leftmost/first card, badged.
    expect(cards[0].textContent).toContain("Best");
    expect(cards[0].textContent).toMatch(/Jul 12/);
    expect(within(mobile).getAllByText("Best")).toHaveLength(1);
    // Tally uses the word "available" (distinct from the desktop "yes" header).
    expect(within(mobile).getByText("2 available · 1 if-need-be")).toBeTruthy();
    // opt-3 (July 20, zero-vote) is hidden behind the toggle by default.
    expect(within(mobile).queryByText(/Jul 20/)).toBeNull();
  });

  it("lists EVERY participant (unfiltered) with an icon+label state chip", () => {
    renderMain();
    const mobile = screen.getByTestId("results-cards-mobile");
    // All three names appear regardless of the desktop default filter.
    expect(within(mobile).getAllByText("Alex").length).toBeGreaterThan(0);
    expect(within(mobile).getAllByText("Sam").length).toBeGreaterThan(0);
    expect(within(mobile).getAllByText("Jordan").length).toBeGreaterThan(0);
    // Each state chip carries BOTH an icon and its text label (never color-only).
    for (const label of ["Available", "If-need-be", "Not available"]) {
      const chips = within(mobile).getAllByText(label);
      expect(chips.length).toBeGreaterThan(0);
      for (const chip of chips) {
        expect(chip.querySelector("svg")).not.toBeNull();
      }
    }
  });

  it("opens ONLY the first best card by default (exactly one)", () => {
    renderMain();
    const mobile = screen.getByTestId("results-cards-mobile");
    const details = mobile.querySelectorAll("details");
    // Default renders only the 2 voted cards (opt-3 zero-vote is hidden).
    expect(details).toHaveLength(2);
    expect((details[0] as HTMLDetailsElement).open).toBe(true); // best (opt-1)
    expect((details[1] as HTMLDetailsElement).open).toBe(false);
  });

  it("hides zero-vote dates behind a 'Show all dates' toggle (XBO-04)", () => {
    renderMain();
    const mobile = screen.getByTestId("results-cards-mobile");
    const toggle = within(mobile).getByRole("button", {
      name: /Show all dates \(\+1\)/,
    });
    expect(toggle.getAttribute("type")).toBe("button");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.classList.contains("min-h-11")).toBe(true);
    // Collapsed: opt-3 hidden, only the 2 voted cards render.
    expect(within(mobile).getAllByTestId("result-date-card")).toHaveLength(2);
    expect(within(mobile).queryByText(/Jul 20/)).toBeNull();

    fireEvent.click(toggle);

    // Expanded: opt-3 revealed below the voted cards.
    expect(within(mobile).getAllByTestId("result-date-card")).toHaveLength(3);
    expect(within(mobile).getByText(/Jul 20/)).toBeTruthy();
    expect(within(mobile).getByText("0 available · 0 if-need-be")).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.textContent).toMatch(/Show fewer/);

    fireEvent.click(toggle);

    // Idempotent round-trip: back to the 2 voted cards.
    expect(within(mobile).getAllByTestId("result-date-card")).toHaveLength(2);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.textContent).toMatch(/Show all dates/);
  });

  it("renders NO toggle when every date has votes", () => {
    const opts: GridOption[] = [
      { id: "a", date: "2026-07-12", startTime: null },
      { id: "b", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { a: "yes", b: "yes" } },
      { id: "p2", name: "P2", votes: { a: "yes", b: "yes" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    const mobile = screen.getByTestId("results-cards-mobile");
    expect(
      within(mobile).queryByRole("button", { name: /Show all dates/ }),
    ).toBeNull();
    expect(within(mobile).getAllByTestId("result-date-card")).toHaveLength(
      opts.length,
    );
  });

  it("renders ALL cards and NO toggle when no date has any vote (edge XBO-04-empty)", () => {
    const opts: GridOption[] = [
      { id: "a", date: "2026-07-12", startTime: null },
      { id: "b", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { a: "no", b: "no" } },
      { id: "p2", name: "P2", votes: { a: "no", b: "no" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    const mobile = screen.getByTestId("results-cards-mobile");
    // All zero-vote -> render ALL cards, NO lone toggle over an empty list.
    expect(within(mobile).getAllByTestId("result-date-card")).toHaveLength(
      opts.length,
    );
    expect(
      within(mobile).queryByRole("button", { name: /Show all dates/ }),
    ).toBeNull();
  });

  it("EDGE WFM-03: under a co-best TIE badges both but opens only the FIRST", () => {
    const opts: GridOption[] = [
      { id: "c1", date: "2026-07-12", startTime: null },
      { id: "mid", date: "2026-07-15", startTime: null },
      { id: "c2", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { c1: "yes", mid: "no", c2: "yes" } },
      { id: "p2", name: "P2", votes: { c1: "yes", mid: "no", c2: "yes" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    const mobile = screen.getByTestId("results-cards-mobile");
    expect(within(mobile).getAllByText("Best")).toHaveLength(2); // both badged
    const details = mobile.querySelectorAll("details");
    expect((details[0] as HTMLDetailsElement).open).toBe(true); // first best only
    expect((details[1] as HTMLDetailsElement).open).toBe(false);
  });

  it("EDGE WFM-01/02: with no best day, NO mobile card is open", () => {
    const opts: GridOption[] = [
      { id: "a", date: "2026-07-12", startTime: null },
      { id: "b", date: "2026-07-19", startTime: null },
    ];
    const participants: ResultsParticipant[] = [
      { id: "p1", name: "P1", votes: { a: "ifneedbe", b: "no" } },
      { id: "p2", name: "P2", votes: { a: "no", b: "ifneedbe" } },
    ];
    render(
      <ResultsGrid
        options={opts}
        participants={participants}
        results={computeResults(participants, opts)}
      />,
    );
    const mobile = screen.getByTestId("results-cards-mobile");
    const details = mobile.querySelectorAll("details");
    for (const d of details) {
      expect((d as HTMLDetailsElement).open).toBe(false);
    }
  });
});

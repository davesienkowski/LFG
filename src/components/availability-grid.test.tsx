// @vitest-environment jsdom
//
// AvailabilityGrid tests — Matrix / 1c radio-grid semantics (D-01..D-08).
//
// The redesign replaced the single click-to-cycle <button> per date with a
// role="radiogroup" of three role="radio" cells; these tests assert the radio
// contract plus the two load-bearing a11y guarantees:
//  - radio semantics (radiogroup / radio / aria-checked), NOT click-to-cycle.
//  - unanswered default (UX-UAT F1, supersedes the old D-04 "never-blank / No"):
//    every untouched row starts with NO radio aria-checked; re-selecting a
//    checked radio stays checked, never blanks the row (EDGE-IDEMPOTENT).
//  - bulk actions (Set all Available / Clear-to-unanswered) + a single override.
//  - read-only (disabled) renders non-interactive chips (a real recorded state,
//    or "No response" for an unanswered date), no radios, no bulk row.
//  - a11y-1 (desktop column-header association): icon-only desktop radio cells
//    carry an aria-label whose state suffix equals one of the labelled column
//    headers — the cell inherits its meaning from the labelled column (D-02/D-06).
//  - a11y-2 (mobile segmented fallback): every mobile segment carries BOTH an
//    icon AND visible text — no icon-only cell exists at mobile width (D-03/D-06).
//
// Both layouts render into the DOM at once (desktop matrix + mobile segments);
// jsdom does not evaluate the `hidden sm:block` / `sm:hidden` media queries, so
// every state renders twice. Layer-specific assertions are scoped with
// `within(screen.getByTestId("matrix-desktop"))` /
// `within(screen.getByTestId("segments-mobile"))` to avoid double-counting.
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { AvailabilityGrid, type GridOption } from "./availability-grid";

afterEach(() => cleanup());

const OPTIONS: GridOption[] = [
  { id: "opt-1", date: "2026-07-12", startTime: null },
  { id: "opt-2", date: "2026-07-19", startTime: "14:00:00" },
];

// State-suffix matchers for the radio accessible names ("{date}: {state}").
// "Available" (capital A) never matches "Not available" (lowercase a), so these
// three regexes select exactly one radio per state within a scoped radiogroup.
const AVAILABLE = /: Available$/;
const IFNEEDBE = /: If-need-be$/;
const NOT_AVAILABLE = /: Not available$/;

function matrix() {
  return within(screen.getByTestId("matrix-desktop"));
}
function segments() {
  return within(screen.getByTestId("segments-mobile"));
}
function checked(el: HTMLElement): string | null {
  return el.getAttribute("aria-checked");
}

describe("AvailabilityGrid (radio matrix)", () => {
  it("defaults every row to unanswered — no radio checked (UX-UAT F1)", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);

    const rows = matrix().getAllByRole("radiogroup");
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      // Untouched rows now start unanswered — the pessimal "default to No" is
      // gone, so none of the three radios is aria-checked.
      expect(
        checked(within(row).getByRole("radio", { name: NOT_AVAILABLE })),
      ).toBe("false");
      expect(
        checked(within(row).getByRole("radio", { name: AVAILABLE })),
      ).toBe("false");
      expect(
        checked(within(row).getByRole("radio", { name: IFNEEDBE })),
      ).toBe("false");
    }
  });

  it("Set all Available checks every yes radio; a single direct override changes only that row", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Set all Available" }));
    const rows = matrix().getAllByRole("radiogroup");
    for (const row of rows) {
      expect(
        checked(within(row).getByRole("radio", { name: AVAILABLE })),
      ).toBe("true");
    }

    // Direct selection (NOT a cycle): click row 1's If-need-be radio.
    fireEvent.click(within(rows[0]).getByRole("radio", { name: IFNEEDBE }));
    // Row 1 flipped to If-need-be; its yes radio is now unchecked.
    expect(
      checked(within(rows[0]).getByRole("radio", { name: IFNEEDBE })),
    ).toBe("true");
    expect(
      checked(within(rows[0]).getByRole("radio", { name: AVAILABLE })),
    ).toBe("false");
    // Row 2 is untouched by the override — still Available.
    expect(
      checked(within(rows[1]).getByRole("radio", { name: AVAILABLE })),
    ).toBe("true");
  });

  it("re-selecting the already-checked state stays selected (never blanks, EDGE-IDEMPOTENT)", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);

    const row = matrix().getAllByRole("radiogroup")[0];
    const noRadio = within(row).getByRole("radio", { name: NOT_AVAILABLE });
    // Rows start unanswered now — select "Not available" first, then re-click it.
    expect(checked(noRadio)).toBe("false");
    fireEvent.click(noRadio);
    expect(checked(noRadio)).toBe("true");

    // Click the already-checked "Not available" radio again — no-op, stays checked.
    fireEvent.click(noRadio);
    expect(checked(noRadio)).toBe("true");
    // Exactly one radio checked in the row (the other two remain unchecked).
    expect(
      checked(within(row).getByRole("radio", { name: AVAILABLE })),
    ).toBe("false");
    expect(
      checked(within(row).getByRole("radio", { name: IFNEEDBE })),
    ).toBe("false");
  });

  it("Clear resets every row to unanswered — no radio checked (UX-UAT F1)", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Set all Available" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    // Clear now truly clears (back to unanswered), rather than setting every
    // row to "Not available" — so no radio is checked in any row.
    for (const row of matrix().getAllByRole("radiogroup")) {
      expect(
        checked(within(row).getByRole("radio", { name: NOT_AVAILABLE })),
      ).toBe("false");
      expect(
        checked(within(row).getByRole("radio", { name: AVAILABLE })),
      ).toBe("false");
      expect(
        checked(within(row).getByRole("radio", { name: IFNEEDBE })),
      ).toBe("false");
    }
  });

  it("seeds cell state from the initial prop", () => {
    render(
      <AvailabilityGrid
        options={OPTIONS}
        initial={{ "opt-1": "yes", "opt-2": "ifneedbe" }}
        onChange={vi.fn()}
      />,
    );

    const rows = matrix().getAllByRole("radiogroup");
    expect(checked(within(rows[0]).getByRole("radio", { name: AVAILABLE }))).toBe(
      "true",
    );
    expect(checked(within(rows[1]).getByRole("radio", { name: IFNEEDBE }))).toBe(
      "true",
    );
  });

  it("emits every option via onChange, unanswered rows as null (UX-UAT F1)", () => {
    const onChange = vi.fn();
    render(<AvailabilityGrid options={OPTIONS} onChange={onChange} />);
    // Emits once on mount with all options unanswered (null) — VoteForm reads
    // this to gate Submit until every row is answered.
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual([
      { optionId: "opt-1", state: null },
      { optionId: "opt-2", state: null },
    ]);
  });

  it("renders read-only chips with no radios and no bulk actions when disabled", () => {
    // A participant WITH a recorded response — their real states render as chips.
    render(
      <AvailabilityGrid
        options={OPTIONS}
        initial={{ "opt-1": "yes", "opt-2": "no" }}
        disabled
        onChange={vi.fn()}
      />,
    );
    // No interactive radios and no bulk-action buttons.
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(
      screen.queryByRole("button", { name: "Set all Available" }),
    ).toBeNull();
    // Recorded answers are visible as chips (icon + label).
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByText("Not available")).toBeTruthy();
  });

  it("renders 'No response' (not 'Not available') for an unanswered date when disabled (UX-UAT F1)", () => {
    // A participant who NEVER voted before the poll closed — every date reads as
    // "No response", never a definite "Not available".
    render(<AvailabilityGrid options={OPTIONS} disabled onChange={vi.fn()} />);
    expect(screen.getAllByText("No response")).toHaveLength(2);
    expect(screen.queryByText("Not available")).toBeNull();
  });

  // ---- a11y-1: desktop column-header association (D-02 / D-06) ----
  it("associates each icon-only desktop radio with a labelled column header", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);
    const desktop = matrix();

    // The three state labels render as TEXT twice each — the header block is
    // mirrored (one above each body column) at lg so every icon-only radio sits
    // beneath a labelled header (D-02/D-06). The desktop radio cells themselves
    // stay icon-only (no visible text).
    expect(desktop.getAllByText("Available")).toHaveLength(2);
    expect(desktop.getAllByText("If-need-be")).toHaveLength(2);
    expect(desktop.getAllByText("Not available")).toHaveLength(2);

    // Every desktop radio's accessible name ends with one of those column
    // labels — the icon-only cell inherits its meaning from the labelled column.
    const columnLabels = ["Available", "If-need-be", "Not available"];
    const radios = desktop.getAllByRole("radio");
    expect(radios).toHaveLength(6); // 3 states × 2 rows
    for (const radio of radios) {
      const name = radio.getAttribute("aria-label") ?? "";
      const suffix = name.split(": ").at(-1);
      expect(columnLabels).toContain(suffix);
    }
  });

  // ---- a11y-2: mobile segmented fallback (D-03 / D-06) ----
  it("renders mobile segments with BOTH an icon and visible text (no icon-only cell)", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);

    const row = segments().getAllByRole("radiogroup")[0];
    const AVAIL = within(row).getByRole("radio", { name: AVAILABLE });
    const IFNB = within(row).getByRole("radio", { name: IFNEEDBE });
    const NOTAVL = within(row).getByRole("radio", { name: NOT_AVAILABLE });

    // Each mobile segment carries its own icon (svg) AND its own visible text —
    // the key contrast with the desktop cell, which has no visible text child.
    expect(AVAIL.querySelector("svg")).not.toBeNull();
    expect(within(AVAIL).getByText("Available")).toBeTruthy();
    expect(IFNB.querySelector("svg")).not.toBeNull();
    expect(within(IFNB).getByText("If-need-be")).toBeTruthy();
    expect(NOTAVL.querySelector("svg")).not.toBeNull();
    expect(within(NOTAVL).getByText("Not available")).toBeTruthy();
  });
});

// @vitest-environment jsdom
//
// AvailabilityGrid tests (UI-SPEC prohibitions):
//  - color is never the only signal: every state renders a lucide icon AND a
//    visible text label
//  - the untouched/default cell shows the full "Not available" label, not blank
//  - Set all Available -> all yes; a single-cell click then overrides ONLY that
//    cell; Clear resets every cell to "no"
//  - disabled (closed poll) renders non-interactive <span>s, NOT <button>s, and
//    omits the bulk-action row
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

function cellButtons(name: RegExp) {
  return screen.getAllByRole("button", { name });
}

describe("AvailabilityGrid", () => {
  it("renders every untouched cell with the full 'Not available' icon + label", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);
    const cells = cellButtons(/currently Not available/);
    expect(cells).toHaveLength(2);
    for (const cell of cells) {
      // icon AND text label are both present (color is never the only signal).
      expect(cell.querySelector("svg")).not.toBeNull();
      expect(within(cell).getByText("Not available")).toBeTruthy();
    }
  });

  it("Set all Available makes every cell yes; a single click overrides only that cell", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Set all Available" }));
    const available = cellButtons(/currently Available/);
    expect(available).toHaveLength(2);
    for (const cell of available) {
      expect(cell.querySelector("svg")).not.toBeNull();
      expect(within(cell).getByText("Available")).toBeTruthy();
    }

    // One more click on the first cell cycles yes -> ifneedbe, overriding ONLY it.
    fireEvent.click(available[0]);
    const ifneedbe = cellButtons(/currently If-need-be/);
    expect(ifneedbe).toHaveLength(1);
    expect(ifneedbe[0].querySelector("svg")).not.toBeNull();
    expect(within(ifneedbe[0]).getByText("If-need-be")).toBeTruthy();
    // The other cell is untouched by the override.
    expect(cellButtons(/currently Available/)).toHaveLength(1);
  });

  it("Clear resets every cell to Not available", () => {
    render(<AvailabilityGrid options={OPTIONS} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Set all Available" }));
    expect(cellButtons(/currently Available/)).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(cellButtons(/currently Not available/)).toHaveLength(2);
  });

  it("seeds cell state from the initial prop", () => {
    render(
      <AvailabilityGrid
        options={OPTIONS}
        initial={{ "opt-1": "yes", "opt-2": "ifneedbe" }}
        onChange={vi.fn()}
      />,
    );
    expect(cellButtons(/currently Available/)).toHaveLength(1);
    expect(cellButtons(/currently If-need-be/)).toHaveLength(1);
  });

  it("emits the serialized votes for every option via onChange", () => {
    const onChange = vi.fn();
    render(<AvailabilityGrid options={OPTIONS} onChange={onChange} />);
    // Emits once on mount with all options defaulting to 'no'.
    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toEqual([
      { optionId: "opt-1", state: "no" },
      { optionId: "opt-2", state: "no" },
    ]);
  });

  it("renders read-only cells as non-interactive spans with no bulk actions", () => {
    render(<AvailabilityGrid options={OPTIONS} disabled onChange={vi.fn()} />);
    // No interactive grid cells and no bulk-action buttons.
    expect(screen.queryAllByRole("button", { name: /currently/ })).toHaveLength(
      0,
    );
    expect(
      screen.queryByRole("button", { name: "Set all Available" }),
    ).toBeNull();
    // The recorded answer is still visible as icon + label.
    const labels = screen.getAllByText("Not available");
    expect(labels).toHaveLength(2);
  });
});

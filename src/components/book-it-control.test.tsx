// @vitest-environment jsdom
//
// BookItControl tests — the UI-SPEC two-step-confirm prohibition (a single click
// must NEVER fire closePoll) and the D-08 best-day pre-selection. closePoll is
// mocked so the client island renders without pulling in the server-action graph.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/lib/actions/close-poll", () => ({
  closePoll: vi.fn(async () => null),
}));

import { BookItControl } from "./book-it-control";

afterEach(() => cleanup());

const options = [
  { id: "opt-a", date: "2026-09-01", startTime: null },
  { id: "opt-b", date: "2026-09-02", startTime: "18:00:00" },
];

describe("BookItControl — two-step confirm (UI-SPEC prohibition)", () => {
  it("shows no submit/confirm control until 'Book this date' is clicked; the trigger is type=button", () => {
    render(
      <BookItControl
        adminUrlId="admin-1"
        options={options}
        results={[
          { optionId: "opt-a", isBest: false },
          { optionId: "opt-b", isBest: true },
        ]}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Book this date" });
    // The trigger is type=button — clicking it can never submit the form.
    expect(trigger.getAttribute("type")).toBe("button");
    // Before the disclosure: NO confirm/submit control exists in the DOM.
    expect(
      screen.queryByRole("button", { name: /Confirm and close poll/ }),
    ).toBeNull();

    fireEvent.click(trigger);

    // After the disclosure: the submit control appears (type=submit) + cancel.
    const confirm = screen.getByRole("button", {
      name: /Confirm and close poll/,
    });
    expect(confirm.getAttribute("type")).toBe("submit");
    expect(
      screen.getByRole("button", { name: "Keep poll open" }),
    ).toBeTruthy();
  });

  it("'Keep poll open' collapses the confirm panel with no side effects", () => {
    render(
      <BookItControl
        adminUrlId="admin-1"
        options={options}
        results={[{ optionId: "opt-b", isBest: true }]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Book this date" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep poll open" }));
    // Back to the plain picker: the confirm control is gone, the trigger returns.
    expect(
      screen.queryByRole("button", { name: /Confirm and close poll/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Book this date" }),
    ).toBeTruthy();
  });
});

describe("BookItControl — pre-selection (D-08)", () => {
  it("pre-checks the best option and badges it 'Suggested'", () => {
    render(
      <BookItControl
        adminUrlId="admin-1"
        options={options}
        results={[
          { optionId: "opt-a", isBest: false },
          { optionId: "opt-b", isBest: true },
        ]}
      />,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0].value).toBe("opt-a");
    expect(radios[0].checked).toBe(false);
    expect(radios[1].value).toBe("opt-b");
    expect(radios[1].checked).toBe(true);
    // "Suggested" now appears on BOTH the radio badge and the mobile summary
    // badge (jsdom renders both branches — Tailwind visibility is inert).
    expect(screen.getAllByText("Suggested").length).toBeGreaterThan(0);
  });

  it("falls back to pre-checking the first candidate when no option is best (zero votes)", () => {
    render(
      <BookItControl
        adminUrlId="admin-1"
        options={options}
        results={[
          { optionId: "opt-a", isBest: false },
          { optionId: "opt-b", isBest: false },
        ]}
      />,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0].checked).toBe(true);
    expect(radios[1].checked).toBe(false);
    expect(screen.queryByText("Suggested")).toBeNull();
  });
});

describe("BookItControl — mobile collapse-to-suggested (260703-wfm)", () => {
  it("keeps the radios in the DOM while collapsed (winningOptionId still submits)", () => {
    render(
      <BookItControl
        adminUrlId="admin-1"
        options={options}
        results={[
          { optionId: "opt-a", isBest: false },
          { optionId: "opt-b", isBest: true },
        ]}
      />,
    );
    // Default (collapsed) state: radios are always present and preselected, so
    // the form still carries a winningOptionId even before "Change date".
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio.name).toBe("winningOptionId");
    }
    expect(radios[1].checked).toBe(true); // opt-b (best) preselected
    // The reveal toggle is type=button — it can never submit the form.
    const change = screen.getByRole("button", { name: "Change date" });
    expect(change.getAttribute("type")).toBe("button");
  });

  it("'Change date' reveals the list without remounting the radios or losing the preselection (WFM-05)", () => {
    render(
      <BookItControl
        adminUrlId="admin-1"
        options={options}
        results={[
          { optionId: "opt-a", isBest: false },
          { optionId: "opt-b", isBest: true },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Change date" }));

    // Display toggle, not an unmount: same 2 radios, preselection survives.
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(2);
    expect(radios[1].checked).toBe(true);
    // Booking is still two-step: no confirm control until "Book this date".
    expect(
      screen.queryByRole("button", { name: /Confirm and close poll/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Book this date" }),
    ).toBeTruthy();
  });

  it("collapses to the suggested date on ALL breakpoints (XBO-03) — grid is hidden with NO sm: auto-reveal", () => {
    render(
      <BookItControl
        adminUrlId="admin-1"
        options={options}
        results={[
          { optionId: "opt-a", isBest: false },
          { optionId: "opt-b", isBest: true },
        ]}
      />,
    );
    // radio -> <label> -> grid wrapper <div>. TOKEN checks only: `sm:grid-cols-2`
    // CONTAINS the substring "sm:grid", so exact-token classList.contains is the
    // only reliable way to prove the grid never auto-reveals at sm:.
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    const wrapper = radios[0].closest("label")?.parentElement as HTMLElement;
    // Collapsed by default: hidden on ALL breakpoints (no `sm:grid` token).
    expect(wrapper.classList.contains("hidden")).toBe(true);
    expect(wrapper.classList.contains("sm:grid")).toBe(false);
    // The suggested-date summary shows on desktop too (no `sm:hidden` token).
    const summary = screen.getByText("Change date").closest("div") as HTMLElement;
    expect(summary.classList.contains("sm:hidden")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Change date" }));

    // Reveal drops `hidden` (appends `grid`); radios never remounted; the best
    // preselection survives the toggle.
    expect(wrapper.classList.contains("hidden")).toBe(false);
    const after = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(after).toHaveLength(2);
    expect(after[1].checked).toBe(true);
  });
});

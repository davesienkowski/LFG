// @vitest-environment jsdom
//
// VoteForm tests — the submit-gating + closed-poll outcome added in the UX-UAT
// pass (F1 / F2). VoteForm is a client island around AvailabilityGrid; these
// exercise the two behaviors that changed:
//   - F1: Submit stays disabled until EVERY date is answered (the old form let
//     you submit an all-"No" default in one click). The "Set all Available" bulk
//     action answers every row, which flips Submit enabled.
//   - F2: a closed poll with a finalized date leads with "The group is meeting
//     {date}." and omits the submit button entirely.
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { VoteForm } from "./vote-form";
import type { GridOption } from "./availability-grid";

afterEach(() => cleanup());

const OPTIONS: GridOption[] = [
  { id: "opt-1", date: "2026-07-12", startTime: null },
  { id: "opt-2", date: "2026-07-19", startTime: "14:00:00" },
];

// A no-op action — these tests never submit, they assert render/gating state.
const noopAction = vi.fn(async () => null);

function submitButton() {
  return screen.getByRole("button", {
    name: "Submit availability",
  }) as HTMLButtonElement;
}

describe("VoteForm submit gating (UX-UAT F1)", () => {
  it("disables Submit until every date is answered, then enables it", () => {
    render(
      <VoteForm
        action={noopAction}
        options={OPTIONS}
        participantUrlId="p1"
        submitLabel="Submit availability"
        pendingLabel="Submitting..."
      />,
    );

    // Fresh form: nothing answered → Submit disabled + explanatory hint.
    expect(submitButton().disabled).toBe(true);
    expect(
      screen.getByText(/Choose an option for every date to submit/),
    ).toBeTruthy();

    // Answer every row in one click via the bulk action.
    fireEvent.click(screen.getByRole("button", { name: "Set all Available" }));

    expect(submitButton().disabled).toBe(false);
    // Hint is gone once all dates are answered.
    expect(
      screen.queryByText(/Choose an option for every date to submit/),
    ).toBeNull();
  });

  it("enables Submit immediately for a returning voter (all dates pre-answered)", () => {
    render(
      <VoteForm
        action={noopAction}
        options={OPTIONS}
        participantUrlId="p1"
        initialVotes={{ "opt-1": "yes", "opt-2": "no" }}
        submitLabel="Submit availability"
        pendingLabel="Submitting..."
      />,
    );
    expect(submitButton().disabled).toBe(false);
  });
});

describe("VoteForm closed poll (UX-UAT F2)", () => {
  it("leads with the finalized date and omits the submit button", () => {
    render(
      <VoteForm
        action={noopAction}
        options={OPTIONS}
        participantUrlId="p1"
        readOnly
        bookedLabel="Sun, Jul 12"
        submitLabel="Submit availability"
        pendingLabel="Submitting..."
      />,
    );

    expect(
      screen.getByText(/The group is meeting Sun, Jul 12\./),
    ).toBeTruthy();
    // No submit control on a closed poll.
    expect(
      screen.queryByRole("button", { name: "Submit availability" }),
    ).toBeNull();
  });

  it("falls back to a generic closed message when no date is provided", () => {
    render(
      <VoteForm
        action={noopAction}
        options={OPTIONS}
        participantUrlId="p1"
        readOnly
        submitLabel="Submit availability"
        pendingLabel="Submitting..."
      />,
    );
    expect(screen.getByText("Voting is closed")).toBeTruthy();
  });
});

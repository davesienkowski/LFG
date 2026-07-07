// PollListItem tests — MYP-02 ★ edges. Pure server component, no interactivity,
// so we render with renderToStaticMarkup (node env, no jsdom/DATABASE_URL needed).
//
// Covers: badge (Open/Booked), summary (candidate count vs booked date), exact
// pluralization (singular vs plural + the 0-response non-blank case), and the
// closed-poll null-winningDate defensive fallback (renders "Booked", no crash).
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PollListItem, type PollListRow } from "./poll-list-item";

function makePoll(overrides: Partial<PollListRow> = {}): PollListRow {
  return {
    adminUrlId: "admin-default",
    title: "Game night",
    status: "open",
    winningDate: null,
    winningStartTime: null,
    optionCount: 0,
    responseCount: 0,
    ...overrides,
  };
}

describe("PollListItem", () => {
  it("(a) open poll, 3 options / 2 responses → plural summary, Open badge, admin link", () => {
    const html = renderToStaticMarkup(
      <PollListItem
        poll={makePoll({
          adminUrlId: "abc123",
          status: "open",
          optionCount: 3,
          responseCount: 2,
        })}
      />,
    );
    expect(html).toContain("3 dates");
    expect(html).toContain("2 responses");
    expect(html).toContain("Open");
    expect(html).toContain('href="/a/abc123"');
    expect(html).not.toContain("Booked");
  });

  it("(b) open poll, 1 option / 1 response → singular forms only", () => {
    const html = renderToStaticMarkup(
      <PollListItem
        poll={makePoll({
          adminUrlId: "solo1",
          status: "open",
          optionCount: 1,
          responseCount: 1,
        })}
      />,
    );
    expect(html).toContain("1 date");
    expect(html).toContain("1 response");
    // The singular must NOT slip into the plural form.
    expect(html).not.toContain("1 dates");
    expect(html).not.toContain("1 responses");
    expect(html).toContain('href="/a/solo1"');
  });

  it("(c) open poll, 0 responses → renders '0 responses' (never blank)", () => {
    const html = renderToStaticMarkup(
      <PollListItem
        poll={makePoll({
          adminUrlId: "empty0",
          status: "open",
          optionCount: 2,
          responseCount: 0,
        })}
      />,
    );
    expect(html).toContain("0 responses");
  });

  it("(d) closed poll with winningDate → Booked badge + formatted date, no candidate count", () => {
    const html = renderToStaticMarkup(
      <PollListItem
        poll={makePoll({
          adminUrlId: "closed1",
          status: "closed",
          winningDate: "2026-07-19",
          winningStartTime: "14:00:00",
          optionCount: 3,
          responseCount: 4,
        })}
      />,
    );
    expect(html).toContain("Booked");
    expect(html).toContain("Sunday, July 19 at 2:00 PM");
    // No candidate-count summary once the poll is closed.
    expect(html).not.toContain("dates");
    expect(html).toContain('href="/a/closed1"');
  });

  it("(e) closed poll with null winningDate → Booked badge, no date, no crash (EP-FEED-EMPTY)", () => {
    const html = renderToStaticMarkup(
      <PollListItem
        poll={makePoll({
          adminUrlId: "closed2",
          status: "closed",
          winningDate: null,
          winningStartTime: null,
          optionCount: 3,
          responseCount: 0,
        })}
      />,
    );
    // Completing the render green is the proof it did not throw.
    expect(html).toContain("Booked");
    expect(html).not.toContain("null");
    expect(html).not.toContain("Invalid");
    expect(html).not.toContain("dates");
  });
});

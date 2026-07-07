// Pure isVotingOpen tests (DEAD-01 lazy-close rule).
//
// No DB, no DATABASE_URL, no mocks — mirrors results.test.ts. isVotingOpen is
// the SINGLE place the lazy-close rule lives, so every branch (incl. the
// deadline==now boundary and closed-beats-future-deadline) is one explicit `it`.
import { describe, it, expect } from "vitest";
import { isVotingOpen } from "./poll-status";

// A fixed reference instant so the future/past deadlines are unambiguous.
const NOW = new Date("2026-07-07T12:00:00.000Z");
const ONE_HOUR = 60 * 60 * 1000;

describe("isVotingOpen", () => {
  it("is open when status is 'open' and there is no deadline (deadline null)", () => {
    expect(isVotingOpen({ status: "open", deadline: null }, NOW)).toBe(true);
  });

  it("is open when status is 'open' and the deadline is in the future", () => {
    const future = new Date(NOW.getTime() + ONE_HOUR);
    expect(isVotingOpen({ status: "open", deadline: future }, NOW)).toBe(true);
  });

  it("is closed (lazy auto-close) when status is 'open' but the deadline has passed", () => {
    const past = new Date(NOW.getTime() - ONE_HOUR);
    expect(isVotingOpen({ status: "open", deadline: past }, NOW)).toBe(false);
  });

  it("is closed at the exact boundary: deadline == now is CLOSED (rule is deadline > now)", () => {
    const atNow = new Date(NOW.getTime());
    expect(isVotingOpen({ status: "open", deadline: atNow }, NOW)).toBe(false);
  });

  it("is closed when status is 'closed' (booked) with no deadline", () => {
    expect(isVotingOpen({ status: "closed", deadline: null }, NOW)).toBe(false);
  });

  it("is closed when status is 'closed' (booked) even if the deadline is still in the future", () => {
    const future = new Date(NOW.getTime() + ONE_HOUR);
    expect(isVotingOpen({ status: "closed", deadline: future }, NOW)).toBe(false);
  });
});

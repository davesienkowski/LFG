// Timezone drift test (D-11 / P3 / PLAT-04).
//
// The acceptance criterion: a 'YYYY-MM-DD' date renders as the same calendar day
// under TZ Pacific/Kiritimati (UTC+14) and Etc/GMT+12 (UTC-12). Node only reads
// the TZ env var when the Date subsystem initializes, so we cannot flip TZ mid
// process reliably. Instead each TZ is exercised by a separate invocation:
//
//   TZ=Pacific/Kiritimati npx vitest run src/lib/format-date.test.ts
//   TZ=Etc/GMT+12        npx vitest run src/lib/format-date.test.ts
//
// Both invocations MUST produce the identical expected strings below. The test
// asserts the exact output (timezone-immune), so running it under either TZ — and
// the dual-TZ npm/CI invocation — proves no calendar-day drift.
import { describe, it, expect } from "vitest";
import {
  formatDateOnly,
  formatTimeOnly,
  formatDateWithTime,
  formatDateShort,
  formatDateWithTimeShort,
  formatMonthYear,
} from "./format-date";

describe("formatDateOnly (timezone-immune)", () => {
  it("renders the same calendar day regardless of process TZ", () => {
    // 2025-07-12 is a Saturday. This assertion holds under UTC+14 and UTC-12.
    expect(formatDateOnly("2025-07-12")).toBe("Saturday, July 12");
  });

  it("does not shift to the previous/next day at month boundaries", () => {
    expect(formatDateOnly("2025-01-01")).toBe("Wednesday, January 1");
    expect(formatDateOnly("2025-12-31")).toBe("Wednesday, December 31");
  });

  it("reports the current TZ offset for diagnostic visibility", () => {
    // Not an assertion of behavior — documents which TZ this run exercised.
    const offsetMinutes = new Date().getTimezoneOffset();
    expect(typeof offsetMinutes).toBe("number");
  });

  it("rejects non date-only strings", () => {
    expect(() => formatDateOnly("2025-7-12")).toThrow();
    expect(() => formatDateOnly("not-a-date")).toThrow();
  });
});

describe("formatTimeOnly", () => {
  it("converts 24h to 12h clock", () => {
    expect(formatTimeOnly("14:00")).toBe("2:00 PM");
    expect(formatTimeOnly("00:00")).toBe("12:00 AM");
    expect(formatTimeOnly("12:00")).toBe("12:00 PM");
    expect(formatTimeOnly("09:30")).toBe("9:30 AM");
    expect(formatTimeOnly("23:45")).toBe("11:45 PM");
  });
});

describe("formatDateWithTime", () => {
  it("appends the time when present", () => {
    expect(formatDateWithTime("2025-07-12", "14:00")).toBe(
      "Saturday, July 12 at 2:00 PM",
    );
  });

  it("returns date-only when time is null", () => {
    expect(formatDateWithTime("2025-07-12", null)).toBe("Saturday, July 12");
  });
});

// Condensed variants (quick task 260703-tv3) — same timezone-immune discipline:
// identical output under TZ=Pacific/Kiritimati (UTC+14) and TZ=Etc/GMT+12 (UTC-12).
describe("formatDateShort (timezone-immune)", () => {
  it("renders the same short calendar day regardless of process TZ", () => {
    // 2025-07-12 is a Saturday.
    expect(formatDateShort("2025-07-12")).toBe("Sat, Jul 12");
  });

  it("does not shift day at month boundaries", () => {
    expect(formatDateShort("2025-01-01")).toBe("Wed, Jan 1");
    expect(formatDateShort("2025-12-31")).toBe("Wed, Dec 31");
  });

  it("rejects non date-only strings", () => {
    expect(() => formatDateShort("2025-7-12")).toThrow();
    expect(() => formatDateShort("not-a-date")).toThrow();
  });
});

describe("formatDateWithTimeShort", () => {
  it("joins the short date and time with a middot separator (U+00B7)", () => {
    expect(formatDateWithTimeShort("2025-07-12", "14:00")).toBe(
      "Sat, Jul 12 · 2:00 PM",
    );
    // The separator is exactly the middot, never " at " and never a hyphen.
    expect(formatDateWithTimeShort("2025-07-12", "14:00")).not.toContain(" at ");
    expect(formatDateWithTimeShort("2025-07-12", "14:00")).toContain("·");
  });

  it("returns the short date only when time is null", () => {
    expect(formatDateWithTimeShort("2025-07-12", null)).toBe("Sat, Jul 12");
  });

  it("throws on an invalid date string", () => {
    expect(() => formatDateWithTimeShort("not-a-date", null)).toThrow();
  });
});

describe("formatMonthYear (timezone-immune)", () => {
  it("renders the month and year", () => {
    expect(formatMonthYear("2025-07-12")).toBe("July 2025");
    expect(formatMonthYear("2025-08-02")).toBe("August 2025");
  });

  it("does not shift month at month boundaries", () => {
    expect(formatMonthYear("2025-01-01")).toBe("January 2025");
    expect(formatMonthYear("2025-12-31")).toBe("December 2025");
  });

  it("rejects non date-only strings", () => {
    expect(() => formatMonthYear("not-a-date")).toThrow();
  });
});

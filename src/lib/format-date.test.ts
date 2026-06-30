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

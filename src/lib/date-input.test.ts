// Input-layer timezone drift test (D-11 / P3 / PLAT-04 — third surface: INPUT).
//
// react-day-picker hands back JS `Date` objects (local midnight of the clicked
// day). Converting one with the obvious `date.toISOString().slice(0,10)` formats
// in UTC and silently shifts to the PREVIOUS calendar day for any local offset
// that crosses midnight relative to UTC — the exact PLAT-04 / P3 bug, now at the
// INPUT boundary. `toLocalDateString` must build 'YYYY-MM-DD' from LOCAL
// getFullYear()/getMonth()+1/getDate(), never toISOString()/UTC getters.
//
// Node only reads TZ when the Date subsystem initializes, so each TZ is exercised
// by a separate invocation. Both MUST produce the identical strings below:
//
//   TZ=Pacific/Kiritimati npx vitest run src/lib/date-input.test.ts   (UTC+14)
//   TZ=Etc/GMT+12         npx vitest run src/lib/date-input.test.ts   (UTC-12)
//
// A `Date` built from LOCAL components (new Date(y, m-1, d)) and read back with
// LOCAL getters round-trips to the same calendar day under both extremes; the
// buggy toISOString path would yield "2026-10-03" under UTC+14 and fail here.
import { describe, it, expect } from "vitest";
import {
  toLocalDateString,
  localTodayDateString,
  buildDatesPayload,
  applyTimeToAll,
} from "./date-input";

describe("toLocalDateString (timezone-immune input conversion)", () => {
  it("yields the clicked calendar day regardless of process TZ", () => {
    // 2026-10-04 is a Saturday. Holds under UTC+14 and UTC-12.
    expect(toLocalDateString(new Date(2026, 9, 4))).toBe("2026-10-04");
  });

  it("does not shift across year/month boundaries", () => {
    expect(toLocalDateString(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toLocalDateString(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("zero-pads single-digit months and days", () => {
    expect(toLocalDateString(new Date(2026, 2, 5))).toBe("2026-03-05");
  });
});

describe("localTodayDateString", () => {
  it("returns a well-formed local YYYY-MM-DD (diagnostic, no drift assertion)", () => {
    expect(localTodayDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("buildDatesPayload (ordering / dedupe / per-date time)", () => {
  it("sorts out-of-order clicked days chronologically (P-order)", () => {
    const days = [new Date(2026, 9, 11), new Date(2026, 9, 4), new Date(2026, 9, 5)];
    expect(buildDatesPayload(days, {})).toEqual([
      { date: "2026-10-04", startTime: null },
      { date: "2026-10-05", startTime: null },
      { date: "2026-10-11", startTime: null },
    ]);
  });

  it("emits each date at most once (P-dupe, defensive)", () => {
    const days = [new Date(2026, 9, 4), new Date(2026, 9, 4)];
    expect(buildDatesPayload(days, {})).toEqual([
      { date: "2026-10-04", startTime: null },
    ]);
  });

  it("attaches the per-date start time; blank stays null (date-only valid)", () => {
    const days = [new Date(2026, 9, 4), new Date(2026, 9, 5)];
    const times = { "2026-10-04": "12:00", "2026-10-05": "" };
    expect(buildDatesPayload(days, times)).toEqual([
      { date: "2026-10-04", startTime: "12:00" },
      { date: "2026-10-05", startTime: null },
    ]);
  });

  it("orders blank-time before a timed entry within the same comparison key", () => {
    // Defensive: blank ('') sorts before a value, matching the action's NULLS FIRST.
    const days = [new Date(2026, 9, 5), new Date(2026, 9, 4)];
    const times = { "2026-10-04": "09:00" };
    expect(buildDatesPayload(days, times)).toEqual([
      { date: "2026-10-04", startTime: "09:00" },
      { date: "2026-10-05", startTime: null },
    ]);
  });
});

describe("applyTimeToAll (P-applyclear)", () => {
  it("stamps the value into every selected day", () => {
    const days = [new Date(2026, 9, 4), new Date(2026, 9, 5)];
    expect(applyTimeToAll(days, "14:00")).toEqual({
      "2026-10-04": "14:00",
      "2026-10-05": "14:00",
    });
  });

  it("clears every selected day when the value is blank", () => {
    const days = [new Date(2026, 9, 4), new Date(2026, 9, 5)];
    const cleared = applyTimeToAll(days, "");
    expect(cleared).toEqual({ "2026-10-04": "", "2026-10-05": "" });
    // …and a cleared map produces date-only (null) payload entries.
    expect(buildDatesPayload(days, cleared)).toEqual([
      { date: "2026-10-04", startTime: null },
      { date: "2026-10-05", startTime: null },
    ]);
  });
});

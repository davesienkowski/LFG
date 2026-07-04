// Pure calendar-builder tests (node env, no DB). Proves buildGoogleCalendarUrl
// and buildIcs are timezone-safe (Date.UTC arithmetic, never new Date(string)),
// produce all-day vs floating-timed output per the plan decisions, roll the day
// forward correctly across midnight AND month/year boundaries, escape .ics text
// before folding, omit DESCRIPTION/details when empty, and never emit LOCATION.
import { describe, it, expect } from "vitest";
import { buildGoogleCalendarUrl, buildIcs, buildVcalendar } from "./links";

describe("buildGoogleCalendarUrl — all-day (startTime null)", () => {
  it("uses dates=YYYYMMDD/YYYYMMDD+1 (end-exclusive next day) and action=TEMPLATE", () => {
    const url = buildGoogleCalendarUrl({
      title: "D&D Session",
      date: "2026-07-19",
      startTime: null,
    });
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260719%2F20260720");
    // Title URL-encoded (ampersand -> %26).
    expect(url).toContain("text=D%26D%20Session");
  });

  it("rolls the all-day end date across the year boundary (2026-12-31 -> 20270101)", () => {
    const url = buildGoogleCalendarUrl({
      title: "New Year game",
      date: "2026-12-31",
      startTime: null,
    });
    expect(url).toContain("dates=20261231%2F20270101");
  });
});

describe("buildGoogleCalendarUrl — timed (startTime HH:MM)", () => {
  it("ends 180 min after start, same day", () => {
    const url = buildGoogleCalendarUrl({
      title: "Session",
      date: "2026-07-19",
      startTime: "14:00",
    });
    expect(url).toContain("dates=20260719T140000%2F20260719T170000");
  });

  it("rolls past midnight (22:00 + 3h -> next-day 01:00:00)", () => {
    const url = buildGoogleCalendarUrl({
      title: "Late session",
      date: "2026-07-19",
      startTime: "22:00",
    });
    expect(url).toContain("dates=20260719T220000%2F20260720T010000");
  });

  it("rolls exactly to next-day midnight (21:00 + 3h -> next-day 00:00:00)", () => {
    const url = buildGoogleCalendarUrl({
      title: "Session",
      date: "2026-07-19",
      startTime: "21:00",
    });
    expect(url).toContain("dates=20260719T210000%2F20260720T000000");
  });
});

describe("buildGoogleCalendarUrl — details / title fallback", () => {
  it("includes details= only when description is non-empty", () => {
    const withDesc = buildGoogleCalendarUrl({
      title: "Session",
      description: "Bring dice",
      date: "2026-07-19",
      startTime: null,
    });
    expect(withDesc).toContain("details=Bring%20dice");

    const noDesc = buildGoogleCalendarUrl({
      title: "Session",
      date: "2026-07-19",
      startTime: null,
    });
    expect(noDesc).not.toContain("details=");
  });

  it("falls back to description then 'LFG event' for empty/whitespace title", () => {
    const toDesc = buildGoogleCalendarUrl({
      title: "   ",
      description: "Campaign night",
      date: "2026-07-19",
      startTime: null,
    });
    expect(toDesc).toContain("text=Campaign%20night");

    const toDefault = buildGoogleCalendarUrl({
      title: "",
      date: "2026-07-19",
      startTime: null,
    });
    expect(toDefault).toContain("text=LFG%20event");
  });
});

describe("buildIcs — structure", () => {
  it("emits a valid VCALENDAR/VEVENT with VERSION, PRODID, UID, DTSTAMP, SUMMARY", () => {
    const ics = buildIcs({
      title: "D&D Session",
      date: "2026-07-19",
      startTime: "14:00",
      uid: "poll-1-opt-1@lfg",
    });
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:poll-1-opt-1@lfg");
    expect(ics).toMatch(/DTSTAMP:\d{8}T\d{6}Z/);
    expect(ics).toContain("SUMMARY:D&D Session");
  });

  it("uses CRLF line endings", () => {
    const ics = buildIcs({
      title: "S",
      date: "2026-07-19",
      startTime: null,
      uid: "u@lfg",
    });
    expect(ics).toContain("\r\n");
  });
});

describe("buildIcs — all-day", () => {
  it("emits DTSTART;VALUE=DATE and DTEND;VALUE=DATE with DTEND = next day (!= DTSTART)", () => {
    const ics = buildIcs({
      title: "S",
      date: "2026-07-19",
      startTime: null,
      uid: "u@lfg",
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260719");
    expect(ics).toContain("DTEND;VALUE=DATE:20260720");
  });

  it("rolls DTEND across the year boundary (2026-12-31 -> 20270101, != DTSTART)", () => {
    const ics = buildIcs({
      title: "S",
      date: "2026-12-31",
      startTime: null,
      uid: "u@lfg",
    });
    expect(ics).toContain("DTSTART;VALUE=DATE:20261231");
    expect(ics).toContain("DTEND;VALUE=DATE:20270101");
  });
});

describe("buildIcs — timed (floating, no zone)", () => {
  it("emits floating DTSTART/DTEND with NO trailing Z and NO TZID, end = start + 180min", () => {
    const ics = buildIcs({
      title: "S",
      date: "2026-07-19",
      startTime: "14:00",
      uid: "u@lfg",
    });
    expect(ics).toContain("DTSTART:20260719T140000");
    expect(ics).toContain("DTEND:20260719T170000");
    // Floating: the DTSTART value line has no trailing Z.
    expect(ics).not.toMatch(/DTSTART:20260719T140000Z/);
    expect(ics).not.toContain("TZID");
  });

  it("rolls timed DTEND past midnight (22:00 + 3h -> next-day 01:00:00)", () => {
    const ics = buildIcs({
      title: "S",
      date: "2026-07-19",
      startTime: "22:00",
      uid: "u@lfg",
    });
    expect(ics).toContain("DTSTART:20260719T220000");
    expect(ics).toContain("DTEND:20260720T010000");
  });

  it("rolls timed DTEND to exact next-day midnight (21:00 + 3h -> 00:00:00)", () => {
    const ics = buildIcs({
      title: "S",
      date: "2026-07-19",
      startTime: "21:00",
      uid: "u@lfg",
    });
    expect(ics).toContain("DTEND:20260720T000000");
  });
});

describe("buildIcs — description / title fallback / no LOCATION", () => {
  it("emits DESCRIPTION only when description is non-empty", () => {
    const withDesc = buildIcs({
      title: "S",
      description: "Bring dice",
      date: "2026-07-19",
      startTime: null,
      uid: "u@lfg",
    });
    expect(withDesc).toContain("DESCRIPTION:Bring dice");

    const noDesc = buildIcs({
      title: "S",
      date: "2026-07-19",
      startTime: null,
      uid: "u@lfg",
    });
    expect(noDesc).not.toContain("DESCRIPTION:");
  });

  it("never emits a LOCATION property", () => {
    const ics = buildIcs({
      title: "S",
      description: "d",
      date: "2026-07-19",
      startTime: "14:00",
      uid: "u@lfg",
    });
    expect(ics).not.toContain("LOCATION");
  });

  it("falls back title -> description -> 'LFG event' for whitespace/empty title", () => {
    const toDesc = buildIcs({
      title: "   ",
      description: "Campaign night",
      date: "2026-07-19",
      startTime: null,
      uid: "u@lfg",
    });
    expect(toDesc).toContain("SUMMARY:Campaign night");

    const toDefault = buildIcs({
      title: "",
      date: "2026-07-19",
      startTime: null,
      uid: "u@lfg",
    });
    expect(toDefault).toContain("SUMMARY:LFG event");
  });
});

describe("buildIcs — RFC5545 text escaping", () => {
  it("escapes backslash, semicolon, comma and newline in SUMMARY", () => {
    const ics = buildIcs({
      title: "a\\b;c,d\ne",
      date: "2026-07-19",
      startTime: null,
      uid: "u@lfg",
    });
    // Backslash escaped first, then ; , and newline -> \n.
    expect(ics).toContain("SUMMARY:a\\\\b\\;c\\,d\\ne");
  });
});

describe("buildIcs — byte-stability guard (refactor lock)", () => {
  it("pins the FULL output string for a known all-day input (header order, no X-WR-CALNAME, trailing CRLF)", () => {
    // DTSTAMP is the only non-deterministic line; substitute it out, then pin the
    // rest EXACTLY. Any header reordering, a stray X-WR-CALNAME, a dropped line,
    // or a changed trailing CRLF fails this guard — locking the LD-5 extraction.
    const ics = buildIcs({
      title: "D&D Session",
      description: "Bring dice",
      date: "2026-07-19",
      startTime: null,
      uid: "poll-1-opt-1@lfg",
    });
    const normalized = ics.replace(/DTSTAMP:\d{8}T\d{6}Z/, "DTSTAMP:PINNED");
    expect(normalized).toBe(
      "BEGIN:VCALENDAR\r\n" +
        "VERSION:2.0\r\n" +
        "PRODID:-//LFG//Looking For Group//EN\r\n" +
        "CALSCALE:GREGORIAN\r\n" +
        "METHOD:PUBLISH\r\n" +
        "BEGIN:VEVENT\r\n" +
        "UID:poll-1-opt-1@lfg\r\n" +
        "DTSTAMP:PINNED\r\n" +
        "DTSTART;VALUE=DATE:20260719\r\n" +
        "DTEND;VALUE=DATE:20260720\r\n" +
        "SUMMARY:D&D Session\r\n" +
        "DESCRIPTION:Bring dice\r\n" +
        "END:VEVENT\r\n" +
        "END:VCALENDAR\r\n",
    );
    // buildIcs must NEVER carry the feed-only X-WR-CALNAME line.
    expect(ics).not.toContain("X-WR-CALNAME");
  });
});

describe("buildVcalendar — multi-event feed builder", () => {
  const countOccurrences = (haystack: string, needle: string): number =>
    haystack.split(needle).length - 1;

  it("empty array yields a valid empty calendar (header + X-WR-CALNAME + END, NO VEVENT)", () => {
    const cal = buildVcalendar([]);
    expect(cal).toContain("BEGIN:VCALENDAR");
    expect(cal).toContain("X-WR-CALNAME");
    expect(cal).toContain("END:VCALENDAR");
    expect(cal).not.toContain("BEGIN:VEVENT");
  });

  it("two events (all-day + timed) emit exactly two VEVENT blocks in input order, one wrapper, both UIDs, correct DTSTART", () => {
    const cal = buildVcalendar([
      {
        title: "All Day",
        date: "2026-07-19",
        startTime: null,
        uid: "poll-a-opt-a@lfg",
      },
      {
        title: "Timed",
        date: "2026-08-02",
        startTime: "14:00",
        uid: "poll-b-opt-b@lfg",
      },
    ]);

    expect(countOccurrences(cal, "BEGIN:VCALENDAR")).toBe(1);
    expect(countOccurrences(cal, "BEGIN:VEVENT")).toBe(2);
    expect(countOccurrences(cal, "END:VEVENT")).toBe(2);
    // Both UIDs present.
    expect(cal).toContain("UID:poll-a-opt-a@lfg");
    expect(cal).toContain("UID:poll-b-opt-b@lfg");
    // Correct DTSTART per event.
    expect(cal).toContain("DTSTART;VALUE=DATE:20260719");
    expect(cal).toContain("DTSTART:20260802T140000");
    // Input order preserved (no sort): first UID appears before the second.
    expect(cal.indexOf("poll-a-opt-a@lfg")).toBeLessThan(
      cal.indexOf("poll-b-opt-b@lfg"),
    );
  });

  it("escapes backslash, semicolon, comma and newline in SUMMARY (ICS-injection defense)", () => {
    const cal = buildVcalendar([
      {
        title: "a\\b;c,d\ne",
        date: "2026-07-19",
        startTime: null,
        uid: "u@lfg",
      },
    ]);
    expect(cal).toContain("SUMMARY:a\\\\b\\;c\\,d\\ne");
  });

  it("X-WR-CALNAME uses opts.calName when provided, else the default", () => {
    const custom = buildVcalendar([], { calName: "Dave's D&D dates" });
    expect(custom).toContain("X-WR-CALNAME:Dave's D&D dates");

    const dflt = buildVcalendar([]);
    expect(dflt).toContain("X-WR-CALNAME:My LFG booked dates");
  });

  it("uses CRLF line endings and terminates with a trailing CRLF", () => {
    const cal = buildVcalendar([
      { title: "S", date: "2026-07-19", startTime: null, uid: "u@lfg" },
    ]);
    expect(cal).toContain("\r\n");
    expect(cal.endsWith("\r\n")).toBe(true);
  });
});

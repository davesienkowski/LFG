// Pure URL-helper tests (node env, no DB). Covers the organizer feed/webcal
// builders (LD-6): trailing-slash trim on base, the /feed/{id}/calendar.ics
// path, and the http/https -> webcal:// scheme swap keeping the same path.
import { describe, it, expect } from "vitest";
import { buildOrganizerFeedUrl, buildOrganizerWebcalUrl } from "./urls";

describe("buildOrganizerFeedUrl", () => {
  it("produces the /feed/{id}/calendar.ics path", () => {
    expect(
      buildOrganizerFeedUrl("https://lfg.example.com", "org-tok-123"),
    ).toBe("https://lfg.example.com/feed/org-tok-123/calendar.ics");
  });

  it("trims a trailing slash on the base", () => {
    expect(
      buildOrganizerFeedUrl("https://lfg.example.com/", "org-tok-123"),
    ).toBe("https://lfg.example.com/feed/org-tok-123/calendar.ics");
    expect(
      buildOrganizerFeedUrl("https://lfg.example.com///", "org-tok-123"),
    ).toBe("https://lfg.example.com/feed/org-tok-123/calendar.ics");
  });
});

describe("buildOrganizerWebcalUrl", () => {
  it("swaps https:// for webcal:// while keeping the same path", () => {
    expect(
      buildOrganizerWebcalUrl("https://lfg.example.com", "org-tok-123"),
    ).toBe("webcal://lfg.example.com/feed/org-tok-123/calendar.ics");
  });

  it("swaps http:// for webcal:// (local dev)", () => {
    expect(buildOrganizerWebcalUrl("http://localhost:3000", "org-tok-123")).toBe(
      "webcal://localhost:3000/feed/org-tok-123/calendar.ics",
    );
  });
});

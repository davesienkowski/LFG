// Email-template tests (pure, node env, no DB). Proves each render function
// embeds its CTA URL + heading, that finalization runs the date through
// formatDateWithTime (formatted substring present, raw ISO absent), and the
// load-bearing T-04-02 negative: given only participant/edit URLs, NONE of the
// three templates emit an `/a/` admin-path substring.
import { describe, it, expect } from "vitest";
import {
  renderInviteEmail,
  renderConfirmationEmail,
  renderFinalizationEmail,
} from "./templates";

const PARTICIPANT_URL = "https://lfg.example/p/participant-token-abc";
const EDIT_URL =
  "https://lfg.example/p/participant-token-abc/edit/edit-token-xyz";

describe("renderInviteEmail", () => {
  it("embeds the participant CTA URL and the invite heading", () => {
    const html = renderInviteEmail({
      title: "D&D Session",
      participantUrl: PARTICIPANT_URL,
    });
    expect(html).toContain(PARTICIPANT_URL);
    expect(html).toContain("You're invited: D&D Session");
    expect(html).toContain("View the poll & vote");
  });
});

describe("renderConfirmationEmail", () => {
  it("embeds the edit CTA URL and the confirmation heading", () => {
    const html = renderConfirmationEmail({
      title: "D&D Session",
      editUrl: EDIT_URL,
    });
    expect(html).toContain(EDIT_URL);
    expect(html).toContain("Your response to D&D Session is saved");
    expect(html).toContain("View or edit my response");
  });
});

describe("renderFinalizationEmail", () => {
  it("renders the chosen date via formatDateWithTime (formatted present, raw ISO absent)", () => {
    const html = renderFinalizationEmail({
      title: "D&D Session",
      location: "Dave's place",
      chosenDate: "2026-07-19",
      chosenTime: "14:00",
      participantUrl: PARTICIPANT_URL,
    });
    // formatDateWithTime("2026-07-19","14:00") => "Sunday, July 19 at 2:00 PM"
    expect(html).toContain("Sunday, July 19 at 2:00 PM");
    // The raw ISO date-only string must NOT appear as the visible date — proving
    // the formatter ran rather than a naive interpolation.
    expect(html).not.toContain("2026-07-19");
    expect(html).toContain("Dave's place");
    expect(html).toContain("The date is set!");
    expect(html).toContain(PARTICIPANT_URL);
  });

  it("omits the location line when no location is provided", () => {
    const html = renderFinalizationEmail({
      title: "D&D Session",
      location: null,
      chosenDate: "2026-07-19",
      chosenTime: null,
      participantUrl: PARTICIPANT_URL,
    });
    expect(html).toContain("Sunday, July 19");
    expect(html).not.toContain("2026-07-19");
  });

  it("renders BOTH calendar links when both URLs are provided", () => {
    const html = renderFinalizationEmail({
      title: "D&D Session",
      location: null,
      chosenDate: "2026-07-19",
      chosenTime: "14:00",
      participantUrl: PARTICIPANT_URL,
      googleCalendarUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE",
      icsUrl: `${PARTICIPANT_URL}/event.ics`,
    });
    expect(html).toContain("Add to Google Calendar");
    expect(html).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(html).toContain("Add to Apple / Outlook Calendar");
    expect(html).toContain(`${PARTICIPANT_URL}/event.ics`);
    // D-10: the two buttons are color-distinguished per provider — Google's
    // brand blue vs the neutral FG for Apple/Outlook.
    expect(html).toContain("background-color:#1a73e8");
    expect(html).toContain("background-color:#171717");
  });

  it("renders neither calendar link when both URLs are omitted (clean degrade)", () => {
    const html = renderFinalizationEmail({
      title: "D&D Session",
      location: null,
      chosenDate: "2026-07-19",
      chosenTime: "14:00",
      participantUrl: PARTICIPANT_URL,
    });
    expect(html).not.toContain("Add to Google Calendar");
    expect(html).not.toContain("Add to Apple / Outlook Calendar");
  });
});

describe("no admin-path leakage (T-04-02)", () => {
  it("none of the three templates emit an /a/ admin path given participant/edit URLs", () => {
    const invite = renderInviteEmail({
      title: "T",
      participantUrl: PARTICIPANT_URL,
    });
    const confirmation = renderConfirmationEmail({
      title: "T",
      editUrl: EDIT_URL,
    });
    const finalization = renderFinalizationEmail({
      title: "T",
      location: "Somewhere",
      chosenDate: "2026-07-19",
      chosenTime: "14:00",
      participantUrl: PARTICIPANT_URL,
      googleCalendarUrl:
        "https://calendar.google.com/calendar/render?action=TEMPLATE",
      icsUrl: `${PARTICIPANT_URL}/event.ics`,
    });
    for (const html of [invite, confirmation, finalization]) {
      expect(html).not.toContain("/a/");
    }
  });
});

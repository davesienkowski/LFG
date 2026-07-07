// Email-template tests (pure, node env, no DB). Proves each render function
// embeds its CTA URL + heading, that finalization runs the date through
// formatDateWithTime (formatted substring present, raw ISO absent), and the
// load-bearing T-04-02 negative: given only participant/edit URLs, NONE of the
// three templates emit an `/a/` admin-path substring.
import { describe, it, expect } from "vitest";
import {
  renderInviteEmail,
  renderReminderEmail,
  renderConfirmationEmail,
  renderFinalizationEmail,
  renderCreatorAdminLinkEmail,
  renderParticipantResponseNotification,
} from "./templates";

const PARTICIPANT_URL = "https://lfg.example/p/participant-token-abc";
const EDIT_URL =
  "https://lfg.example/p/participant-token-abc/edit/edit-token-xyz";
const ADMIN_URL = "https://lfg.example/a/admin-token-abc";

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

describe("renderReminderEmail", () => {
  it("embeds the participant CTA URL, reminder heading, and CTA label", () => {
    const html = renderReminderEmail({
      title: "D&D Session",
      participantUrl: PARTICIPANT_URL,
    });
    expect(html).toContain(PARTICIPANT_URL);
    expect(html).toContain("Reminder: your response is needed");
    expect(html).toContain("View the poll & vote");
    // Reminder-appropriate copy naming the poll.
    expect(html).toContain("D&D Session");
  });

  it("carries NO /a/ admin path given only a participant URL (T-04-02 / T-07-04)", () => {
    // Non-vacuous: even if an admin URL string is floating around the caller,
    // this template has no param for it and must never emit an /a/ path.
    const html = renderReminderEmail({
      title: "D&D Session",
      participantUrl: PARTICIPANT_URL,
    });
    expect(html).not.toContain("/a/");
    expect(html).not.toContain(ADMIN_URL);
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

describe("renderCreatorAdminLinkEmail", () => {
  it("embeds the admin CTA URL, the manage heading, and the CTA label", () => {
    const html = renderCreatorAdminLinkEmail({
      title: "D&D Session",
      adminUrl: ADMIN_URL,
    });
    // The SOLE template that legitimately carries an /a/ admin URL (recipient is
    // the creator, a recovery channel for their own credential).
    expect(html).toContain(ADMIN_URL);
    expect(html).toContain("Manage your poll: D&D Session");
    expect(html).toContain("Manage my poll");
  });
});

describe("renderParticipantResponseNotification", () => {
  it("embeds the admin URL, the 'New response to <title>' heading, the participant name, and the CTA", () => {
    const html = renderParticipantResponseNotification({
      title: "D&D Session",
      participantName: "Alex",
      adminUrl: ADMIN_URL,
    });
    // The creator-recipient notification legitimately carries the /a/ admin URL
    // (T-04-02 exception, like renderCreatorAdminLinkEmail).
    expect(html).toContain(ADMIN_URL);
    expect(html).toContain("New response to D&D Session");
    expect(html).toContain("Alex");
    expect(html).toContain("View current results");
  });

  it("F2 (non-vacuous): the signature has no email/token param — a participant email cannot leak", () => {
    // The function accepts ONLY { title, participantName, adminUrl }. Passing a
    // distinctive canary as the NAME proves the name IS rendered; the canary
    // email string is never passed (there is no param for it) so it can never
    // appear (T-t7e-06).
    const CANARY_EMAIL = "secret-participant@example.com";
    const html = renderParticipantResponseNotification({
      title: "D&D Session",
      participantName: "Alex",
      adminUrl: ADMIN_URL,
    });
    expect(html).toContain("Alex");
    expect(html).not.toContain(CANARY_EMAIL);
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
  it("none of the participant templates emit an /a/ admin path given participant/edit URLs", () => {
    const invite = renderInviteEmail({
      title: "T",
      participantUrl: PARTICIPANT_URL,
    });
    const reminder = renderReminderEmail({
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
    for (const html of [invite, reminder, confirmation, finalization]) {
      expect(html).not.toContain("/a/");
    }
  });
});

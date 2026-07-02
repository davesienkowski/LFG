// Plain-HTML email templates (D-10). Three pure, string-in/string-out render
// functions — the same discipline as format-date.ts: no I/O, no DB rows, no
// Date construction. Each returns a complete HTML document built from ONE shared
// shell so the invite / confirmation / finalization mails stay visually
// consistent; only the heading, body copy, event-details block, and CTA differ.
//
// Load-bearing invariants:
//  - NEVER accept or interpolate an admin-URL value (T-04-02). The render
//    functions take only participant/edit URL strings, produced upstream by
//    buildParticipantUrl / buildEditUrl. buildAdminUrl output must never reach a
//    template — mirrors the "never select admin_url_id" discipline in queries.ts.
//  - Dates render ONLY via formatDateWithTime (timezone-safe, D-11/P3) — never
//    `new Date()` on a date-only string.
//  - Email-client-safe: a single outer <table> for Outlook-safe centering, 600px
//    max width, inline styles only, system font stack, hex approximations of the
//    app's OKLCH tokens (email clients cannot render oklch()). No images, no
//    external <link>/webfont, no <script>. No react-email dependency (D-10).
import { formatDateWithTime } from "@/lib/format-date";

// Hex approximations of the app's OKLCH tokens (email clients cannot inherit the
// app's CSS variables). Near-black on white and mid-gray on white both clear
// WCAG AA 4.5:1.
const FG = "#171717"; // ≈ --foreground / --primary
const BG = "#ffffff"; // ≈ --background
const MUTED = "#737373"; // ≈ --muted-foreground
const CARD_BORDER = "#e5e5e5";
const CARD_BG = "#fafafa";

const FONT_STACK =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

type ShellArgs = {
  heading: string;
  bodyText: string;
  ctaUrl: string;
  ctaLabel: string;
  /** Rendered above the CTA (finalization email only); empty string otherwise. */
  eventDetailsBlock?: string;
  /** Add-to-calendar links (finalization email only); empty string otherwise. */
  calendarBlock?: string;
  /** When false, render only the plain-text fallback link (no styled button). */
  showButton?: boolean;
};

/**
 * The one shared email shell. Outer <table> gives bulletproof centering/width
 * for Outlook and every major client; the inner content is a single-column
 * inline-styled div — safe because it is one column inside one <td>.
 *
 * The plain-text fallback link is ALWAYS present (even when the styled button is
 * shown) so a client that strips button styling still exposes a working link.
 */
function renderShell({
  heading,
  bodyText,
  ctaUrl,
  ctaLabel,
  eventDetailsBlock = "",
  calendarBlock = "",
  showButton = true,
}: ShellArgs): string {
  const button = showButton
    ? `<a href="${ctaUrl}" style="display:inline-block; background-color:${FG}; color:${BG}; font-size:16px; font-weight:600; text-decoration:none; padding:12px 20px; border-radius:8px; margin:0 0 16px 0;">${ctaLabel}</a>`
    : "";

  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BG};">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <div style="max-width:600px; width:100%; font-family:${FONT_STACK}; color:${FG};">
        <p style="font-size:24px; font-weight:600; line-height:1.2; margin:0 0 16px 0;">${heading}</p>
        <p style="font-size:16px; font-weight:400; line-height:1.5; margin:0 0 24px 0; color:${FG};">${bodyText}</p>
        ${eventDetailsBlock}
        ${calendarBlock}
        ${button}
        <p style="font-size:14px; font-weight:400; line-height:1.5; color:${MUTED}; margin:0;">
          Or copy this link: <a href="${ctaUrl}" style="color:${FG};">${ctaUrl}</a>
        </p>
      </div>
    </td>
  </tr>
</table>`;
}

/**
 * Invite email (MAIL-01). CTA is the participant voting link. Accepts only a
 * participant URL string — never an admin URL (T-04-02).
 */
export function renderInviteEmail({
  title,
  participantUrl,
}: {
  title: string;
  participantUrl: string;
}): string {
  return renderShell({
    heading: `You're invited: ${title}`,
    bodyText:
      "You've been invited to help pick a date. Tap below to mark your availability.",
    ctaUrl: participantUrl,
    ctaLabel: "View the poll & vote",
  });
}

/**
 * Confirmation email (VOTE-04). CTA is the participant's personal edit link — an
 * additional channel for the SAME link /thanks already shows, not a new
 * credential. Accepts only an edit URL string — never an admin URL (T-04-02).
 */
export function renderConfirmationEmail({
  title,
  editUrl,
}: {
  title: string;
  editUrl: string;
}): string {
  return renderShell({
    heading: `Your response to ${title} is saved`,
    bodyText:
      "Thanks for responding! Use the link below any time to review or change your answer while the poll is open.",
    ctaUrl: editUrl,
    ctaLabel: "View or edit my response",
  });
}

/**
 * Finalization email (FNL-03). Shows the chosen date (rendered via
 * formatDateWithTime), title, and optional location in an event-details block.
 * The styled button is dropped in favor of a plain "View the poll" fallback link
 * (secondary post-close). Accepts only a participant URL string (T-04-02).
 */
export function renderFinalizationEmail({
  title,
  location,
  chosenDate,
  chosenTime,
  participantUrl,
  googleCalendarUrl,
  icsUrl,
}: {
  title: string;
  location?: string | null;
  chosenDate: string;
  chosenTime: string | null;
  participantUrl: string;
  /** Plain calendar.google.com render URL; omitted when calendar build failed. */
  googleCalendarUrl?: string | null;
  /** Hosted participant `/p/.../event.ics` URL; never an `/a/` admin path. */
  icsUrl?: string | null;
}): string {
  const locationLine = location
    ? `<p style="font-size:14px; color:${MUTED}; margin:0;">${location}</p>`
    : "";
  const eventDetailsBlock = `<div style="border:1px solid ${CARD_BORDER}; background-color:${CARD_BG}; border-radius:8px; padding:16px; margin:0 0 24px 0;">
          <p style="font-size:14px; font-weight:600; margin:0 0 4px 0;">${title}</p>
          <p style="font-size:16px; font-weight:400; margin:0 0 4px 0;">${formatDateWithTime(chosenDate, chosenTime)}</p>
          ${locationLine}
        </div>`;

  // Outlook-safe inline-styled links, one per present URL. Reuses the FG/BG
  // button palette from renderShell. When BOTH are absent, calendarBlock is ""
  // so the email degrades cleanly (MAIL-03 unconfigured path unaffected).
  const calLink = (href: string, label: string) =>
    `<a href="${href}" style="display:inline-block; background-color:${FG}; color:${BG}; font-size:14px; font-weight:600; text-decoration:none; padding:10px 16px; border-radius:8px; margin:0 8px 12px 0;">${label}</a>`;
  const calendarLinks = [
    googleCalendarUrl ? calLink(googleCalendarUrl, "Add to Google Calendar") : "",
    icsUrl ? calLink(icsUrl, "Add to Apple / Outlook Calendar") : "",
  ].join("");
  const calendarBlock = calendarLinks
    ? `<div style="margin:0 0 24px 0;">${calendarLinks}</div>`
    : "";

  return renderShell({
    heading: "The date is set!",
    bodyText: `${title} is booked. Here are the details:`,
    eventDetailsBlock,
    calendarBlock,
    ctaUrl: participantUrl,
    ctaLabel: "View the poll",
    showButton: false,
  });
}

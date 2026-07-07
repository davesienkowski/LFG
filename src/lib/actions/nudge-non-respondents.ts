// nudgeNonRespondents server action (RESP-02, D-05/D-09). Organizer-triggered
// one-click reminder that re-emails ONLY the poll's CURRENT non-respondents.
//
// Flow: re-derive the poll from the server-validated adminUrlId (notFound on
// miss) -> refuse a CLOSED poll -> re-query the CURRENT non-respondents
// server-side (never a client list) -> build the participant URL once -> loop
// the non-respondent addresses SEQUENTIALLY sending ONE reminder each -> return
// a per-recipient result row in the same shape sendInvites returns.
//
// Load-bearing invariants (the three UI Prohibition-Probe findings, enforced
// server-side — they are NOT merely UI concerns):
//  - Probe #1 / V4 / T-07-02: NEVER trust a client-supplied poll id OR recipient
//    list. The poll is re-derived from the admin token via getPollByAdminUrlId
//    (unknown token notFound()s), and the recipients are RE-QUERIED from the DB
//    via getInvitationTrackingForPoll at submit time. The form carries ONLY
//    adminUrlId; any stray recipient/address field is ignored, so a tampered
//    form can never widen the send set. The admin token is the sole authorization.
//  - Probe #3 / T-07-03: re-check poll.status !== "closed" server-side BEFORE any
//    send, independent of the client-side hide — a closed poll sends NOTHING.
//  - T-07-04: the reminder carries the PARTICIPANT link only (renderReminderEmail
//    accepts no admin URL).
//  - D-05: best-effort per address — one failure never throws or aborts the rest.
//  - CONTEXT: nudging records NO new invitations row (it only targets
//    already-recorded invitations) — there is no DB write here at all.
"use server";

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getPollByAdminUrlId,
  getInvitationTrackingForPoll,
} from "@/lib/db/queries";
import { resolveBaseUrl, buildParticipantUrl } from "@/lib/urls";
import { sendEmail } from "@/lib/email/send";
import { renderReminderEmail } from "@/lib/email/templates";
import type {
  SendInvitesState,
  SendInviteResult,
} from "@/lib/actions/send-invites";

export async function nudgeNonRespondents(
  _prevState: SendInvitesState,
  formData: FormData,
): Promise<SendInvitesState> {
  // V4 / Probe #1: re-derive the poll from the admin token — never a client
  // poll id. This is the SOLE authorization; an unknown token notFound()s.
  const adminUrlId = String(formData.get("adminUrlId") ?? "");
  const poll = await getPollByAdminUrlId(adminUrlId);
  if (!poll) notFound();

  // Probe #3 / T-07-03: refuse a CLOSED poll server-side, independent of the
  // client hiding the control. Send NOTHING.
  if (poll.status === "closed") {
    return { errors: { _form: ["This poll is closed — nudging is disabled."] } };
  }

  // Probe #1: RE-QUERY the current non-respondents server-side at submit time —
  // never the page's snapshot, never a client-supplied list. Use each
  // invitation's stored address as the recipient.
  const tracking = await getInvitationTrackingForPoll(poll.id);
  const recipients = tracking
    .filter((row) => row.responded === false)
    .map((row) => row.email);

  // Zero non-respondents -> send nothing (the UI also disables the control; this
  // is the server-side guard).
  if (recipients.length === 0) {
    return { results: [] };
  }

  // Build the participant URL ONCE — the same reminder link for every send.
  const h = await headers();
  const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  const participantUrl = buildParticipantUrl(base, poll.participantUrlId);

  const subject = "Reminder: your response is needed";
  const html = renderReminderEmail({ title: poll.title, participantUrl });

  // Sequential, best-effort loop (D-05). One failure never aborts the batch.
  // Records NO new invitations row (nudge only targets already-invited addresses).
  const results: SendInviteResult[] = [];
  for (const email of recipients) {
    const result = await sendEmail({ to: email, subject, html });
    if (result.ok) {
      results.push({ email, status: "sent" });
    } else if (result.rateLimited) {
      results.push({ email, status: "rate_limited" });
    } else {
      results.push({ email, status: "failed" });
    }
  }

  return { results };
}

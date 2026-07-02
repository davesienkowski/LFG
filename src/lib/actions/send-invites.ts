// sendInvites server action (MAIL-01/02, D-05/D-06). Organizer-triggered
// individual invite sends with inline per-recipient feedback.
//
// Flow: re-derive the poll from the server-validated adminUrlId (notFound on
// miss) -> parse the free-text address list (comma AND newline separated) ->
// reject empty input with a form error -> case-insensitively dedupe -> validate
// each address -> build the participant URL once -> loop recipients SEQUENTIALLY
// (await each, no Promise.all) sending ONE individual email per address ->
// return a per-recipient result row in submission order.
//
// Load-bearing invariants:
//  - V4 / T-04-04: NEVER trust a client-supplied poll id. The poll is re-derived
//    from the admin token via getPollByAdminUrlId; an unknown token notFound()s.
//    The admin token is the authorization (mirrors the admin page).
//  - T-04-03: one individual send per address — never CC/BCC-all. sendEmail
//    receives a single string `to`; the loop is sequential (D-06), not batched.
//  - T-04-01: subject is a FIXED prefix + the already-Zod-length-capped
//    poll.title (≤200 at createPoll); never built from body HTML or a raw user
//    header line. Nodemailer's structured sendMail strips CR/LF from headers.
//  - D-05: best-effort per address — one failure never throws or aborts the rest;
//    a malformed address becomes its OWN failed row, never silently dropped.
//  - No interactive transaction: read the poll once, then loop sends (neon-http
//    has no callback transactions; there is no DB write here at all).
"use server";

import { z } from "zod";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getPollByAdminUrlId } from "@/lib/db/queries";
import { resolveBaseUrl, buildParticipantUrl } from "@/lib/urls";
import { sendEmail } from "@/lib/email/send";
import { renderInviteEmail } from "@/lib/email/templates";

export type SendInviteStatus = "sent" | "rate_limited" | "failed";

export type SendInviteResult = {
  email: string;
  status: SendInviteStatus;
  // Optional per-recipient override for the chip label (e.g. a validation
  // message for a malformed address). When absent the UI falls back to the
  // status's default label.
  message?: string;
};

export type SendInvitesState = {
  errors?: Record<string, string[]>;
  results?: SendInviteResult[];
} | null;

// max() BEFORE email() so an over-length string surfaces distinctly from a
// malformed one — matches submit-response.ts's ordering.
const AddressSchema = z.string().max(200).email();

export async function sendInvites(
  _prevState: SendInvitesState,
  formData: FormData,
): Promise<SendInvitesState> {
  // V4: re-derive the poll from the admin token — never a client poll id.
  const adminUrlId = String(formData.get("adminUrlId") ?? "");
  const poll = await getPollByAdminUrlId(adminUrlId);
  if (!poll) notFound();

  // Parse the free-text list: split on commas AND newlines, trim, drop empties.
  const raw = String(formData.get("addresses") ?? "");
  const tokens = raw
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // EDGE (MAIL-01/empty): no non-empty tokens -> form error, run NO send loop.
  if (tokens.length === 0) {
    return { errors: { _form: ["Enter at least one email address."] } };
  }

  // EDGE (MAIL-01/adjacency): case-insensitively dedupe on the trimmed,
  // lower-cased address so each unique address gets EXACTLY ONE invite. Preserve
  // FIRST-seen submission order (stable, MAIL-01/ordering) — the display form is
  // the first occurrence's original casing.
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const token of tokens) {
    const key = token.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    recipients.push(token);
  }

  // Build the participant URL ONCE — the same link for every invite.
  const h = await headers();
  const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  const participantUrl = buildParticipantUrl(base, poll.participantUrlId);

  // Fixed subject prefix + the length-capped poll.title (T-04-01).
  const subject = `You're invited: ${poll.title}`;
  const html = renderInviteEmail({ title: poll.title, participantUrl });

  const results: SendInviteResult[] = [];
  for (const email of recipients) {
    // V5: validate per address. A malformed entry is its OWN failed row — never
    // dropped, never aborting the batch, never reaching sendEmail.
    const parsed = AddressSchema.safeParse(email);
    if (!parsed.success) {
      results.push({
        email,
        status: "failed",
        message: "Not a valid email address",
      });
      continue;
    }

    // Sequential await — one individual send per address, never CC (T-04-03).
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

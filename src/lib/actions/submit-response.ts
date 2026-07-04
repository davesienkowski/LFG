// submitResponse server action (D2-04 / D2-10 / RESEARCH Pattern 1 + 3).
//
// Flow: Zod-validate name/email/votes -> re-fetch the poll by participant token
// (notFound on miss) -> reject when poll.status != 'open' (server-enforced
// TOCTOU guard, never trust a rendered status) -> INSERT the participant with an
// independent editToken (nanoid(21), retry on the astronomically-improbable
// unique collision, mirrors createPoll) -> INSERT one vote row per AUTHORITATIVE
// option, gap-filling untouched options to 'no' -> set the httpOnly edit cookie
// -> redirect to /thanks.
//
// Load-bearing invariants:
//  - INSERT-only. A brand-new participant cannot collide on (participant_id,
//    option_id), so there is NO onConflictDoUpdate here — the return/edit upsert
//    path is 02-02's updateResponse (D2-05).
//  - No interactive transaction (neon-http does not support them, D2-04): two
//    statements, exactly like createPoll's poll->options insert.
//  - The vote rows are built by iterating getOptionsForPoll (the server's
//    authoritative list), NOT the client array — votes for foreign optionIds are
//    ignored and missing options are gap-filled to 'no' (Pitfall 2 / T-02-01).
//  - editToken is a THIRD independent token, never derived from participantUrlId
//    (D2-11, extends P1). The cookie is keyed on participantUrlId (Pitfall 7) and
//    is convenience-only — never the edit authority (D2-08).
"use server";

import { z } from "zod";
import { redirect, notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { participants, votes } from "@/lib/db/schema";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
  getPollAdminNotifyTargets,
} from "@/lib/db/queries";
import { generateToken } from "@/lib/tokens";
import { resolveBaseUrl, buildEditUrl, buildAdminUrl } from "@/lib/urls";
import { sendEmail } from "@/lib/email/send";
import {
  renderConfirmationEmail,
  renderParticipantResponseNotification,
} from "@/lib/email/templates";

const SubmitResponseSchema = z.object({
  // trim() BEFORE min(1) so a whitespace-only name is rejected (UI-SPEC).
  name: z
    .string()
    .trim()
    .min(1, "Your name is required")
    .max(100, "Name must be 100 characters or fewer"),
  // Optional. max() before email() so an over-length string surfaces the length
  // message; an invalid short string surfaces the format message.
  email: z
    .string()
    .max(200, "Email must be 200 characters or fewer")
    .email("Enter a valid email address")
    .optional(),
  votes: z
    .array(
      z.object({
        optionId: z.string(),
        state: z.enum(["yes", "ifneedbe", "no"]),
      }),
    )
    .optional(),
});

export type SubmitResponseState = {
  errors?: Record<string, string[]>;
} | null;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function submitResponse(
  _prevState: SubmitResponseState,
  formData: FormData,
): Promise<SubmitResponseState> {
  // The grid serializes its selections into a single JSON hidden input "votes".
  let parsedVotes: unknown;
  try {
    parsedVotes = JSON.parse(String(formData.get("votes") ?? "[]"));
  } catch {
    // A poisoned/unparsable client array still yields a correct write: every
    // option gap-fills to 'no' server-side below.
    parsedVotes = [];
  }

  const parsed = SubmitResponseSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email") || undefined,
    votes: parsedVotes,
  });
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<
      string,
      string[]
    >;
    return { errors: fieldErrors };
  }

  const { name, email, votes: votesInput } = parsed.data;

  const participantUrlId = String(formData.get("participantUrlId") ?? "");
  const poll = await getPollByParticipantUrlId(participantUrlId);
  if (!poll) notFound();

  // Server-enforced status guard, re-checked at write time (T-02-02).
  if (poll.status !== "open") {
    return { errors: { _form: ["Voting is closed for this poll."] } };
  }

  const pollOptions = await getOptionsForPoll(poll.id);

  // Insert the participant, retrying on the astronomically-improbable editToken
  // collision (same bounded loop as createPoll's token mint).
  let participantId: string | null = null;
  // Captured for the best-effort confirmation email below (VOTE-04) — the SAME
  // edit token /thanks surfaces, an additional channel, not a new credential.
  let mintedEditToken: string | null = null;
  for (let attempt = 0; ; attempt++) {
    const editToken = generateToken();
    try {
      const [participant] = await db
        .insert(participants)
        .values({ pollId: poll.id, name, email: email ?? null, editToken })
        .returning({ id: participants.id, editToken: participants.editToken });
      participantId = participant.id;
      mintedEditToken = participant.editToken;
      // Set the edit cookie once the token is durably minted.
      const cookieStore = await cookies();
      cookieStore.set({
        name: `lfg_edit_${poll.participantUrlId}`,
        value: participant.editToken,
        httpOnly: true,
        sameSite: "lax",
        // Secure under HTTPS in production (Vercel); omitted in local HTTP dev
        // so the same-device auto-load cookie still works over localhost.
        secure: process.env.NODE_ENV === "production",
        path: `/p/${poll.participantUrlId}`,
        maxAge: 60 * 60 * 24 * 365,
      });
      break;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }

  // Build vote rows from the AUTHORITATIVE option list (never the client array):
  // untouched options gap-fill to 'no', foreign optionIds are ignored (Pitfall 2).
  const submittedByOption = new Map(
    (votesInput ?? []).map((v) => [v.optionId, v.state]),
  );
  const rows = pollOptions.map((opt) => ({
    pollId: poll.id,
    participantId: participantId as string,
    optionId: opt.id,
    state: submittedByOption.get(opt.id) ?? "no",
  }));
  await db.insert(votes).values(rows);

  // Best-effort VOTE-04 confirmation (D-07). Fires ONLY when the participant
  // supplied an email. This action is INSERT-only, so every call is a FIRST
  // submit by construction — the "first submit only" rule is satisfied without a
  // guard here (edits route through updateResponse, which must NOT gain this
  // hook). The send is scheduled via after() so it never blocks or fails the
  // vote: after() runs even after redirect() and, on Vercel, extends the
  // invocation via waitUntil so the SMTP handshake isn't dropped (Pitfall 2).
  //
  // The base URL is captured HERE, inside the request, BEFORE after() runs — the
  // deferred callback must not call next/headers after the redirect is issued.
  if (email && mintedEditToken) {
    const h = await headers();
    const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
    const editToken = mintedEditToken;
    const confirmationEmail = email;
    after(async () => {
      const editUrl = buildEditUrl(base, poll.participantUrlId, editToken);
      // Result is intentionally ignored — a send failure must never surface past
      // after() or affect the already-issued redirect (D-07).
      await sendEmail({
        to: confirmationEmail,
        subject: `Your response to ${poll.title}`,
        html: renderConfirmationEmail({ title: poll.title, editUrl }),
      });
    });
  }

  // Best-effort CREATOR notification (t7e / F1 / D-02). A SEPARATE hook from the
  // participant-confirmation above: on EVERY accepted first submit, notify the
  // poll's stored creator (if any) that this participant responded, linking the
  // /a/ admin results view. Fetched server-side by poll.id via
  // getPollAdminNotifyTargets — the ONLY path resolving admin_url_id here. This
  // block sits AFTER the status guard and the durable votes write, so a
  // closed-poll/rejected submit never notifies (F1); each accepted event
  // notifies exactly once (no dedup across events).
  //
  // The adminUrlId lives ONLY inside the after() closure to build the CREATOR's
  // email — it must NEVER be returned to the page, placed in RSC props, or reach
  // the participant's browser (three-token discipline, T-t7e-01). participantName
  // is `name` ONLY — never the participant email (F2 / T-t7e-06). The base URL is
  // captured in-request BEFORE after(); the send result is intentionally ignored
  // so a failure (or EMAIL_PROVIDER=none) never affects the already-issued
  // redirect (D-02).
  const notifyTargets = await getPollAdminNotifyTargets(poll.id);
  if (notifyTargets?.creatorEmail) {
    const h = await headers();
    const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
    const creatorEmail = notifyTargets.creatorEmail;
    const adminUrlId = notifyTargets.adminUrlId;
    after(async () => {
      const adminUrl = buildAdminUrl(base, adminUrlId);
      await sendEmail({
        to: creatorEmail,
        subject: `New response to ${poll.title}`,
        html: renderParticipantResponseNotification({
          title: poll.title,
          participantName: name,
          adminUrl,
        }),
      });
    });
  }

  // redirect() throws — no code runs after this line.
  redirect(`/p/${poll.participantUrlId}/thanks`);
}

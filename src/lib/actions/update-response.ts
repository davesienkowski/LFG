// updateResponse server action (D2-05 / VOTE-05 / VOTE-06 / RESEARCH Pattern 2 +
// 5). The return-and-edit counterpart to submitResponse: it REPLACES an existing
// participant's votes via a single atomic upsert, rather than inserting a new
// participant.
//
// Flow: Zod-validate name/email/votes -> re-fetch the poll by participant token
// (notFound on miss) -> RE-DERIVE the participant from the server-validated
// editToken (never a client participantId — VOTE-06) and cross-check
// participant.pollId === poll.id (notFound covers unknown/empty/wrong-poll
// token, one identical 404 surface, no token-format oracle) -> reject when
// poll.status != 'open' (server-enforced TOCTOU guard, T-02-07) -> build the
// full vote-row set from the AUTHORITATIVE options (gap-fill untouched to 'no')
// -> persist with ONE onConflictDoUpdate -> re-set the edit cookie -> redirect.
//
// Load-bearing invariants:
//  - The write is a SINGLE `insert(votes).values(rows).onConflictDoUpdate(...)`.
//    neon-http has no interactive transactions (D2-04); the upsert is already
//    atomic as one statement, so two concurrent edits resolve last-write-wins
//    with no mixed/partial blend (T-02-09) and the token-check-then-write race is
//    covered by the same atomic statement (no delete-then-insert).
//  - The onConflictDoUpdate target MUST name exactly the
//    votes_participant_option_unique columns [participantId, optionId]
//    (RESEARCH Pitfall 1) — a mismatch 500s at write time, not compile time.
//  - `sql\`excluded.state\`` is a FIXED literal referencing the Postgres excluded
//    pseudo-table — never interpolated input (T-02-10); the actual SQLi defense
//    is the parameterized .values() plus the Zod-enum-validated state.
//  - The participant-CONFIRMATION hook stays deliberately ABSENT here (only
//    submitResponse sends it — a first-submit-only channel). t7e adds ONLY the
//    best-effort CREATOR notification: the creator wants to know about every
//    edit, so each accepted edit notifies once (no dedup across events, F1). Same
//    three-token discipline as submitResponse — the adminUrlId (from
//    getPollAdminNotifyTargets) lives ONLY inside the after() closure and never
//    reaches the participant's browser (T-t7e-01); participantName is the name
//    only, never the participant email (F2).
"use server";

import { z } from "zod";
import { redirect, notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { participants, votes } from "@/lib/db/schema";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
  getParticipantByEditToken,
  getPollAdminNotifyTargets,
} from "@/lib/db/queries";
import { isVotingOpen } from "@/lib/poll-status";
import { resolveBaseUrl, buildAdminUrl } from "@/lib/urls";
import { sendEmail } from "@/lib/email/send";
import { renderParticipantResponseNotification } from "@/lib/email/templates";

// Identical validation to submitResponse (D2-10): trim-before-min on name,
// optional email with max()-before-email() ordering, votes enum array.
const UpdateResponseSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Your name is required")
    .max(100, "Name must be 100 characters or fewer"),
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

export type UpdateResponseState = {
  errors?: Record<string, string[]>;
} | null;

export async function updateResponse(
  _prevState: UpdateResponseState,
  formData: FormData,
): Promise<UpdateResponseState> {
  // The grid serializes its selections into a single JSON hidden input "votes".
  let parsedVotes: unknown;
  try {
    parsedVotes = JSON.parse(String(formData.get("votes") ?? "[]"));
  } catch {
    // A poisoned/unparsable client array still yields a correct write: every
    // option gap-fills to 'no' server-side below.
    parsedVotes = [];
  }

  const parsed = UpdateResponseSchema.safeParse({
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

  // Re-derive the participant from the SERVER-VALIDATED token only (VOTE-06).
  // Never trust a client-supplied participantId. A null participant (unknown or
  // empty token) OR a token owned by a participant of a DIFFERENT poll both
  // notFound() with the identical 404 surface — no token-format oracle.
  const editToken = String(formData.get("editToken") ?? "");
  const participant = await getParticipantByEditToken(editToken);
  if (!participant || participant.pollId !== poll.id) notFound();

  // Server-enforced voting-open guard, re-checked at write time (T-02-07 /
  // DEAD-01 LOCKED 4). isVotingOpen derives "closed" from BOTH status and the
  // deadline instant now selected by getPollByParticipantUrlId — a stale open
  // edit form that POSTs after the deadline is rejected here with no write.
  if (!isVotingOpen(poll, new Date())) {
    return { errors: { _form: ["Voting is closed for this poll."] } };
  }

  // Build vote rows from the AUTHORITATIVE option list (never the client array):
  // untouched options gap-fill to 'no', foreign optionIds are ignored (T-02-01).
  const pollOptions = await getOptionsForPoll(poll.id);
  const submittedByOption = new Map(
    (votesInput ?? []).map((v) => [v.optionId, v.state]),
  );
  const rows = pollOptions.map((opt) => ({
    pollId: poll.id,
    participantId: participant.id,
    optionId: opt.id,
    state: submittedByOption.get(opt.id) ?? "no",
  }));

  // The ENTIRE write: one atomic upsert. target MUST match
  // votes_participant_option_unique exactly (Pitfall 1); excluded.state is the
  // fixed Postgres pseudo-column literal, never interpolated input.
  await db
    .insert(votes)
    .values(rows)
    .onConflictDoUpdate({
      target: [votes.participantId, votes.optionId],
      set: { state: sql`excluded.state` },
    });

  // Optionally refresh the participant's name/email on edit.
  await db
    .update(participants)
    .set({ name, email: email ?? null })
    .where(eq(participants.id, participant.id));

  // Best-effort CREATOR notification on edit (t7e / F1 / D-02). Sits AFTER the
  // status guard and the durable upsert, so a closed-poll/rejected edit never
  // notifies; each accepted edit notifies exactly once (no dedup across events).
  // getPollAdminNotifyTargets(poll.id) is the ONLY path resolving admin_url_id
  // here; the adminUrlId lives ONLY inside the after() closure to build the
  // CREATOR's email — it never returns to the page/RSC props/participant browser
  // (T-t7e-01). participantName is `name` ONLY, never the participant email (F2 /
  // T-t7e-06). Base URL captured in-request BEFORE after(); the send result is
  // intentionally ignored so a failure (or EMAIL_PROVIDER=none) never affects the
  // redirect (D-02). No participant-confirmation is sent here (deliberately
  // absent — that channel is submitResponse's alone).
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

  // Re-set the same httpOnly edit cookie (Pitfall 4) so the same-device
  // auto-load keeps working after an edit.
  const cookieStore = await cookies();
  cookieStore.set({
    name: `lfg_edit_${poll.participantUrlId}`,
    value: editToken,
    httpOnly: true,
    sameSite: "lax",
    // Secure under HTTPS in production (Vercel); omitted in local HTTP dev
    // so the same-device auto-load cookie still works over localhost.
    secure: process.env.NODE_ENV === "production",
    path: `/p/${poll.participantUrlId}`,
    maxAge: 60 * 60 * 24 * 365,
  });

  // redirect() throws — no code runs after this line.
  redirect(`/p/${poll.participantUrlId}/thanks`);
}

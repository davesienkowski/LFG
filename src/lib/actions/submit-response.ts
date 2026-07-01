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
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { participants, votes } from "@/lib/db/schema";
import {
  getPollByParticipantUrlId,
  getOptionsForPoll,
} from "@/lib/db/queries";
import { generateToken } from "@/lib/tokens";

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
  for (let attempt = 0; ; attempt++) {
    const editToken = generateToken();
    try {
      const [participant] = await db
        .insert(participants)
        .values({ pollId: poll.id, name, email: email ?? null, editToken })
        .returning({ id: participants.id, editToken: participants.editToken });
      participantId = participant.id;
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

  // redirect() throws — no code runs after this line.
  redirect(`/p/${poll.participantUrlId}/thanks`);
}

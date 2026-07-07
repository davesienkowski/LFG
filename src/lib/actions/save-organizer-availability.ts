// saveOrganizerAvailability server action (ORG-01 / LOCKED constraints 4, 6, 7 /
// CONTEXT ORG-01). The organizer adds or edits THEIR OWN availability row from
// the admin view — no participant link, no email. It maintains AT MOST ONE
// is_organizer=true participant row per poll (find-or-create upsert) and folds
// that row into results/best-day like any other participant with zero changes to
// computeResults.
//
// Flow: Zod-validate name (optional, trimmed, max 100, DEFAULT "You" when blank —
// NEVER an email) + votes -> re-derive the poll from the admin token via
// getPollByAdminUrlId (notFound on miss, NEVER a client poll/participant id) ->
// GATE on isVotingOpen(poll, now) — a closed/booked or deadline-passed poll
// rejects with a _form error and NO write -> find the existing organizer row via
// getOrganizerParticipant: INSERT one when absent (minting an editToken with the
// same bounded unique-violation retry submitResponse uses, email null,
// isOrganizer true), else UPDATE that row's name -> build vote rows from the
// AUTHORITATIVE option list (gap-fill untouched to "no", ignore foreign optionIds)
// and persist with ONE onConflictDoUpdate (covers first-add and edit alike) ->
// redirect to /a/{adminUrlId}.
//
// Load-bearing invariants:
//  - AT MOST ONE organizer row (LOCKED 6). The find-or-create is the whole
//    enforcement — there is NO DB partial-unique index this phase (matches the
//    single-admin model / the existing no-constraint participant precedent). The
//    form's isPending single-submit guard (organizer-availability-control.tsx)
//    bounds the concurrency window; a duplicate-creating code path is never
//    introduced here (edge-probe ORG-01 concurrency resolution).
//  - Admin-token authorization ONLY (LOCKED 7). The poll is re-derived from
//    adminUrlId; a client-supplied poll id or participant id is never trusted.
//  - The isVotingOpen gate is the SERVER-SIDE counterpart to the client hiding the
//    editable form on a closed poll (UI Probe #1); a stale open form that POSTs
//    after the deadline is rejected here with no write (LOCKED 4).
//  - NO email hook. This is NOT submit/update-response — the organizer row sends
//    no confirmation and triggers no creator-notify (prohibition-probe: hook
//    bleed). Because the row has a NULL email it is also invisible to Phase-7
//    email-keyed invitation tracking (edge-probe cross-feature resolution).
//  - The write follows update-response.ts's upsert template exactly: ONE
//    insert(votes).values(rows).onConflictDoUpdate on the
//    votes_participant_option_unique columns [participantId, optionId];
//    `excluded.state` is the fixed Postgres pseudo-column, never interpolated.
"use server";

import { z } from "zod";
import { redirect, notFound } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { participants, votes } from "@/lib/db/schema";
import {
  getPollByAdminUrlId,
  getOptionsForPoll,
  getOrganizerParticipant,
} from "@/lib/db/queries";
import { generateToken } from "@/lib/tokens";
import { isVotingOpen } from "@/lib/poll-status";

// name is OPTIONAL and never requires an email (LOCKED 6). trim() before max()
// so a padded name is length-checked on its trimmed form; blank/absent defaults
// to "You" after parsing. votes reuse update-response.ts's enum-array schema.
const SaveOrganizerAvailabilitySchema = z.object({
  name: z
    .string()
    .trim()
    .max(100, "Name must be 100 characters or fewer")
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

export type SaveOrganizerAvailabilityState = {
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

export async function saveOrganizerAvailability(
  _prevState: SaveOrganizerAvailabilityState,
  formData: FormData,
): Promise<SaveOrganizerAvailabilityState> {
  // The grid serializes its selections into a single JSON hidden input "votes".
  // A poisoned/unparsable array still yields a correct write: every option
  // gap-fills to "no" server-side below.
  let parsedVotes: unknown;
  try {
    parsedVotes = JSON.parse(String(formData.get("votes") ?? "[]"));
  } catch {
    parsedVotes = [];
  }

  const parsed = SaveOrganizerAvailabilitySchema.safeParse({
    name: formData.get("name") || undefined,
    votes: parsedVotes,
  });
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<
      string,
      string[]
    >;
    return { errors: fieldErrors };
  }

  // Blank/absent name defaults to "You" (CONTEXT ORG-01); a non-empty trimmed
  // name overrides it. No email is ever collected for the organizer row.
  const name =
    parsed.data.name && parsed.data.name.length > 0 ? parsed.data.name : "You";
  const votesInput = parsed.data.votes;

  // LOCKED 7: re-derive the poll from the admin token — never a client poll id.
  const adminUrlId = String(formData.get("adminUrlId") ?? "");
  const poll = await getPollByAdminUrlId(adminUrlId);
  if (!poll) notFound();

  // GATE (LOCKED 4 / UI Probe #1 server-side counterpart): a closed/booked or
  // deadline-passed poll rejects with a _form error and performs NO write — the
  // same rule participants get, re-checked here so a stale open form can't write.
  if (!isVotingOpen(poll, new Date())) {
    return {
      errors: {
        _form: ["Voting is closed — you can no longer change your availability."],
      },
    };
  }

  // Find-or-create the SINGLE organizer row (LOCKED 6, at-most-one). A miss
  // INSERTs one row (email null, isOrganizer true, editToken minted with the same
  // bounded unique-violation retry submitResponse uses); a hit UPDATEs that row's
  // name. Either branch yields the participantId the votes upsert targets.
  const existing = await getOrganizerParticipant(poll.id);
  let participantId: string;
  if (!existing) {
    let insertedId: string | null = null;
    for (let attempt = 0; ; attempt++) {
      const editToken = generateToken();
      try {
        const [participant] = await db
          .insert(participants)
          .values({
            pollId: poll.id,
            name,
            email: null,
            isOrganizer: true,
            editToken,
          })
          .returning({ id: participants.id });
        insertedId = participant.id;
        break;
      } catch (error) {
        if (isUniqueViolation(error) && attempt < 4) continue;
        throw error;
      }
    }
    participantId = insertedId as string;
  } else {
    await db
      .update(participants)
      .set({ name })
      .where(eq(participants.id, existing.id));
    participantId = existing.id;
  }

  // Build vote rows from the AUTHORITATIVE option list (never the client array):
  // untouched options gap-fill to "no", foreign optionIds are ignored.
  const pollOptions = await getOptionsForPoll(poll.id);
  const submittedByOption = new Map(
    (votesInput ?? []).map((v) => [v.optionId, v.state]),
  );
  const rows = pollOptions.map((opt) => ({
    pollId: poll.id,
    participantId,
    optionId: opt.id,
    state: submittedByOption.get(opt.id) ?? "no",
  }));

  // The ENTIRE vote write: one atomic upsert (neon-http-safe). target MUST match
  // votes_participant_option_unique exactly; excluded.state is the fixed Postgres
  // pseudo-column literal, never interpolated input. Covers both first-add
  // (all inserts) and edit (all updates) in a single statement.
  await db
    .insert(votes)
    .values(rows)
    .onConflictDoUpdate({
      target: [votes.participantId, votes.optionId],
      set: { state: sql`excluded.state` },
    });

  // redirect() throws — no code runs after this line. No email hook fires
  // (deliberately absent — prohibition-probe: hook bleed). The admin page
  // re-renders with the organizer row folded into Results (labelled "(you)").
  redirect(`/a/${adminUrlId}`);
}

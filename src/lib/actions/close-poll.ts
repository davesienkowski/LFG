// closePoll server action (FNL-01/02/03, D-08/D-09 / RESEARCH Pattern 4). The
// organizer "Book it" finalize: it authoritatively closes voting in a SINGLE
// UPDATE and best-effort-notifies every unique emailed voter.
//
// Flow: Zod-validate winningOptionId (uuid shape) -> re-derive the poll from the
// server-validated adminUrlId (notFound on miss, NEVER a client poll id) ->
// GUARD reject an already-closed poll -> GUARD reject a winningOptionId that does
// not belong to this poll -> ONE `db.update(polls).set({ status, winningOptionId })`
// -> schedule finalization notices via after() -> redirect to the admin page so
// it re-renders into the finalized state.
//
// Load-bearing invariants:
//  - V4 / T-04-07: the admin token is the sole authority. The poll is re-derived
//    via getPollByAdminUrlId; an unknown token notFound()s. A client-supplied
//    poll id is never trusted.
//  - T-04-09: winningOptionId MUST be one of getOptionsForPoll(poll.id) — a
//    foreign/forged option id is rejected with a form error and NO write.
//  - The write is a SINGLE UPDATE statement (neon-http has no interactive
//    transactions, D2-04) — the open->closed transition + winner record commit
//    atomically. This reuses the existing `status` column Phase 2's read-only
//    path already honors (no new enforcement code).
//  - D-09 / T-04-10: sends run in after() AFTER the UPDATE commits, are deduped
//    by trimmed/lower-cased address, and each is best-effort — a send failure is
//    swallowed and NEVER reverts the already-committed close nor aborts the
//    remaining recipients. The poll is authoritatively closed the moment the
//    UPDATE commits, regardless of mail outcome.
//  - T-04-01: the subject is a FIXED template + the already-length-capped
//    poll.title (<=200 at createPoll); the structured sendEmail transport strips
//    CR/LF from headers — never a raw user header line.
//  - The base URL is captured HERE, inside the request, BEFORE after() runs — the
//    deferred callback must not call next/headers after the redirect is issued.
"use server";

import { z } from "zod";
import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls } from "@/lib/db/schema";
import {
  getPollByAdminUrlId,
  getOptionsForPoll,
  getVoterEmailsForPoll,
} from "@/lib/db/queries";
import { resolveBaseUrl, buildParticipantUrl } from "@/lib/urls";
import { formatDateWithTime } from "@/lib/format-date";
import { sendEmail } from "@/lib/email/send";
import { renderFinalizationEmail } from "@/lib/email/templates";

// uuid-shaped, non-empty. A malformed/absent value surfaces the same _form
// message as a foreign option id (both mean "that's not a candidate date").
const WinningOptionSchema = z.string().uuid();

export type ClosePollState = {
  errors?: Record<string, string[]>;
} | null;

export async function closePoll(
  _prevState: ClosePollState,
  formData: FormData,
): Promise<ClosePollState> {
  // (1) Validate the winning option id (uuid shape). A non-uuid value can never
  // match a real option, so short-circuit with the same message as the
  // belongs-to-poll guard below.
  const winningParsed = WinningOptionSchema.safeParse(
    formData.get("winningOptionId"),
  );
  if (!winningParsed.success) {
    return { errors: { _form: ["Choose a candidate date from this poll."] } };
  }
  const winningOptionId = winningParsed.data;

  // (2) V4 / T-04-07: re-derive the poll from the admin token — never a client id.
  const adminUrlId = String(formData.get("adminUrlId") ?? "");
  const poll = await getPollByAdminUrlId(adminUrlId);
  if (!poll) notFound();

  // (3) GUARD (FNL-01 edge): reject an already-closed poll (same guard/return
  // shape as update-response.ts's status check).
  if (poll.status !== "open") {
    return { errors: { _form: ["This poll is already closed."] } };
  }

  // (4) GUARD (T-04-09): the winning option MUST belong to THIS poll. Reading the
  // authoritative option list and matching prevents finalizing on a foreign or
  // forged option id.
  const pollOptions = await getOptionsForPoll(poll.id);
  const winningOption = pollOptions.find((o) => o.id === winningOptionId);
  if (!winningOption) {
    return { errors: { _form: ["Choose a candidate date from this poll."] } };
  }

  // (5) The ENTIRE write: one atomic UPDATE (neon-http-safe, no interactive txn).
  // Once this commits, the poll is authoritatively closed (D-09).
  await db
    .update(polls)
    .set({ status: "closed", winningOptionId })
    .where(eq(polls.adminUrlId, adminUrlId));

  // Capture every value the deferred callback needs BEFORE after() (it runs
  // post-redirect and must not touch next/headers then). Only plain captured
  // primitives cross into after().
  const h = await headers();
  const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
  const participantUrl = buildParticipantUrl(base, poll.participantUrlId);
  const chosenDate = winningOption.date;
  const chosenTime = winningOption.startTime
    ? winningOption.startTime.slice(0, 5)
    : null;
  // Fixed subject template + length-capped poll.title (T-04-01).
  const subject = `${poll.title} is booked for ${formatDateWithTime(
    chosenDate,
    chosenTime,
  )}`;
  const html = renderFinalizationEmail({
    title: poll.title,
    location: poll.location,
    chosenDate,
    chosenTime,
    participantUrl,
  });
  const pollId = poll.id;

  // (6) Best-effort finalization notices (D-09 / FNL-03 / T-04-10). Scheduled
  // AFTER the UPDATE via after() so nothing here can revert the close. after()
  // runs even after redirect() and, on Vercel, extends the invocation via
  // waitUntil so the SMTP handshake isn't dropped.
  after(async () => {
    const voters = await getVoterEmailsForPoll(pollId);
    // DEDUPE by trimmed/lower-cased address so a shared inbox gets ONE notice,
    // not one per voter (FNL-03/adjacency). Zero emailed voters => zero sends,
    // the loop simply runs zero times and the close still stands.
    const seen = new Set<string>();
    for (const voter of voters) {
      // email is guaranteed non-null by getVoterEmailsForPoll's filter; guard
      // defensively so a stray null never dedupes to "" or throws.
      if (!voter.email) continue;
      const key = voter.email.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        // sendEmail never throws (returns a SendResult); the try/catch is a
        // belt-and-suspenders guarantee that even an unexpected throw NEVER
        // reverts the committed close nor aborts the remaining recipients (D-09).
        await sendEmail({ to: voter.email, subject, html });
      } catch {
        // Swallowed by design (D-09/T-04-10) — best-effort per recipient.
      }
    }
  });

  // (7) redirect() throws — no code runs after this line. The admin page
  // re-renders into the finalized state.
  redirect(`/a/${adminUrlId}`);
}

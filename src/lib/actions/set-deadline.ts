// setDeadline server action (DEAD-01 / LOCKED constraints 3, 5, 7 / UI Probe #4).
// The organizer sets, updates, or clears an OPTIONAL voting deadline from the
// admin view. Mirrors close-poll.ts's authorization spine: the admin token is
// the SOLE authority — the poll is re-derived via getPollByAdminUrlId and an
// unknown token notFound()s; a client-supplied poll id is NEVER trusted.
//
// Flow: read `intent` ("save" default, or "clear") + `adminUrlId` -> re-derive
// the poll (notFound on miss) -> intent "clear": one UPDATE setting deadline
// NULL -> intent "save": parse the submitted ISO instant and reject anything
// that does not parse OR is not strictly after now with a field error and NO
// write -> one UPDATE setting the instant -> redirect to /a/{adminUrlId}.
//
// Load-bearing invariants:
//  - The write is a SINGLE UPDATE statement (neon-http has no interactive
//    transactions) and NEVER touches `status`. A deadline never books a poll and
//    never reopens a closed one — the lazy-close rule lives entirely in
//    isVotingOpen, which requires status "open", so a deadline on a closed poll
//    is a behavioral no-op (LOCKED constraint 3; edge-probe DEAD-01).
//  - The deadline is an INSTANT. The client island (deadline-control.tsx) converts
//    the organizer's naive datetime-local wall-clock to a real UTC instant in the
//    browser and posts it as the ISO string `deadlineIso`; here it round-trips
//    through `new Date(iso)` so the stored instant is correct regardless of the
//    server offset (LOCKED constraint 5 — no raw Date crosses the boundary).
//  - The server-side `> now` check is the AUTHORITATIVE future validation; the
//    input `min` attribute is only a UX hint (UI Probe #4). A past/present/
//    unparseable value is rejected with a field error and performs NO write.
"use server";

import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls } from "@/lib/db/schema";
import { getPollByAdminUrlId } from "@/lib/db/queries";

export type SetDeadlineState = {
  errors?: Record<string, string[]>;
} | null;

export async function setDeadline(
  _prevState: SetDeadlineState,
  formData: FormData,
): Promise<SetDeadlineState> {
  // V4 / LOCKED 7: re-derive the poll from the admin token — never a client id.
  const adminUrlId = String(formData.get("adminUrlId") ?? "");
  const poll = await getPollByAdminUrlId(adminUrlId);
  if (!poll) notFound();

  const intent = String(formData.get("intent") ?? "save");

  // Clear: a single UPDATE nulling the column. status is UNTOUCHED (LOCKED 3).
  if (intent === "clear") {
    await db
      .update(polls)
      .set({ deadline: null })
      .where(eq(polls.adminUrlId, adminUrlId));
    redirect(`/a/${adminUrlId}`);
  }

  // Save: parse the ISO instant the client island posts. A missing, unparseable,
  // or non-future value is rejected server-side with a field error and NO write
  // (UI Probe #4 — the input `min` hint is never the validation boundary).
  const rawIso = String(formData.get("deadlineIso") ?? "");
  const deadline = new Date(rawIso);
  if (
    rawIso === "" ||
    Number.isNaN(deadline.getTime()) ||
    deadline <= new Date()
  ) {
    return { errors: { deadline: ["Deadline must be in the future."] } };
  }

  // The ENTIRE write: one atomic UPDATE (neon-http-safe). status is UNTOUCHED —
  // a deadline never books a poll and never reopens a closed one (LOCKED 3).
  await db
    .update(polls)
    .set({ deadline })
    .where(eq(polls.adminUrlId, adminUrlId));

  // redirect() throws — no code runs after this line. The admin page re-renders
  // with the new deadline state.
  redirect(`/a/${adminUrlId}`);
}

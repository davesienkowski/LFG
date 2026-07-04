// createPoll server action (D-02 / D-07 / D-08 / RESEARCH.md Pattern 3).
//
// Flow: validate the form with Zod -> app-layer dedupe of identical
// (date, startTime) pairs -> mint TWO independent crypto-random tokens -> insert
// the poll then its options (chronological position) -> redirect to the admin
// page. Validation failures return flattened field errors for useActionState;
// no poll row is created on any validation failure.
//
// Load-bearing invariants:
//  - participantUrlId and adminUrlId come from two SEPARATE generateToken()
//    calls — the admin token is never derived from the participant token
//    (D-07 / prohibition P1).
//  - dates stay 'YYYY-MM-DD' strings; we never construct new Date() here
//    (D-11 / P3).
"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { headers, cookies } from "next/headers";
import { after } from "next/server";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";
import { resolveBaseUrl, buildAdminUrl } from "@/lib/urls";
import { sendEmail } from "@/lib/email/send";
import { renderCreatorAdminLinkEmail } from "@/lib/email/templates";

const DateOptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Enter a valid time")
    .nullable()
    .optional(),
});

const CreatePollSchema = z.object({
  // trim() BEFORE min(1) so a whitespace-only title is rejected (UI-SPEC).
  title: z
    .string()
    .trim()
    .min(1, "Poll title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z
    .string()
    .max(2000, "Description must be 2,000 characters or fewer")
    .optional(),
  location: z
    .string()
    .max(200, "Location must be 200 characters or fewer")
    .optional(),
  // Optional. Mirrors submit-response.ts's `email` field VERBATIM: max() before
  // email() so an over-length string surfaces the length message; an invalid
  // short string surfaces the format message. Addresses the one best-effort
  // admin-link recovery email AND is now persisted as polls.creator_email (t7e)
  // so the creator can be notified on each participant response.
  creatorEmail: z
    .string()
    .max(200, "Email must be 200 characters or fewer")
    .email("Enter a valid email address")
    .optional(),
  dates: DateOptionSchema.array().min(1, "Add at least one candidate date"),
});

export type CreatePollState = {
  errors?: Record<string, string[]>;
} | null;

type DateOption = z.infer<typeof DateOptionSchema>;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export async function createPoll(
  _prevState: CreatePollState,
  formData: FormData,
): Promise<CreatePollState> {
  // The form serializes its date rows into a single JSON hidden input "dates".
  let parsedDates: unknown;
  try {
    parsedDates = JSON.parse(String(formData.get("dates") ?? "[]"));
  } catch {
    parsedDates = null;
  }

  const raw = {
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    location: formData.get("location") || undefined,
    // `|| undefined` makes an empty/untouched field "not provided" so it never
    // errors and never sends; a non-empty malformed value stays a string and
    // fails `.email()`, surfacing a top-level `creatorEmail` field error via the
    // existing flatten() path (no special lift needed, unlike the dates array).
    creatorEmail: formData.get("creatorEmail") || undefined,
    dates: parsedDates,
  };

  const parsed = CreatePollSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors as Record<
      string,
      string[]
    >;
    // flatten() does not surface per-row errors for array elements; lift the
    // first dates-path issue (e.g. a malformed date) up to the "dates" field so
    // the form can render it.
    if (!fieldErrors.dates) {
      const dateIssue = parsed.error.issues.find((i) => i.path[0] === "dates");
      if (dateIssue) fieldErrors.dates = [dateIssue.message];
    }
    return { errors: fieldErrors };
  }

  const { title, description, location, creatorEmail, dates } = parsed.data;

  // App-layer dedupe of identical (date, startTime) pairs — belt-and-suspenders
  // ahead of the DB's NULLS NOT DISTINCT unique constraint (POLL-03).
  const uniqueDates = dates.filter(
    (d, i, arr) =>
      arr.findIndex(
        (o) => o.date === d.date && (o.startTime ?? null) === (d.startTime ?? null),
      ) === i,
  );

  // Chronological order; null start_time sorts first (matches Postgres ASC).
  const sorted = [...uniqueDates].sort((a: DateOption, b: DateOption) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const at = a.startTime ?? "";
    const bt = b.startTime ?? "";
    if (at !== bt) return at < bt ? -1 : 1;
    return 0;
  });

  // Organizer identity (LD-2 / EP-ORG-EMPTY). Read AFTER validation so a rejected
  // submit stays cookie-free (mirrors the headers() email-hook placement below).
  // NORMALIZE first: an empty or whitespace-only cookie is treated as ABSENT —
  // NOT via `?? generateToken()`, because `??` does NOT treat the empty string ""
  // as nullish and would store an empty organizer_id that the feed query could
  // then group across unrelated polls. Compute organizerId ONCE, above the retry
  // loop, so it is stable across any token-collision retry. Clearing cookies
  // starts a fresh organizer identity — acceptable for the no-accounts model.
  const cookieStore = await cookies();
  const rawOrganizer = cookieStore.get("lfg_organizer")?.value;
  const existingOrganizer =
    rawOrganizer && rawOrganizer.trim() ? rawOrganizer : undefined;
  const organizerId = existingOrganizer ?? generateToken();

  // Insert the poll, retrying on the astronomically-improbable token collision.
  // (No interactive transaction: neon-http in prod does not support callback
  // transactions; app-layer dedupe already guarantees the options insert below
  // cannot collide, so only the poll insert can raise a 23505.)
  let pollId: string | null = null;
  let adminUrlId = "";
  for (let attempt = 0; ; attempt++) {
    const participantUrlId = generateToken();
    adminUrlId = generateToken();
    try {
      const [poll] = await db
        .insert(polls)
        .values({
          title,
          description,
          location,
          participantUrlId,
          adminUrlId,
          organizerId,
          // Persist the opted-in creator email (t7e). Empty/absent -> undefined
          // -> NULL, so a poll created without an email is never notified (D-02).
          // The existing best-effort admin-link recovery send (rqc) below still
          // fires off the same `creatorEmail` local, unchanged.
          creatorEmail: creatorEmail ?? null,
        })
        .returning({ id: polls.id });
      pollId = poll.id;
      break;
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) continue;
      throw error;
    }
  }

  await db.insert(options).values(
    sorted.map((d, i) => ({
      pollId: pollId as string,
      date: d.date,
      startTime: d.startTime ?? null,
      position: i,
    })),
  );

  // Mint/refresh the organizer cookie whenever it was absent OR empty/whitespace
  // (LD-2 / EP-ORG-EMPTY). When it was already present with a non-empty value we
  // reuse it and do NOT re-set it. httpOnly + sameSite lax + secure-in-prod +
  // path "/" mirrors the lfg_edit cookie discipline (T-sn2-06); it is a
  // convenience continuity token, never an authorization credential. Set BEFORE
  // redirect() (which throws) so the Set-Cookie header is emitted.
  if (!existingOrganizer) {
    cookieStore.set({
      name: "lfg_organizer",
      value: organizerId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // Best-effort admin-link recovery email (260703-rqc / D-02). Fires ONLY when
  // the creator supplied an email. This block lives OUTSIDE the token-mint retry
  // loop and AFTER both inserts, so the send is scheduled EXACTLY ONCE on the
  // true success path — never per token-collision retry attempt, and never on a
  // validation reject (which return()s earlier) or a failed insert (which
  // throws). Mirrors submit-response.ts's confirmation hook.
  //
  // The base URL is captured HERE, inside the request, BEFORE after() runs — the
  // deferred callback must not call next/headers after the redirect is issued.
  // With EMAIL_PROVIDER unset the after() callback still runs but sendEmail()
  // no-ops safely, so creation is unaffected (D-02 preserved). The admin link is
  // a bearer secret: it is never logged and the send result is intentionally
  // IGNORED — a failure must never surface past after() or affect the redirect.
  if (creatorEmail) {
    const h = await headers();
    const base = resolveBaseUrl(h.get("host"), h.get("x-forwarded-proto"));
    const to = creatorEmail;
    after(async () => {
      const adminUrl = buildAdminUrl(base, adminUrlId);
      await sendEmail({
        to,
        subject: `Manage your poll: ${title}`,
        html: renderCreatorAdminLinkEmail({ title, adminUrl }),
      });
    });
  }

  // redirect() throws — no code runs after this line.
  redirect(`/a/${adminUrlId}`);
}

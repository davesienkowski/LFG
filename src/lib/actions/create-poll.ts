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
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

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

  const { title, description, location, dates } = parsed.data;

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
        .values({ title, description, location, participantUrlId, adminUrlId })
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

  // redirect() throws — no code runs after this line.
  redirect(`/a/${adminUrlId}`);
}

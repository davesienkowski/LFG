// createPoll server-action tests (test-first / RED). Runs against the live
// Docker Postgres (DATABASE_URL must point at it). Covers SPEC requirements
// 1-4, 6-7, the Edge Coverage truths (dedupe / mixed date+time / idempotency /
// concurrency / token independence), and prohibition P1 (admin token not
// derivable from the participant token).
//
// redirect() is mocked so we can assert the success destination deterministically
// without a Next request context.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
}));

import { createPoll } from "./create-poll";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";

// Track admin tokens we create so we can clean up (cascade deletes options).
const createdAdminIds: string[] = [];

function fd(
  fields: Record<string, string | undefined>,
): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) f.set(k, v);
  }
  return f;
}

function datesJson(
  rows: Array<{ date: string; startTime?: string | null }>,
): string {
  return JSON.stringify(rows);
}

/**
 * Invoke createPoll and normalize the outcome: either a returned validation
 * state, or a captured redirect URL (success path throws the mocked redirect).
 */
async function run(formData: FormData): Promise<{
  state: { errors?: Record<string, string[]> } | null;
  redirectUrl: string | null;
}> {
  try {
    const state = await createPoll(null, formData);
    return { state, redirectUrl: null };
  } catch (e) {
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      const match = /^NEXT_REDIRECT;[^;]*;([^;]*);/.exec(digest);
      return { state: null, redirectUrl: match ? match[1] : null };
    }
    throw e;
  }
}

function adminIdFromRedirect(url: string | null): string {
  expect(url).toBeTruthy();
  const m = /^\/a\/(.+)$/.exec(url as string);
  expect(m).toBeTruthy();
  const id = (m as RegExpExecArray)[1];
  createdAdminIds.push(id);
  return id;
}

async function loadCreated(adminUrlId: string) {
  const [poll] = await db
    .select()
    .from(polls)
    .where(eq(polls.adminUrlId, adminUrlId))
    .limit(1);
  const opts = poll
    ? await db.select().from(options).where(eq(options.pollId, poll.id))
    : [];
  return { poll, opts };
}

async function pollCount(): Promise<number> {
  const rows = await db.select({ id: polls.id }).from(polls);
  return rows.length;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (point at the Docker Postgres)");
  }
});

afterAll(async () => {
  if (createdAdminIds.length) {
    await db.delete(polls).where(inArray(polls.adminUrlId, createdAdminIds));
  }
});

describe("createPoll — validation (no rows created)", () => {
  it("rejects an empty title and creates no poll", async () => {
    const before = await pollCount();
    const { state, redirectUrl } = await run(
      fd({ title: "", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    expect(redirectUrl).toBeNull();
    expect(state?.errors?.title?.[0]).toBe("Poll title is required");
    expect(await pollCount()).toBe(before);
  });

  it("rejects a whitespace-only title (trim before min length)", async () => {
    const before = await pollCount();
    const { state } = await run(
      fd({ title: "   ", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    expect(state?.errors?.title?.[0]).toBe("Poll title is required");
    expect(await pollCount()).toBe(before);
  });

  it("rejects a title over 200 characters", async () => {
    const { state } = await run(
      fd({ title: "x".repeat(201), dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    expect(state?.errors?.title?.[0]).toBe(
      "Title must be 200 characters or fewer",
    );
  });

  it("rejects a description over 2000 characters", async () => {
    const { state } = await run(
      fd({
        title: "Valid",
        description: "x".repeat(2001),
        dates: datesJson([{ date: "2026-07-12" }]),
      }),
    );
    expect(state?.errors?.description?.[0]).toBe(
      "Description must be 2,000 characters or fewer",
    );
  });

  it("rejects a location over 200 characters", async () => {
    const { state } = await run(
      fd({
        title: "Valid",
        location: "x".repeat(201),
        dates: datesJson([{ date: "2026-07-12" }]),
      }),
    );
    expect(state?.errors?.location?.[0]).toBe(
      "Location must be 200 characters or fewer",
    );
  });

  it("rejects zero candidate dates", async () => {
    const before = await pollCount();
    const { state } = await run(fd({ title: "Valid", dates: datesJson([]) }));
    expect(state?.errors?.dates?.[0]).toBe("Add at least one candidate date");
    expect(await pollCount()).toBe(before);
  });

  it("rejects a malformed date string", async () => {
    const { state } = await run(
      fd({ title: "Valid", dates: datesJson([{ date: "not-a-date" }]) }),
    );
    expect(state?.errors?.dates?.[0]).toBe("Enter a valid date");
  });
});

describe("createPoll — success path", () => {
  it("creates a poll with title only (no description/location) + one date", async () => {
    const { redirectUrl } = await run(
      fd({ title: "Title Only", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { poll, opts } = await loadCreated(adminUrlId);
    expect(poll.title).toBe("Title Only");
    expect(poll.description).toBeNull();
    expect(poll.location).toBeNull();
    expect(opts).toHaveLength(1);
    expect(opts[0].date).toBe("2026-07-12");
    expect(opts[0].startTime).toBeNull();
  });

  it("mints two independent 21-char tokens — admin not derivable from participant (P1)", async () => {
    const { redirectUrl } = await run(
      fd({ title: "Tokens", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { poll } = await loadCreated(adminUrlId);
    expect(poll.participantUrlId).toHaveLength(21);
    expect(poll.adminUrlId).toHaveLength(21);
    expect(poll.adminUrlId).not.toBe(poll.participantUrlId);
    expect(poll.adminUrlId.startsWith(poll.participantUrlId)).toBe(false);
    expect(poll.participantUrlId.startsWith(poll.adminUrlId)).toBe(false);
  });

  it("collapses duplicate (date, startTime) pairs to exactly one option", async () => {
    const { redirectUrl } = await run(
      fd({
        title: "Dedupe",
        dates: datesJson([
          { date: "2026-07-12" },
          { date: "2026-07-12" },
          { date: "2026-07-12", startTime: "14:00" },
          { date: "2026-07-12", startTime: "14:00" },
        ]),
      }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { opts } = await loadCreated(adminUrlId);
    expect(opts).toHaveLength(2);
  });

  it("supports a mix of date-only and date+time options, ordered chronologically", async () => {
    const { redirectUrl } = await run(
      fd({
        title: "Mixed",
        dates: datesJson([
          { date: "2026-07-19", startTime: "14:00" },
          { date: "2026-07-12" },
          { date: "2026-07-12", startTime: "09:30" },
        ]),
      }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { poll } = await loadCreated(adminUrlId);
    const { getOptionsForPoll } = await import("@/lib/db/queries");
    const ordered = await getOptionsForPoll(poll.id);
    expect(ordered.map((o) => [o.date, o.startTime])).toEqual([
      ["2026-07-12", null], // date-only sorts before timed on the same day
      ["2026-07-12", "09:30:00"],
      ["2026-07-19", "14:00:00"],
    ]);
    expect(ordered.map((o) => o.position)).toEqual([0, 1, 2]);
  });

  it("rapid double-submit yields two independent polls with distinct tokens (idempotency/concurrency)", async () => {
    const [a, b] = await Promise.all([
      run(fd({ title: "Race A", dates: datesJson([{ date: "2026-08-01" }]) })),
      run(fd({ title: "Race B", dates: datesJson([{ date: "2026-08-01" }]) })),
    ]);
    const idA = adminIdFromRedirect(a.redirectUrl);
    const idB = adminIdFromRedirect(b.redirectUrl);
    expect(idA).not.toBe(idB);
    const pa = await loadCreated(idA);
    const pb = await loadCreated(idB);
    expect(pa.poll.participantUrlId).not.toBe(pb.poll.participantUrlId);
    expect(pa.poll.adminUrlId).not.toBe(pb.poll.adminUrlId);
  });
});

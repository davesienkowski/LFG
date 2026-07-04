// createPoll server-action tests (test-first / RED). Runs against the live
// Docker Postgres (DATABASE_URL must point at it). Covers SPEC requirements
// 1-4, 6-7, the Edge Coverage truths (dedupe / mixed date+time / idempotency /
// concurrency / token independence), and prohibition P1 (admin token not
// derivable from the participant token).
//
// redirect() is mocked so we can assert the success destination deterministically
// without a Next request context.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
}));

// Module-level mutable cookie state driven by each test (mirrors the
// submit-response.test.ts cookie-capture pattern). The outer-variable reference
// inside the vi.mock factory is safe because the factory runs lazily on first
// import. `organizerCookieValue` seeds the "already present" cookie; every
// success path now calls cookies().set/get, so this mock is REQUIRED for the
// pre-existing success tests to keep passing.
let organizerCookieValue: string | undefined;
const organizerCookieSets: Array<Record<string, unknown>> = [];

// The best-effort creator admin-link hook resolves the base URL from request
// headers before scheduling the send. A minimal stub is enough for the
// deterministic run. cookies() is also stubbed: get() returns the current
// organizerCookieValue for "lfg_organizer", set() captures the options.
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name === "host"
        ? "localhost:3000"
        : name === "x-forwarded-proto"
          ? "http"
          : null,
  }),
  cookies: async () => ({
    get: (name: string) =>
      name === "lfg_organizer" && organizerCookieValue !== undefined
        ? { name, value: organizerCookieValue }
        : undefined,
    set: (opts: Record<string, unknown>) => {
      organizerCookieSets.push(opts);
    },
  }),
}));

// after() schedules the best-effort admin-link send. Run the callback as a
// swallowed microtask so a send failure can never surface into the test (mirrors
// the platform's fire-and-never-throw-past-after() contract, D-02/D-07).
vi.mock("next/server", () => ({
  after: (cb: () => Promise<void> | void) => {
    void Promise.resolve().then(cb).catch(() => {});
  },
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

import { createPoll } from "./create-poll";
import { sendEmail } from "@/lib/email/send";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";

const sendEmailMock = vi.mocked(sendEmail);

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

// Count only polls THIS file created (tracked via createdAdminIds). A global
// `SELECT count(*) FROM polls` is race-unsafe: other DB-backed test files run in
// parallel vitest workers and INSERT polls, so a global count can change between
// the before/after snapshots of a validation-reject test through no fault of the
// call under test. Scoping to our own admin tokens — mutated only by this file's
// sequential success tests, never by a parallel worker — keeps the "a rejected
// validation creates no poll" intent while being immune to cross-file races.
async function pollCount(): Promise<number> {
  if (createdAdminIds.length === 0) return 0;
  const rows = await db
    .select({ id: polls.id })
    .from(polls)
    .where(inArray(polls.adminUrlId, createdAdminIds));
  return rows.length;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (point at the Docker Postgres)");
  }
});

beforeEach(() => {
  sendEmailMock.mockClear();
  organizerCookieValue = undefined;
  organizerCookieSets.length = 0;
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

  it("rejects a non-empty malformed creatorEmail — field error, no poll, no send", async () => {
    const before = await pollCount();
    const { state, redirectUrl } = await run(
      fd({
        title: "Valid",
        creatorEmail: "not-an-email",
        dates: datesJson([{ date: "2026-07-12" }]),
      }),
    );
    expect(state?.errors?.creatorEmail?.[0]).toBe("Enter a valid email address");
    expect(redirectUrl).toBeNull();
    expect(await pollCount()).toBe(before);
    expect(sendEmailMock).not.toHaveBeenCalled();
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

  it("valid creatorEmail: creates the poll AND schedules one admin-link send to that address", async () => {
    const { redirectUrl } = await run(
      fd({
        title: "Email Me",
        creatorEmail: "creator@example.com",
        dates: datesJson([{ date: "2026-07-12" }]),
      }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { poll } = await loadCreated(adminUrlId);
    expect(poll.title).toBe("Email Me");
    // t7e: the creator email is now PERSISTED on the poll row so both
    // participant actions can notify the creator on each response.
    expect(poll.creatorEmail).toBe("creator@example.com");
    // Flush the after() microtask so the scheduled send has run.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const arg = sendEmailMock.mock.calls[0][0];
    expect(arg.to).toBe("creator@example.com");
    expect(arg.subject).toContain("Email Me");
    expect(arg.html).toContain(`/a/${adminUrlId}`);
  });

  it("no creatorEmail (D-02): creates the poll and NEVER sends", async () => {
    const { redirectUrl } = await run(
      fd({ title: "No Email", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    // Flush microtasks FIRST so an accidental scheduled send would have run
    // before the assertion (no false green), THEN assert nothing was sent.
    await new Promise((r) => setTimeout(r, 0));
    const { poll } = await loadCreated(adminUrlId);
    expect(poll.title).toBe("No Email");
    // t7e: no creator email supplied -> stored as NULL (D-02, never notified).
    expect(poll.creatorEmail).toBeNull();
    expect(sendEmailMock).not.toHaveBeenCalled();
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

describe("createPoll — organizer identity (LD-2 / EP-ORG-EMPTY)", () => {
  it("MINT: with no cookie, stores a fresh 21-char organizerId and sets the httpOnly lfg_organizer cookie", async () => {
    // organizerCookieValue is undefined (reset in beforeEach) => absent.
    const { redirectUrl } = await run(
      fd({ title: "Mint", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { poll } = await loadCreated(adminUrlId);

    expect(poll.organizerId).toHaveLength(21);
    const organizerSets = organizerCookieSets.filter(
      (c) => c.name === "lfg_organizer",
    );
    expect(organizerSets).toHaveLength(1);
    const set = organizerSets[0];
    expect(set.value).toBe(poll.organizerId);
    expect(set.httpOnly).toBe(true);
    expect(set.sameSite).toBe("lax");
    expect(set.path).toBe("/");
    expect(set.maxAge).toBe(60 * 60 * 24 * 365);
    // Test env is not production => secure false (works over localhost HTTP).
    expect(set.secure).toBe(false);
  });

  it("REUSE: with a present non-empty cookie, reuses its value and does NOT re-set the cookie", async () => {
    organizerCookieValue = "reuse-organizer-tok01"; // fixed 21-char token
    const { redirectUrl } = await run(
      fd({ title: "Reuse", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { poll } = await loadCreated(adminUrlId);

    expect(poll.organizerId).toBe("reuse-organizer-tok01");
    expect(
      organizerCookieSets.filter((c) => c.name === "lfg_organizer"),
    ).toHaveLength(0);
  });

  it("SHARED: two createPoll calls under one present cookie produce two polls with the SAME organizerId", async () => {
    organizerCookieValue = "shared-organizer-tok1"; // 21 chars, present
    const first = await run(
      fd({ title: "Shared A", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    const second = await run(
      fd({ title: "Shared B", dates: datesJson([{ date: "2026-07-19" }]) }),
    );
    const idA = adminIdFromRedirect(first.redirectUrl);
    const idB = adminIdFromRedirect(second.redirectUrl);
    expect(idA).not.toBe(idB);
    const pa = await loadCreated(idA);
    const pb = await loadCreated(idB);
    expect(pa.poll.organizerId).toBe("shared-organizer-tok1");
    expect(pb.poll.organizerId).toBe("shared-organizer-tok1");
    expect(pa.poll.organizerId).toBe(pb.poll.organizerId);
  });

  it("EP-ORG-EMPTY: an empty-string cookie is treated as ABSENT — mints a fresh NON-EMPTY organizerId (guards the ??-accepts-\"\" footgun)", async () => {
    organizerCookieValue = ""; // present but empty
    const { redirectUrl } = await run(
      fd({ title: "Empty Cookie", dates: datesJson([{ date: "2026-07-12" }]) }),
    );
    const adminUrlId = adminIdFromRedirect(redirectUrl);
    const { poll } = await loadCreated(adminUrlId);

    expect(poll.organizerId).not.toBe("");
    expect(poll.organizerId).toHaveLength(21);
    const organizerSets = organizerCookieSets.filter(
      (c) => c.name === "lfg_organizer",
    );
    expect(organizerSets).toHaveLength(1);
    expect(organizerSets[0].value).toBe(poll.organizerId);
  });
});

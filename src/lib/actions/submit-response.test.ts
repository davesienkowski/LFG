// submitResponse server-action tests (test-first / RED). Runs against the live
// Docker Postgres (DATABASE_URL must point at it). Covers the INSERT-only submit
// slice: participant + one vote per option, gap-fill of untouched options to
// 'no', server-side status guard, editToken independence (extends P1),
// duplicate-name handling, validation (no rows on failure), unknown-token 404,
// and foreign-optionId rejection (server iterates the authoritative option list).
//
// next/navigation (redirect + notFound) and next/headers (cookies) are mocked so
// the action runs deterministically without a Next request context.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307;`;
    throw err;
  },
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND") as Error & { digest: string };
    err.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
    throw err;
  },
}));

// Capture cookies().set() calls without a request context.
const cookieSets: Array<Record<string, unknown>> = [];
vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (opts: Record<string, unknown>) => {
      cookieSets.push(opts);
    },
  }),
  // The confirmation hook resolves the base URL from request headers before
  // scheduling the send. A minimal stub is enough for the deterministic run.
  headers: async () => ({
    get: (name: string) =>
      name === "host" ? "localhost:3000" : name === "x-forwarded-proto" ? "http" : null,
  }),
}));

// after() schedules the best-effort confirmation send. Run the callback as a
// swallowed microtask so a send failure can never surface into the test (mirrors
// the platform's fire-and-never-throw-past-after() contract, D-07).
vi.mock("next/server", () => ({
  after: (cb: () => Promise<void> | void) => {
    void Promise.resolve().then(cb).catch(() => {});
  },
}));

import { submitResponse } from "./submit-response";
import { db } from "@/lib/db";
import {
  polls,
  options,
  participants,
  votes,
} from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

function fd(fields: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) f.set(k, v);
  }
  return f;
}

function votesJson(rows: Array<{ optionId: string; state: string }>): string {
  return JSON.stringify(rows);
}

async function seedPoll(opts?: {
  status?: string;
  dates?: Array<{ date: string; startTime?: string | null }>;
}): Promise<{
  pollId: string;
  participantUrlId: string;
  adminUrlId: string;
  optionIds: string[];
}> {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Vote Poll",
      participantUrlId,
      adminUrlId,
      status: opts?.status ?? "open",
    })
    .returning({ id: polls.id });
  const dates = opts?.dates ?? [
    { date: "2026-07-12", startTime: null },
    { date: "2026-07-19", startTime: "14:00" },
    { date: "2026-07-20", startTime: null },
  ];
  const inserted = await db
    .insert(options)
    .values(
      dates.map((d, i) => ({
        pollId: poll.id,
        date: d.date,
        startTime: d.startTime ?? null,
        position: i,
      })),
    )
    .returning({ id: options.id });
  createdAdminIds.push(adminUrlId);
  return {
    pollId: poll.id,
    participantUrlId,
    adminUrlId,
    optionIds: inserted.map((r) => r.id),
  };
}

async function run(formData: FormData): Promise<{
  state: { errors?: Record<string, string[]> } | null;
  redirectUrl: string | null;
  notFound: boolean;
}> {
  try {
    const state = await submitResponse(null, formData);
    return { state, redirectUrl: null, notFound: false };
  } catch (e) {
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      const match = /^NEXT_REDIRECT;[^;]*;([^;]*);/.exec(digest);
      return { state: null, redirectUrl: match ? match[1] : null, notFound: false };
    }
    if ((e as Error)?.message === "NEXT_NOT_FOUND") {
      return { state: null, redirectUrl: null, notFound: true };
    }
    throw e;
  }
}

async function participantsFor(pollId: string) {
  return db.select().from(participants).where(eq(participants.pollId, pollId));
}

async function votesFor(participantId: string) {
  return db.select().from(votes).where(eq(votes.participantId, participantId));
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

describe("submitResponse — success path", () => {
  it("persists one participant and exactly one vote per option; untouched => 'no'", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const { redirectUrl } = await run(
      fd({
        participantUrlId,
        name: "Alex",
        votes: votesJson([
          { optionId: optionIds[0], state: "yes" },
          { optionId: optionIds[1], state: "ifneedbe" },
          // optionIds[2] intentionally untouched -> should persist as 'no'
        ]),
      }),
    );
    expect(redirectUrl).toBe(`/p/${participantUrlId}/thanks`);

    const ps = await participantsFor(pollId);
    expect(ps).toHaveLength(1);
    const vs = await votesFor(ps[0].id);
    expect(vs).toHaveLength(optionIds.length);
    const byOption = Object.fromEntries(vs.map((v) => [v.optionId, v.state]));
    expect(byOption[optionIds[0]]).toBe("yes");
    expect(byOption[optionIds[1]]).toBe("ifneedbe");
    expect(byOption[optionIds[2]]).toBe("no");
    // No duplicate (participant, option) pair.
    expect(new Set(vs.map((v) => v.optionId)).size).toBe(vs.length);
  });

  it("submits a single-option poll with exactly one vote row", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll({
      dates: [{ date: "2026-08-01", startTime: null }],
    });
    const { redirectUrl } = await run(
      fd({
        participantUrlId,
        name: "Solo",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    expect(redirectUrl).toBe(`/p/${participantUrlId}/thanks`);
    const ps = await participantsFor(pollId);
    const vs = await votesFor(ps[0].id);
    expect(vs).toHaveLength(1);
    expect(vs[0].state).toBe("yes");
  });

  it("accepts a name-only submit (no email) and stores email null", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    await run(
      fd({
        participantUrlId,
        name: "NoEmail",
        votes: votesJson([{ optionId: optionIds[0], state: "no" }]),
      }),
    );
    const ps = await participantsFor(pollId);
    expect(ps).toHaveLength(1);
    expect(ps[0].email).toBeNull();
    expect(ps[0].name).toBe("NoEmail");
  });

  it("mints a 21-char editToken not derived from participantUrlId (extends P1)", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    await run(
      fd({
        participantUrlId,
        name: "TokenCheck",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    const [p] = await participantsFor(pollId);
    expect(p.editToken).toHaveLength(21);
    expect(p.editToken).not.toBe(participantUrlId);
    expect(p.editToken.startsWith(participantUrlId)).toBe(false);
    expect(participantUrlId.startsWith(p.editToken)).toBe(false);
  });

  it("allows duplicate display names — two distinct participants, distinct editTokens", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    await run(
      fd({
        participantUrlId,
        name: "Sam",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    await run(
      fd({
        participantUrlId,
        name: "Sam",
        votes: votesJson([{ optionId: optionIds[0], state: "no" }]),
      }),
    );
    const ps = await participantsFor(pollId);
    expect(ps).toHaveLength(2);
    expect(ps[0].id).not.toBe(ps[1].id);
    expect(ps[0].editToken).not.toBe(ps[1].editToken);
  });

  it("ignores votes for an optionId not belonging to the poll (server iterates authoritative options)", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll({
      dates: [{ date: "2026-09-01", startTime: null }],
    });
    const foreign = await seedPoll({
      dates: [{ date: "2026-09-02", startTime: null }],
    });
    const { redirectUrl } = await run(
      fd({
        participantUrlId,
        name: "Foreign",
        votes: votesJson([
          { optionId: optionIds[0], state: "yes" },
          { optionId: foreign.optionIds[0], state: "yes" }, // must be ignored
        ]),
      }),
    );
    expect(redirectUrl).toBe(`/p/${participantUrlId}/thanks`);
    const [p] = await participantsFor(pollId);
    const vs = await votesFor(p.id);
    expect(vs).toHaveLength(1);
    expect(vs[0].optionId).toBe(optionIds[0]);
    // No vote row references the foreign option.
    expect(vs.some((v) => v.optionId === foreign.optionIds[0])).toBe(false);
  });

  it("sets an httpOnly edit cookie keyed on participantUrlId before redirect", async () => {
    cookieSets.length = 0;
    const { participantUrlId, optionIds } = await seedPoll();
    await run(
      fd({
        participantUrlId,
        name: "Cookie",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    const set = cookieSets.find((c) => c.name === `lfg_edit_${participantUrlId}`);
    expect(set).toBeTruthy();
    expect(set?.httpOnly).toBe(true);
    // Secure is env-conditional: true under HTTPS in production, false in local
    // HTTP dev/test so the same-device cookie still works over localhost.
    expect(set?.secure).toBe(process.env.NODE_ENV === "production");
    expect(set?.path).toBe(`/p/${participantUrlId}`);
  });
});

describe("submitResponse — validation (no rows created)", () => {
  it("rejects a blank/whitespace-only name and creates zero rows", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const { state } = await run(
      fd({
        participantUrlId,
        name: "   ",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    expect(state?.errors?.name?.[0]).toBe("Your name is required");
    expect(await participantsFor(pollId)).toHaveLength(0);
  });

  it("rejects a name over 100 characters", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const { state } = await run(
      fd({
        participantUrlId,
        name: "x".repeat(101),
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    expect(state?.errors?.name?.[0]).toBe(
      "Name must be 100 characters or fewer",
    );
    expect(await participantsFor(pollId)).toHaveLength(0);
  });

  it("rejects an invalid email format", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const { state } = await run(
      fd({
        participantUrlId,
        name: "Valid",
        email: "not-an-email",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    expect(state?.errors?.email?.[0]).toBe("Enter a valid email address");
    expect(await participantsFor(pollId)).toHaveLength(0);
  });

  it("rejects an email over 200 characters", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const longEmail = "a".repeat(195) + "@x.com"; // 201 chars, valid-ish format
    const { state } = await run(
      fd({
        participantUrlId,
        name: "Valid",
        email: longEmail,
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    expect(state?.errors?.email?.[0]).toBe(
      "Email must be 200 characters or fewer",
    );
    expect(await participantsFor(pollId)).toHaveLength(0);
  });
});

describe("submitResponse — status guard & unknown token", () => {
  it("rejects a write when poll.status != 'open' and creates zero rows", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll({
      status: "closed",
    });
    const { state, redirectUrl } = await run(
      fd({
        participantUrlId,
        name: "Late",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    expect(redirectUrl).toBeNull();
    expect(state?.errors?._form?.[0]).toBe("Voting is closed for this poll.");
    expect(await participantsFor(pollId)).toHaveLength(0);
  });

  it("triggers notFound() for an unknown participant token and creates no rows", async () => {
    const { notFound } = await run(
      fd({
        participantUrlId: "nonexistent-token-000",
        name: "Ghost",
        votes: votesJson([]),
      }),
    );
    // notFound() throws before the participant INSERT is ever reached, so no row
    // can be created for an unknown token. (A global participants-count
    // before/after check here races with the other DB-backed test files running
    // in parallel against the shared Postgres — the notFound() assertion alone is
    // the non-racy proof that the insert path is unreachable.)
    expect(notFound).toBe(true);
  });
});

describe("submitResponse — best-effort confirmation hook (VOTE-04, D-07)", () => {
  it("still commits participant/votes and reaches redirect with an email but no provider (no throw)", async () => {
    // EMAIL_PROVIDER is unset in this suite → sendEmail() returns a non-throwing
    // { ok:false, error:'Email not configured' } no-op; the vote MUST still land.
    expect(process.env.EMAIL_PROVIDER).toBeUndefined();
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const { redirectUrl, state } = await run(
      fd({
        participantUrlId,
        name: "Mailer",
        email: "mailer@example.com",
        votes: votesJson([{ optionId: optionIds[0], state: "yes" }]),
      }),
    );
    // Flush the scheduled after() microtask; it must not throw.
    await Promise.resolve();
    await Promise.resolve();

    expect(state).toBeNull();
    expect(redirectUrl).toBe(`/p/${participantUrlId}/thanks`);
    const ps = await participantsFor(pollId);
    expect(ps).toHaveLength(1);
    expect(ps[0].email).toBe("mailer@example.com");
    const vs = await votesFor(ps[0].id);
    expect(vs).toHaveLength(optionIds.length);
  });
});

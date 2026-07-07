// sendInvites server-action tests (DB-backed — needs DATABASE_URL pointed at the
// Docker Postgres). next/navigation (notFound) and next/headers (headers) are
// mocked so the action runs outside a Next request context; @/lib/email/send is
// mocked so no real transport is touched and per-address outcomes are scripted.
//
// Proves: V4 unknown-token -> notFound(); one result row per unique address
// (including a malformed one -> failed); a failure never suppresses a success;
// sendEmail called once per valid address with a single string `to` (never CC);
// case/whitespace-insensitive dedupe -> one send + one row; empty/whitespace
// input -> _form error + ZERO sends; results in submission order.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { inArray, and, eq, sql } from "drizzle-orm";

vi.mock("next/navigation", () => ({
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND") as Error & { digest: string };
    err.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
    throw err;
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "test.local"]]),
}));

// Script the transport per recipient by address. Default: succeed.
const sendEmailMock = vi.fn();
vi.mock("@/lib/email/send", () => ({
  sendEmail: (args: { to: string; subject: string; html: string }) =>
    sendEmailMock(args),
}));

import { sendInvites } from "./send-invites";
import { db } from "@/lib/db";
import { polls, options, invitations } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];
const createdPollIds: string[] = [];

// Count invitations rows for a poll, optionally matching a specific address
// case-insensitively (mirrors the functional unique index).
async function invitationCount(
  pollId: string,
  email?: string,
): Promise<number> {
  const where = email
    ? and(
        eq(invitations.pollId, pollId),
        sql`lower(${invitations.email}) = lower(${email})`,
      )
    : eq(invitations.pollId, pollId);
  const rows = await db
    .select({ email: invitations.email })
    .from(invitations)
    .where(where);
  return rows.length;
}

function fd(fields: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) f.set(k, v);
  }
  return f;
}

async function seedPoll(title = "Invite Poll"): Promise<{
  adminUrlId: string;
  participantUrlId: string;
  pollId: string;
}> {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({ title, participantUrlId, adminUrlId })
    .returning({ id: polls.id });
  await db
    .insert(options)
    .values([{ pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 }]);
  createdAdminIds.push(adminUrlId);
  createdPollIds.push(poll.id);
  return { adminUrlId, participantUrlId, pollId: poll.id };
}

async function run(formData: FormData): Promise<{
  state: Awaited<ReturnType<typeof sendInvites>>;
  notFound: boolean;
}> {
  try {
    const state = await sendInvites(null, formData);
    return { state, notFound: false };
  } catch (e) {
    if ((e as Error)?.message === "NEXT_NOT_FOUND") {
      return { state: null, notFound: true };
    }
    throw e;
  }
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (point at the Docker Postgres)");
  }
});

afterAll(async () => {
  // Explicitly clear invitations first (poll delete cascades too, but keep the
  // cleanup explicit per plan). Then remove the seeded polls.
  if (createdPollIds.length) {
    await db
      .delete(invitations)
      .where(inArray(invitations.pollId, createdPollIds));
  }
  if (createdAdminIds.length) {
    await db.delete(polls).where(inArray(polls.adminUrlId, createdAdminIds));
  }
});

beforeEach(() => {
  sendEmailMock.mockReset();
  // Default: every send succeeds unless a test overrides.
  sendEmailMock.mockResolvedValue({ ok: true });
});

describe("sendInvites — access control (V4)", () => {
  it("notFound()s for an unknown adminUrlId and never sends", async () => {
    const { notFound } = await run(
      fd({ adminUrlId: "does-not-exist-000", addresses: "a@example.com" }),
    );
    expect(notFound).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("sendInvites — batch behavior (D-05)", () => {
  it("returns one row per unique address; a failure never suppresses a success", async () => {
    const { adminUrlId } = await seedPoll();
    sendEmailMock.mockImplementation(({ to }: { to: string }) =>
      to === "bad@example.com"
        ? Promise.resolve({ ok: false, error: "smtp down" })
        : Promise.resolve({ ok: true }),
    );

    const { state } = await run(
      fd({
        adminUrlId,
        addresses: "good@example.com, bad@example.com",
      }),
    );
    const results = state?.results ?? [];
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ email: "good@example.com", status: "sent" });
    expect(results[1]).toEqual({ email: "bad@example.com", status: "failed" });
  });

  it("maps a rate-limited send to the rate_limited status", async () => {
    const { adminUrlId } = await seedPoll();
    sendEmailMock.mockResolvedValue({
      ok: false,
      error: "450 rate limit",
      rateLimited: true,
    });
    const { state } = await run(
      fd({ adminUrlId, addresses: "cap@example.com" }),
    );
    expect(state?.results?.[0].status).toBe("rate_limited");
  });

  it("renders a malformed address as its own failed row without calling sendEmail for it", async () => {
    const { adminUrlId } = await seedPoll();
    const { state } = await run(
      fd({ adminUrlId, addresses: "valid@example.com, not-an-email" }),
    );
    const results = state?.results ?? [];
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ email: "valid@example.com", status: "sent" });
    expect(results[1].email).toBe("not-an-email");
    expect(results[1].status).toBe("failed");
    expect(results[1].message).toBe("Not a valid email address");
    // sendEmail called ONCE (only the valid address), never for the malformed one.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("valid@example.com");
  });
});

describe("sendInvites — recipient handling (T-04-03)", () => {
  it("calls sendEmail once per valid address with a single string `to` (never CC)", async () => {
    const { adminUrlId } = await seedPoll();
    await run(
      fd({ adminUrlId, addresses: "a@example.com\nb@example.com" }),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    for (const call of sendEmailMock.mock.calls) {
      const arg = call[0];
      expect(typeof arg.to).toBe("string");
      expect(Array.isArray(arg.to)).toBe(false);
      expect(arg.cc).toBeUndefined();
      expect(arg.bcc).toBeUndefined();
      expect(arg.subject).toBe("You're invited: Invite Poll");
    }
  });
});

describe("sendInvites — dedupe & empty input (MAIL-01 edges)", () => {
  it("collapses case/whitespace-differing duplicates to one send + one row", async () => {
    const { adminUrlId } = await seedPoll();
    const { state } = await run(
      fd({
        adminUrlId,
        addresses: "Alex@Example.com,  alex@example.com , ALEX@EXAMPLE.COM",
      }),
    );
    const results = state?.results ?? [];
    expect(results).toHaveLength(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    // First-seen casing is preserved for display.
    expect(results[0].email).toBe("Alex@Example.com");
  });

  it("returns a _form error and sends nothing for whitespace-only input", async () => {
    const { adminUrlId } = await seedPoll();
    const { state } = await run(
      fd({ adminUrlId, addresses: "   \n  , ,  " }),
    );
    expect(state?.errors?._form?.[0]).toBe(
      "Enter at least one email address.",
    );
    expect(state?.results).toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns a _form error when the addresses field is entirely absent", async () => {
    const { adminUrlId } = await seedPoll();
    const { state } = await run(fd({ adminUrlId }));
    expect(state?.errors?._form?.[0]).toBe(
      "Enter at least one email address.",
    );
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("sendInvites — invitation recording (RESP-03)", () => {
  it("(a) records exactly one invitations row for a successful send", async () => {
    const { adminUrlId, pollId } = await seedPoll();
    // Default mock: ok.
    const { state } = await run(
      fd({ adminUrlId, addresses: "recorded@example.com" }),
    );
    expect(state?.results?.[0]).toEqual({
      email: "recorded@example.com",
      status: "sent",
    });
    expect(await invitationCount(pollId, "recorded@example.com")).toBe(1);
    expect(await invitationCount(pollId)).toBe(1);
  });

  it("(b) records NO row for a rate_limited send", async () => {
    const { adminUrlId, pollId } = await seedPoll();
    sendEmailMock.mockResolvedValue({
      ok: false,
      error: "450 rate limit",
      rateLimited: true,
    });
    const { state } = await run(
      fd({ adminUrlId, addresses: "cap@example.com" }),
    );
    expect(state?.results?.[0].status).toBe("rate_limited");
    expect(await invitationCount(pollId)).toBe(0);
  });

  it("(b) records NO row for a failed send", async () => {
    const { adminUrlId, pollId } = await seedPoll();
    sendEmailMock.mockResolvedValue({ ok: false, error: "smtp down" });
    const { state } = await run(
      fd({ adminUrlId, addresses: "boom@example.com" }),
    );
    expect(state?.results?.[0].status).toBe("failed");
    expect(await invitationCount(pollId)).toBe(0);
  });

  it("(c) a re-invite of the same address (any casing) stays exactly one row", async () => {
    const { adminUrlId, pollId } = await seedPoll();
    // First send.
    await run(fd({ adminUrlId, addresses: "Dup@Example.com" }));
    // Second send, different casing — onConflictDoNothing must no-op.
    const { state } = await run(
      fd({ adminUrlId, addresses: "dup@EXAMPLE.com" }),
    );
    // The UI still reports a successful send both times.
    expect(state?.results?.[0].status).toBe("sent");
    expect(await invitationCount(pollId, "dup@example.com")).toBe(1);
    expect(await invitationCount(pollId)).toBe(1);
  });

  it("(d) recording does not perturb the SendInviteResult contract for a mixed batch", async () => {
    const { adminUrlId, pollId } = await seedPoll();
    sendEmailMock.mockImplementation(({ to }: { to: string }) => {
      if (to === "ok@example.com") return Promise.resolve({ ok: true });
      if (to === "cap@example.com")
        return Promise.resolve({
          ok: false,
          error: "450",
          rateLimited: true,
        });
      return Promise.resolve({ ok: false, error: "smtp down" });
    });
    const { state } = await run(
      fd({
        adminUrlId,
        addresses:
          "ok@example.com, cap@example.com, fail@example.com, not-an-email",
      }),
    );
    // Byte-for-byte the same result rows the pre-change action returned.
    expect(state?.results).toEqual([
      { email: "ok@example.com", status: "sent" },
      { email: "cap@example.com", status: "rate_limited" },
      { email: "fail@example.com", status: "failed" },
      {
        email: "not-an-email",
        status: "failed",
        message: "Not a valid email address",
      },
    ]);
    // Only the ok recipient was recorded.
    expect(await invitationCount(pollId)).toBe(1);
    expect(await invitationCount(pollId, "ok@example.com")).toBe(1);
  });
});

describe("sendInvites — ordering (MAIL-01/ordering)", () => {
  it("returns result rows in submission order", async () => {
    const { adminUrlId } = await seedPoll();
    const { state } = await run(
      fd({ adminUrlId, addresses: "first@example.com, second@example.com, third@example.com" }),
    );
    expect((state?.results ?? []).map((r) => r.email)).toEqual([
      "first@example.com",
      "second@example.com",
      "third@example.com",
    ]);
  });
});

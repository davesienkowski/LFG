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
import { inArray } from "drizzle-orm";

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
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

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
  return { adminUrlId, participantUrlId };
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

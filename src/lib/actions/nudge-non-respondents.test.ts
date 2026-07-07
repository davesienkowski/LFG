// nudgeNonRespondents server-action tests (DB-backed — needs DATABASE_URL
// pointed at the Docker Postgres). next/navigation (notFound) and next/headers
// (headers) are mocked so the action runs outside a Next request context;
// @/lib/email/send is mocked so no real transport is touched and per-address
// outcomes are scripted.
//
// Proves the three load-bearing Prohibition-Probe guards server-side:
//  (a) V4 unknown-token -> notFound() + ZERO sends;
//  (b) a CLOSED poll -> _form error + ZERO sends even with a stray recipient field;
//  (c) only CURRENT non-respondents are emailed (server re-query, not a client list);
//  (d) a participant who responds is excluded on the next nudge (re-query is live);
//  (e) zero non-respondents -> zero sends;
//  (f) a scripted rate_limited/failed never suppresses the others; rows are ordered;
//  (g) a stray addresses/recipient field is IGNORED (only adminUrlId is read);
//  (h) nudging writes NO new invitations row (count unchanged before/after).
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { inArray, eq } from "drizzle-orm";

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

import { nudgeNonRespondents } from "./nudge-non-respondents";
import { db } from "@/lib/db";
import { polls, participants, invitations } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdPollIds: string[] = [];

async function invitationCount(pollId: string): Promise<number> {
  const rows = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(eq(invitations.pollId, pollId));
  return rows.length;
}

function fd(fields: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) f.set(k, v);
  }
  return f;
}

// Seed a poll with a set of invitations and (optionally) participants. Each
// participant's email is what the responded-match correlates on.
async function seedPoll(opts?: {
  status?: string;
  invited?: string[];
  participantEmails?: (string | null)[];
}): Promise<{ adminUrlId: string; pollId: string }> {
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Nudge Poll",
      participantUrlId: generateToken(),
      adminUrlId,
      status: opts?.status ?? "open",
    })
    .returning({ id: polls.id });
  createdPollIds.push(poll.id);

  if (opts?.invited?.length) {
    // Sequential inserts (separate statements => strictly increasing invited_at)
    // so the tracking read's `order by invited_at asc` matches this insert order
    // deterministically — the nudge result rows come back in this same order.
    for (const email of opts.invited) {
      await db.insert(invitations).values({ pollId: poll.id, email });
    }
  }
  if (opts?.participantEmails?.length) {
    for (const email of opts.participantEmails) {
      await db.insert(participants).values({
        pollId: poll.id,
        name: "Voter",
        email,
        editToken: generateToken(),
      });
    }
  }
  return { adminUrlId, pollId: poll.id };
}

// Add a participant (a "response") to an existing poll after the fact.
async function addResponder(pollId: string, email: string) {
  await db.insert(participants).values({
    pollId,
    name: "Late Voter",
    email,
    editToken: generateToken(),
  });
}

async function run(formData: FormData): Promise<{
  state: Awaited<ReturnType<typeof nudgeNonRespondents>>;
  notFound: boolean;
}> {
  try {
    const state = await nudgeNonRespondents(null, formData);
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
  if (createdPollIds.length) {
    // ON DELETE CASCADE removes invitations/participants with the poll.
    await db.delete(polls).where(inArray(polls.id, createdPollIds));
  }
});

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true });
});

describe("nudgeNonRespondents — access control (V4 / Probe #1)", () => {
  it("(a) notFound()s for an unknown adminUrlId and never sends", async () => {
    const { notFound } = await run(
      fd({ adminUrlId: "does-not-exist-000" }),
    );
    expect(notFound).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("nudgeNonRespondents — closed-poll re-check (Probe #3 / T-07-03)", () => {
  it("(b) refuses a closed poll with a _form error and ZERO sends, even with a stray recipient field", async () => {
    const { adminUrlId } = await seedPoll({
      status: "closed",
      invited: ["missing@example.com"],
    });
    const { state } = await run(
      fd({
        adminUrlId,
        // A tampered form carrying a recipient list must NOT cause a send.
        addresses: "attacker@example.com",
      }),
    );
    expect(state?.errors?._form?.[0]).toBe(
      "This poll is closed — nudging is disabled.",
    );
    expect(state?.results).toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("nudgeNonRespondents — server-side recompute (Probe #1)", () => {
  it("(c) emails ONLY the current non-respondents (responded invitations are not emailed)", async () => {
    // Invited: alice (responded), bob (no match), carol (no match).
    const { adminUrlId } = await seedPoll({
      invited: [
        "alice@example.com",
        "bob@example.com",
        "carol@example.com",
      ],
      participantEmails: ["Alice@Example.com"], // case-insensitive match
    });

    const { state } = await run(fd({ adminUrlId }));
    const emailed = sendEmailMock.mock.calls.map((c) => c[0].to);
    expect(emailed.sort()).toEqual([
      "bob@example.com",
      "carol@example.com",
    ]);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    // No responded address was emailed.
    expect(emailed).not.toContain("alice@example.com");
    // Result rows mirror sendInvites (sent).
    expect((state?.results ?? []).every((r) => r.status === "sent")).toBe(true);
    expect(state?.results).toHaveLength(2);
  });

  it("(d) a participant who responds is excluded on the NEXT nudge (re-query is live)", async () => {
    const { adminUrlId, pollId } = await seedPoll({
      invited: ["dave@example.com", "erin@example.com"],
    });

    // First nudge: both are non-respondents.
    await run(fd({ adminUrlId }));
    expect(sendEmailMock.mock.calls.map((c) => c[0].to).sort()).toEqual([
      "dave@example.com",
      "erin@example.com",
    ]);

    // Dave responds, then nudge again — only Erin should be emailed.
    await addResponder(pollId, "dave@example.com");
    sendEmailMock.mockClear();
    await run(fd({ adminUrlId }));
    expect(sendEmailMock.mock.calls.map((c) => c[0].to)).toEqual([
      "erin@example.com",
    ]);
  });

  it("(g) IGNORES a stray addresses/recipient field — only adminUrlId is read", async () => {
    const { adminUrlId } = await seedPoll({
      invited: ["real@example.com"],
    });
    await run(
      fd({
        adminUrlId,
        addresses: "injected@example.com, another@example.com",
        recipients: "third@example.com",
      }),
    );
    const emailed = sendEmailMock.mock.calls.map((c) => c[0].to);
    // ONLY the DB-derived non-respondent is emailed; the injected addresses are
    // never sent to.
    expect(emailed).toEqual(["real@example.com"]);
    expect(emailed).not.toContain("injected@example.com");
    expect(emailed).not.toContain("another@example.com");
    expect(emailed).not.toContain("third@example.com");
  });
});

describe("nudgeNonRespondents — zero non-respondents", () => {
  it("(e) sends nothing when everyone has responded", async () => {
    const { adminUrlId } = await seedPoll({
      invited: ["only@example.com"],
      participantEmails: ["only@example.com"],
    });
    const { state } = await run(fd({ adminUrlId }));
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state?.results).toEqual([]);
  });

  it("(e) sends nothing when there are no invitations at all", async () => {
    const { adminUrlId } = await seedPoll({});
    const { state } = await run(fd({ adminUrlId }));
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state?.results).toEqual([]);
  });
});

describe("nudgeNonRespondents — best-effort batch (D-05)", () => {
  it("(f) a rate_limited/failed send never suppresses the others; rows are SendInviteResult-shaped in order", async () => {
    const { adminUrlId } = await seedPoll({
      invited: [
        "ok@example.com",
        "cap@example.com",
        "fail@example.com",
      ],
    });
    sendEmailMock.mockImplementation(({ to }: { to: string }) => {
      if (to === "ok@example.com") return Promise.resolve({ ok: true });
      if (to === "cap@example.com")
        return Promise.resolve({ ok: false, error: "450", rateLimited: true });
      return Promise.resolve({ ok: false, error: "smtp down" });
    });

    const { state } = await run(fd({ adminUrlId }));
    // Order follows invited_at (insert order): ok, cap, fail.
    expect(state?.results).toEqual([
      { email: "ok@example.com", status: "sent" },
      { email: "cap@example.com", status: "rate_limited" },
      { email: "fail@example.com", status: "failed" },
    ]);
  });
});

describe("nudgeNonRespondents — writes no invitations (edge-probe must-NOT)", () => {
  it("(h) the invitations row count is UNCHANGED before and after a nudge", async () => {
    const { adminUrlId, pollId } = await seedPoll({
      invited: ["x@example.com", "y@example.com"],
    });
    const before = await invitationCount(pollId);
    await run(fd({ adminUrlId }));
    const after = await invitationCount(pollId);
    expect(after).toBe(before);
    expect(after).toBe(2);
  });
});

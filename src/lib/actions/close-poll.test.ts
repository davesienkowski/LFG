// closePoll server-action tests (DB-backed — needs DATABASE_URL pointed at the
// Docker Postgres). next/navigation (notFound + redirect) and next/headers are
// mocked so the action runs outside a Next request context; @/lib/email/send is
// mocked so no real transport is touched; next/server's after() is mocked to
// COLLECT the deferred callback so a test can drain it and assert on the sends
// (after() normally runs post-response, outside the test's reach).
//
// Proves: (a) a valid close writes status='closed' + winning_option_id in ONE
// UPDATE; (b) an already-closed poll returns the _form error and does not
// re-write; (c) a winningOptionId from a DIFFERENT poll is rejected with the
// _form error and no write (T-04-09); (d) finalization sends are deduped by
// address and skip no-email voters (FNL-03); (e) an unknown adminUrlId ->
// notFound() (V4/T-04-07); (f) a zero-emailed-voter poll still closes with zero
// sends; (g) a send failure never reverts the close nor aborts the batch (D-09).
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("next/navigation", () => ({
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND") as Error & { digest: string };
    err.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
    throw err;
  },
  redirect: (url: string) => {
    const err = new Error("NEXT_REDIRECT") as Error & { digest: string };
    err.digest = `NEXT_REDIRECT;replace;${url};307`;
    throw err;
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "test.local"]]),
}));

// Collect after() callbacks so a test can drain them explicitly (after() runs
// post-response in real Next; here we run it on demand to assert on sends).
const afterCallbacks: Array<() => Promise<void> | void> = [];
vi.mock("next/server", () => ({
  after: (cb: () => Promise<void> | void) => {
    afterCallbacks.push(cb);
  },
}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/email/send", () => ({
  sendEmail: (args: { to: string; subject: string; html: string }) =>
    sendEmailMock(args),
}));

import { closePoll } from "./close-poll";
import { db } from "@/lib/db";
import { polls, options, participants } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

function fd(fields: Record<string, string | undefined>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) f.set(k, v);
  }
  return f;
}

async function seedPoll(opts?: {
  status?: string;
  voters?: { name: string; email: string | null }[];
}): Promise<{
  pollId: string;
  adminUrlId: string;
  participantUrlId: string;
  optionIds: string[];
}> {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Close Poll",
      location: "The Tavern",
      participantUrlId,
      adminUrlId,
      status: opts?.status ?? "open",
    })
    .returning({ id: polls.id });
  const insertedOptions = await db
    .insert(options)
    .values([
      { pollId: poll.id, date: "2026-09-01", startTime: null, position: 0 },
      { pollId: poll.id, date: "2026-09-02", startTime: "18:00", position: 1 },
    ])
    .returning({ id: options.id, position: options.position });
  const optionIds = [...insertedOptions]
    .sort((a, b) => a.position - b.position)
    .map((o) => o.id);

  for (const v of opts?.voters ?? []) {
    await db.insert(participants).values({
      pollId: poll.id,
      name: v.name,
      email: v.email,
      editToken: generateToken(),
    });
  }

  createdAdminIds.push(adminUrlId);
  return { pollId: poll.id, adminUrlId, participantUrlId, optionIds };
}

async function run(formData: FormData): Promise<{
  state: Awaited<ReturnType<typeof closePoll>>;
  notFound: boolean;
  redirected: boolean;
}> {
  try {
    const state = await closePoll(null, formData);
    return { state, notFound: false, redirected: false };
  } catch (e) {
    const msg = (e as Error)?.message;
    if (msg === "NEXT_NOT_FOUND") {
      return { state: null, notFound: true, redirected: false };
    }
    if (msg === "NEXT_REDIRECT") {
      return { state: null, notFound: false, redirected: true };
    }
    throw e;
  }
}

// Execute (and clear) every collected after() callback, awaiting each.
async function drainAfter(): Promise<void> {
  const callbacks = afterCallbacks.splice(0, afterCallbacks.length);
  for (const cb of callbacks) await cb();
}

async function pollRow(pollId: string) {
  const [row] = await db
    .select()
    .from(polls)
    .where(eq(polls.id, pollId))
    .limit(1);
  return row;
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
  afterCallbacks.length = 0;
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true });
});

describe("closePoll — valid finalize (FNL-02/FNL-03)", () => {
  it("writes status='closed' + winning_option_id and dedupes/ skips sends by address", async () => {
    const { adminUrlId, pollId, optionIds } = await seedPoll({
      voters: [
        { name: "Alice", email: "shared@example.com" },
        { name: "Bob", email: "SHARED@example.com " }, // dup by normalization
        { name: "Carol", email: null }, // no email -> skipped
        { name: "Dave", email: "solo@example.com" },
      ],
    });

    const { redirected } = await run(
      fd({ adminUrlId, winningOptionId: optionIds[1] }),
    );
    expect(redirected).toBe(true);

    // (a) the DB row reflects both fields after one UPDATE.
    const row = await pollRow(pollId);
    expect(row.status).toBe("closed");
    expect(row.winningOptionId).toBe(optionIds[1]);

    // (d) finalization sends: deduped shared@ (once) + solo@ = 2; Carol skipped.
    await drainAfter();
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const tos = sendEmailMock.mock.calls.map((c) =>
      c[0].to.trim().toLowerCase(),
    );
    expect(new Set(tos)).toEqual(
      new Set(["shared@example.com", "solo@example.com"]),
    );
    // Subject is the fixed booked-for template + the chosen date.
    expect(sendEmailMock.mock.calls[0][0].subject).toContain("is booked for");

    // The finalization email carries the Google Calendar link and the event.ics
    // attachment (04-k1u). winningOptionId is the timed option[1].
    const sent = sendEmailMock.mock.calls[0][0];
    expect(sent.html).toContain("calendar.google.com");
    expect(Array.isArray(sent.attachments)).toBe(true);
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0].filename).toBe("event.ics");
  });
});

describe("closePoll — guards", () => {
  it("rejects an already-closed poll with a _form error and no re-write", async () => {
    const { adminUrlId, pollId, optionIds } = await seedPoll({
      status: "closed",
      voters: [{ name: "Alice", email: "a@example.com" }],
    });
    const { state, redirected } = await run(
      fd({ adminUrlId, winningOptionId: optionIds[0] }),
    );
    expect(redirected).toBe(false);
    expect(state?.errors?._form?.[0]).toBe("This poll is already closed.");
    expect(sendEmailMock).not.toHaveBeenCalled();

    // winning_option_id was never written (stayed null on the pre-closed poll).
    const row = await pollRow(pollId);
    expect(row.winningOptionId).toBeNull();
  });

  it("rejects a winningOptionId belonging to a DIFFERENT poll (T-04-09) and does not write", async () => {
    const pollA = await seedPoll();
    const pollB = await seedPoll();

    const { state, redirected } = await run(
      fd({
        adminUrlId: pollA.adminUrlId,
        winningOptionId: pollB.optionIds[0], // valid uuid, foreign poll
      }),
    );
    expect(redirected).toBe(false);
    expect(state?.errors?._form?.[0]).toBe(
      "Choose a candidate date from this poll.",
    );
    expect(sendEmailMock).not.toHaveBeenCalled();

    const row = await pollRow(pollA.pollId);
    expect(row.status).toBe("open");
    expect(row.winningOptionId).toBeNull();
  });

  it("rejects a non-uuid winningOptionId with the _form error and no write", async () => {
    const { adminUrlId, pollId } = await seedPoll();
    const { state } = await run(
      fd({ adminUrlId, winningOptionId: "not-a-uuid" }),
    );
    expect(state?.errors?._form?.[0]).toBe(
      "Choose a candidate date from this poll.",
    );
    const row = await pollRow(pollId);
    expect(row.status).toBe("open");
  });

  it("notFound()s for an unknown adminUrlId and never sends (V4/T-04-07)", async () => {
    const { notFound } = await run(
      fd({
        adminUrlId: "does-not-exist-000",
        // A well-formed uuid (v4/variant-8) so validation passes and the poll
        // lookup — not the uuid guard — is what rejects.
        winningOptionId: "00000000-0000-4000-8000-000000000000",
      }),
    );
    expect(notFound).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("closePoll — best-effort sends (D-09)", () => {
  it("closes cleanly with zero sends when no voter has an email (FNL-03/empty)", async () => {
    const { adminUrlId, pollId, optionIds } = await seedPoll({
      voters: [{ name: "NoEmail", email: null }],
    });
    const { redirected } = await run(
      fd({ adminUrlId, winningOptionId: optionIds[0] }),
    );
    expect(redirected).toBe(true);
    await drainAfter();
    expect(sendEmailMock).not.toHaveBeenCalled();
    const row = await pollRow(pollId);
    expect(row.status).toBe("closed");
  });

  it("a send failure never reverts the close and never aborts the remaining recipients (D-09)", async () => {
    sendEmailMock.mockImplementation(({ to }: { to: string }) =>
      to === "boom@example.com"
        ? Promise.reject(new Error("smtp exploded"))
        : Promise.resolve({ ok: true }),
    );
    const { adminUrlId, pollId, optionIds } = await seedPoll({
      voters: [
        { name: "Boom", email: "boom@example.com" },
        { name: "Fine", email: "fine@example.com" },
      ],
    });
    const { redirected } = await run(
      fd({ adminUrlId, winningOptionId: optionIds[0] }),
    );
    expect(redirected).toBe(true);

    // The close is authoritative the moment the UPDATE commits — before sends.
    const row = await pollRow(pollId);
    expect(row.status).toBe("closed");
    expect(row.winningOptionId).toBe(optionIds[0]);

    // Draining must not throw despite the first send rejecting, and BOTH
    // recipients are still attempted (the throw does not abort the loop).
    await expect(drainAfter()).resolves.toBeUndefined();
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });
});

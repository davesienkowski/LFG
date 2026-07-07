// setDeadline server-action tests (DB-backed — DATABASE_URL must point at the
// Docker Postgres). next/navigation (redirect + notFound) is mocked so the
// action runs outside a Next request context.
//
// Proves (DEAD-01 / LOCKED 5, 7 / UI Probe #4):
//  - V4 unknown-token -> notFound() (never a client poll id).
//  - save a FUTURE instant -> polls.deadline updated to that instant, status
//    UNCHANGED, redirect to /a/{adminUrlId}.
//  - save a PAST/PRESENT instant -> { errors: { deadline: [...] } }, NO write.
//  - save a missing/unparseable value -> deadline field error, NO write.
//  - clear -> polls.deadline nulled, status UNCHANGED, redirect.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
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

import { setDeadline } from "./set-deadline";
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

async function seedPoll(opts?: {
  status?: string;
  deadline?: Date | null;
}): Promise<{ adminUrlId: string; pollId: string }> {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Deadline Poll",
      participantUrlId,
      adminUrlId,
      status: opts?.status ?? "open",
      deadline: opts?.deadline ?? null,
    })
    .returning({ id: polls.id });
  await db
    .insert(options)
    .values([{ pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 }]);
  createdAdminIds.push(adminUrlId);
  return { adminUrlId, pollId: poll.id };
}

async function pollRow(adminUrlId: string) {
  const [row] = await db
    .select({ deadline: polls.deadline, status: polls.status })
    .from(polls)
    .where(eq(polls.adminUrlId, adminUrlId))
    .limit(1);
  return row ?? null;
}

async function run(formData: FormData): Promise<{
  state: Awaited<ReturnType<typeof setDeadline>>;
  redirectUrl: string | null;
  notFound: boolean;
}> {
  try {
    const state = await setDeadline(null, formData);
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

describe("setDeadline — access control (V4 / LOCKED 7)", () => {
  it("notFound()s for an unknown adminUrlId and writes nothing", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const { notFound } = await run(
      fd({ adminUrlId: "does-not-exist-000", deadlineIso: future }),
    );
    expect(notFound).toBe(true);
  });
});

describe("setDeadline — save (DEAD-01)", () => {
  it("saves a future instant, leaves status unchanged, redirects to /a/{adminUrlId}", async () => {
    const { adminUrlId } = await seedPoll();
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { redirectUrl } = await run(
      fd({ adminUrlId, deadlineIso: future.toISOString() }),
    );
    expect(redirectUrl).toBe(`/a/${adminUrlId}`);
    const row = await pollRow(adminUrlId);
    expect(row?.deadline?.toISOString()).toBe(future.toISOString());
    expect(row?.status).toBe("open");
  });

  it("rejects a PAST instant with a deadline field error and writes nothing", async () => {
    const { adminUrlId } = await seedPoll();
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { state, redirectUrl } = await run(
      fd({ adminUrlId, deadlineIso: past }),
    );
    expect(redirectUrl).toBeNull();
    expect(state?.errors?.deadline?.[0]).toBe("Deadline must be in the future.");
    const row = await pollRow(adminUrlId);
    expect(row?.deadline).toBeNull();
  });

  it("rejects a missing/unparseable value with a deadline field error and no write", async () => {
    const { adminUrlId } = await seedPoll();
    const { state } = await run(fd({ adminUrlId, deadlineIso: "not-a-date" }));
    expect(state?.errors?.deadline?.[0]).toBe("Deadline must be in the future.");
    const row = await pollRow(adminUrlId);
    expect(row?.deadline).toBeNull();

    const missing = await run(fd({ adminUrlId }));
    expect(missing.state?.errors?.deadline?.[0]).toBe(
      "Deadline must be in the future.",
    );
    expect((await pollRow(adminUrlId))?.deadline).toBeNull();
  });

  it("does NOT reopen a closed poll — a save leaves status 'closed' (edge-probe)", async () => {
    const { adminUrlId } = await seedPoll({ status: "closed" });
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await run(fd({ adminUrlId, deadlineIso: future.toISOString() }));
    const row = await pollRow(adminUrlId);
    expect(row?.status).toBe("closed");
    expect(row?.deadline?.toISOString()).toBe(future.toISOString());
  });
});

describe("setDeadline — clear (DEAD-01)", () => {
  it("clears an existing deadline to null, leaves status unchanged, redirects", async () => {
    const existing = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { adminUrlId } = await seedPoll({ deadline: existing });
    const { redirectUrl } = await run(fd({ adminUrlId, intent: "clear" }));
    expect(redirectUrl).toBe(`/a/${adminUrlId}`);
    const row = await pollRow(adminUrlId);
    expect(row?.deadline).toBeNull();
    expect(row?.status).toBe("open");
  });
});

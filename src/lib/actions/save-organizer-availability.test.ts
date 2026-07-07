// saveOrganizerAvailability server-action tests (test-first / RED). Runs against
// the live Docker Postgres (DATABASE_URL must point at it). Covers ORG-01's
// single-organizer-row upsert slice: admin-token re-derivation (LOCKED 7), the
// at-most-one is_organizer row invariant (LOCKED 6 — first add inserts one row,
// a later edit upserts the SAME row with no duplicate), the isVotingOpen write
// gate (closed OR deadline-passed poll writes nothing), unknown-token notFound,
// authoritative-option gap-fill, and the deliberate ABSENCE of any email hook.
//
// next/navigation (redirect + notFound) is mocked so the action runs
// deterministically without a Next request context. @/lib/email/send and
// next/server are mocked purely to ASSERT no email hook fires (the action must
// import neither — this is the prohibition-probe "hook bleed" guard).
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { eq, inArray, and } from "drizzle-orm";

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

// The action must NOT touch email. These mocks let us assert zero sends even if
// a hook were accidentally added later (prohibition-probe: hook bleed).
vi.mock("next/server", () => ({
  after: (cb: () => Promise<void> | void) => {
    void Promise.resolve().then(cb).catch(() => {});
  },
}));
vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn(async () => ({ ok: true })),
}));

import { saveOrganizerAvailability } from "./save-organizer-availability";
import { sendEmail } from "@/lib/email/send";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const sendEmailMock = vi.mocked(sendEmail);

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
  deadline?: Date | null;
}): Promise<{
  pollId: string;
  adminUrlId: string;
  optionIds: string[];
}> {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Org Poll",
      participantUrlId,
      adminUrlId,
      status: opts?.status ?? "open",
      deadline: opts?.deadline ?? null,
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
  return { pollId: poll.id, adminUrlId, optionIds: inserted.map((r) => r.id) };
}

async function run(formData: FormData): Promise<{
  state: { errors?: Record<string, string[]> } | null;
  redirectUrl: string | null;
  notFound: boolean;
}> {
  try {
    const state = await saveOrganizerAvailability(null, formData);
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

async function organizerRowsFor(pollId: string) {
  return db
    .select()
    .from(participants)
    .where(
      and(eq(participants.pollId, pollId), eq(participants.isOrganizer, true)),
    );
}

async function participantsFor(pollId: string) {
  return db.select().from(participants).where(eq(participants.pollId, pollId));
}

async function votesFor(participantId: string) {
  return db.select().from(votes).where(eq(votes.participantId, participantId));
}

function stateByOption(vs: Array<{ optionId: string; state: string }>) {
  return Object.fromEntries(vs.map((v) => [v.optionId, v.state]));
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (point at the Docker Postgres)");
  }
});

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  sendEmailMock.mockClear();
});

afterAll(async () => {
  if (createdAdminIds.length) {
    await db.delete(polls).where(inArray(polls.adminUrlId, createdAdminIds));
  }
});

describe("saveOrganizerAvailability — first add (LOCKED 6)", () => {
  it("inserts exactly one is_organizer row (name default 'You', email null, editToken minted) + one vote per authoritative option", async () => {
    const { pollId, adminUrlId, optionIds } = await seedPoll();

    const { redirectUrl } = await run(
      fd({
        adminUrlId,
        // name omitted -> defaults to "You"
        votes: votesJson([
          { optionId: optionIds[0], state: "yes" },
          { optionId: optionIds[1], state: "ifneedbe" },
          // optionIds[2] untouched -> gap-fills to "no"
        ]),
      }),
    );
    expect(redirectUrl).toBe(`/a/${adminUrlId}`);

    const orgRows = await organizerRowsFor(pollId);
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0].name).toBe("You");
    expect(orgRows[0].email).toBeNull();
    expect(orgRows[0].editToken).toBeTruthy();

    const vs = await votesFor(orgRows[0].id);
    expect(vs).toHaveLength(optionIds.length);
    const byOption = stateByOption(vs);
    expect(byOption[optionIds[0]]).toBe("yes");
    expect(byOption[optionIds[1]]).toBe("ifneedbe");
    expect(byOption[optionIds[2]]).toBe("no");

    // No email hook fires (prohibition-probe: hook bleed).
    await new Promise((r) => setTimeout(r, 0));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("uses a provided display name override", async () => {
    const { pollId, adminUrlId, optionIds } = await seedPoll();
    await run(
      fd({
        adminUrlId,
        name: "Dungeon Master",
        votes: votesJson(optionIds.map((id) => ({ optionId: id, state: "yes" }))),
      }),
    );
    const orgRows = await organizerRowsFor(pollId);
    expect(orgRows).toHaveLength(1);
    expect(orgRows[0].name).toBe("Dungeon Master");
  });

  it("ignores a foreign optionId in the payload and gap-fills every real option", async () => {
    const { pollId, adminUrlId, optionIds } = await seedPoll();
    await run(
      fd({
        adminUrlId,
        name: "You",
        votes: votesJson([
          { optionId: optionIds[0], state: "yes" },
          { optionId: "00000000-0000-0000-0000-000000000000", state: "yes" },
        ]),
      }),
    );
    const orgRows = await organizerRowsFor(pollId);
    const vs = await votesFor(orgRows[0].id);
    // Exactly one row per REAL option — the foreign id never persisted.
    expect(vs).toHaveLength(optionIds.length);
    const byOption = stateByOption(vs);
    expect(byOption[optionIds[0]]).toBe("yes");
    expect(byOption[optionIds[1]]).toBe("no");
    expect(byOption[optionIds[2]]).toBe("no");
  });
});

describe("saveOrganizerAvailability — edit upserts the SAME row (LOCKED 6, at-most-one)", () => {
  it("after a first add THEN an edit there is EXACTLY ONE is_organizer row, votes replaced, name updated", async () => {
    const { pollId, adminUrlId, optionIds } = await seedPoll();

    // First add.
    await run(
      fd({
        adminUrlId,
        name: "You",
        votes: votesJson(optionIds.map((id) => ({ optionId: id, state: "no" }))),
      }),
    );
    const afterAdd = await organizerRowsFor(pollId);
    expect(afterAdd).toHaveLength(1);
    const firstId = afterAdd[0].id;

    // Edit — new name + flipped votes.
    await run(
      fd({
        adminUrlId,
        name: "GM",
        votes: votesJson(optionIds.map((id) => ({ optionId: id, state: "yes" }))),
      }),
    );

    const afterEdit = await organizerRowsFor(pollId);
    // The load-bearing assertion: still exactly ONE organizer row, same id.
    expect(afterEdit).toHaveLength(1);
    expect(afterEdit[0].id).toBe(firstId);
    expect(afterEdit[0].name).toBe("GM");

    const vs = await votesFor(firstId);
    expect(vs).toHaveLength(optionIds.length);
    expect(new Set(vs.map((v) => v.state))).toEqual(new Set(["yes"]));
  });
});

describe("saveOrganizerAvailability — isVotingOpen write gate (LOCKED 4)", () => {
  it("rejects with a _form error and writes nothing on a CLOSED poll", async () => {
    const { pollId, adminUrlId, optionIds } = await seedPoll({ status: "closed" });
    const { state, redirectUrl } = await run(
      fd({
        adminUrlId,
        name: "You",
        votes: votesJson(optionIds.map((id) => ({ optionId: id, state: "yes" }))),
      }),
    );
    expect(redirectUrl).toBeNull();
    expect(state?.errors?._form?.[0]).toBeTruthy();
    expect(await participantsFor(pollId)).toHaveLength(0);
  });

  it("rejects with a _form error and writes nothing on an OPEN poll whose deadline has PASSED", async () => {
    const { pollId, adminUrlId, optionIds } = await seedPoll({
      status: "open",
      deadline: new Date(Date.now() - 60 * 60 * 1000),
    });
    const { state, redirectUrl } = await run(
      fd({
        adminUrlId,
        name: "You",
        votes: votesJson(optionIds.map((id) => ({ optionId: id, state: "yes" }))),
      }),
    );
    expect(redirectUrl).toBeNull();
    expect(state?.errors?._form?.[0]).toBeTruthy();
    expect(await participantsFor(pollId)).toHaveLength(0);
  });
});

describe("at-most-one organizer row is DB-enforced (0007 partial unique index)", () => {
  it("rejects a second is_organizer=true row for the same poll with a unique violation (23505)", async () => {
    // Bypass the action entirely — assert the DATABASE constraint itself, so the
    // 'at most one' invariant holds even under a concurrent-insert race the app
    // find-or-create can't serialize on neon-http (08-04 code-review hardening).
    const { pollId } = await seedPoll();
    await db.insert(participants).values({
      pollId,
      name: "You",
      email: null,
      isOrganizer: true,
      editToken: generateToken(),
    });
    let threw = false;
    let code: unknown;
    try {
      await db.insert(participants).values({
        pollId,
        name: "You again",
        email: null,
        isOrganizer: true,
        editToken: generateToken(),
      });
    } catch (e) {
      threw = true;
      // Drizzle wraps the pg error, so the 23505 code is on the top level OR .cause.
      code =
        (e as { code?: unknown })?.code ??
        (e as { cause?: { code?: unknown } })?.cause?.code;
    }
    expect(threw).toBe(true);
    expect(code).toBe("23505");
    // Exactly one organizer row survived.
    expect(await organizerRowsFor(pollId)).toHaveLength(1);
    // A non-organizer participant on the same poll is unconstrained (partial index).
    await db.insert(participants).values({
      pollId,
      name: "Ordinary voter",
      email: null,
      isOrganizer: false,
      editToken: generateToken(),
    });
    await db.insert(participants).values({
      pollId,
      name: "Another voter",
      email: null,
      isOrganizer: false,
      editToken: generateToken(),
    });
    expect(await organizerRowsFor(pollId)).toHaveLength(1);
  });
});

describe("saveOrganizerAvailability — admin-token authorization (LOCKED 7)", () => {
  it("notFound()s on an unknown adminUrlId and writes nothing", async () => {
    const { notFound } = await run(
      fd({
        adminUrlId: "definitely-not-a-real-admin-token",
        name: "You",
        votes: votesJson([]),
      }),
    );
    expect(notFound).toBe(true);
  });
});

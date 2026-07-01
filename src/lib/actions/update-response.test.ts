// updateResponse server-action tests (test-first / RED). Runs against the live
// Docker Postgres (DATABASE_URL must point at it). Covers the edit/return slice:
// token-verified ownership (VOTE-06), atomic onConflictDoUpdate replace,
// idempotency (VOTE-05), server-side status guard, wrong-poll 404 cross-check,
// and the concurrency backstop (last-write-wins, never a mixed set).
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
}));

import { updateResponse } from "./update-response";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
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
      title: "Edit Poll",
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

// Seed an existing participant + one vote row per option (the prior response the
// edit flow will replace). `states` maps optionId -> state; missing => 'no'.
async function seedParticipant(
  pollId: string,
  optionIds: string[],
  states: Record<string, string> = {},
  name = "Original",
  email: string | null = null,
): Promise<{ participantId: string; editToken: string }> {
  const editToken = generateToken();
  const [participant] = await db
    .insert(participants)
    .values({ pollId, name, email, editToken })
    .returning({ id: participants.id });
  await db.insert(votes).values(
    optionIds.map((optionId) => ({
      pollId,
      participantId: participant.id,
      optionId,
      state: states[optionId] ?? "no",
    })),
  );
  return { participantId: participant.id, editToken };
}

async function run(formData: FormData): Promise<{
  state: { errors?: Record<string, string[]> } | null;
  redirectUrl: string | null;
  notFound: boolean;
}> {
  try {
    const state = await updateResponse(null, formData);
    return { state, redirectUrl: null, notFound: false };
  } catch (e) {
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      const match = /^NEXT_REDIRECT;[^;]*;([^;]*);/.exec(digest);
      return {
        state: null,
        redirectUrl: match ? match[1] : null,
        notFound: false,
      };
    }
    if ((e as Error)?.message === "NEXT_NOT_FOUND") {
      return { state: null, redirectUrl: null, notFound: true };
    }
    throw e;
  }
}

async function votesFor(participantId: string) {
  return db.select().from(votes).where(eq(votes.participantId, participantId));
}

async function participantsFor(pollId: string) {
  return db.select().from(participants).where(eq(participants.pollId, pollId));
}

function stateByOption(vs: Array<{ optionId: string; state: string }>) {
  return Object.fromEntries(vs.map((v) => [v.optionId, v.state]));
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

describe("updateResponse — valid edit (VOTE-05)", () => {
  it("replaces the participant's vote states without adding rows or a participant", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const { editToken } = await seedParticipant(pollId, optionIds, {
      [optionIds[0]]: "no",
      [optionIds[1]]: "no",
      [optionIds[2]]: "no",
    });

    const { redirectUrl } = await run(
      fd({
        participantUrlId,
        editToken,
        name: "Original",
        votes: votesJson([
          { optionId: optionIds[0], state: "yes" },
          { optionId: optionIds[1], state: "ifneedbe" },
          // optionIds[2] untouched -> gap-fills to 'no'
        ]),
      }),
    );
    expect(redirectUrl).toBe(`/p/${participantUrlId}/thanks`);

    // No duplicate participant created.
    expect(await participantsFor(pollId)).toHaveLength(1);

    const vs = await votesFor(
      (await participantsFor(pollId))[0].id,
    );
    // Exactly one vote row per option — no duplicates.
    expect(vs).toHaveLength(optionIds.length);
    expect(new Set(vs.map((v) => v.optionId)).size).toBe(vs.length);
    const byOption = stateByOption(vs);
    expect(byOption[optionIds[0]]).toBe("yes");
    expect(byOption[optionIds[1]]).toBe("ifneedbe");
    expect(byOption[optionIds[2]]).toBe("no");
  });

  it("is idempotent — re-applying identical selections yields byte-identical rows", async () => {
    const { pollId, participantUrlId, optionIds } = await seedParticipantPoll();
    const { editToken, participantId } = await seedParticipant(
      pollId,
      optionIds,
      { [optionIds[0]]: "yes", [optionIds[1]]: "no" },
    );
    const selections = votesJson([
      { optionId: optionIds[0], state: "yes" },
      { optionId: optionIds[1], state: "ifneedbe" },
    ]);

    await run(fd({ participantUrlId, editToken, name: "Original", votes: selections }));
    const first = stateByOption(await votesFor(participantId));

    await run(fd({ participantUrlId, editToken, name: "Original", votes: selections }));
    const second = stateByOption(await votesFor(participantId));

    expect(second).toEqual(first);
    expect((await votesFor(participantId)).length).toBe(optionIds.length);
  });
});

describe("updateResponse — token ownership (VOTE-06)", () => {
  it("changes ONLY the token owner's rows; another participant's rows are untouched", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const a = await seedParticipant(
      pollId,
      optionIds,
      { [optionIds[0]]: "yes", [optionIds[1]]: "yes", [optionIds[2]]: "yes" },
      "A",
    );
    const b = await seedParticipant(
      pollId,
      optionIds,
      { [optionIds[0]]: "no", [optionIds[1]]: "no", [optionIds[2]]: "no" },
      "B",
    );

    // Edit using B's token -> only B changes.
    await run(
      fd({
        participantUrlId,
        editToken: b.editToken,
        name: "B",
        votes: votesJson(optionIds.map((id) => ({ optionId: id, state: "ifneedbe" }))),
      }),
    );

    const aStates = stateByOption(await votesFor(a.participantId));
    const bStates = stateByOption(await votesFor(b.participantId));
    // A unchanged (still all yes).
    expect(Object.values(aStates)).toEqual(["yes", "yes", "yes"]);
    // B replaced (all ifneedbe).
    expect(Object.values(bStates).every((s) => s === "ifneedbe")).toBe(true);
  });

  it("modifies nothing when the editToken is missing or empty (name-only attempt 404s)", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const a = await seedParticipant(pollId, optionIds, {
      [optionIds[0]]: "yes",
    });

    const emptyToken = await run(
      fd({
        participantUrlId,
        editToken: "",
        name: "Attacker",
        votes: votesJson([{ optionId: optionIds[0], state: "no" }]),
      }),
    );
    expect(emptyToken.notFound).toBe(true);

    const noToken = await run(
      fd({
        participantUrlId,
        name: "Attacker",
        votes: votesJson([{ optionId: optionIds[0], state: "no" }]),
      }),
    );
    expect(noToken.notFound).toBe(true);

    // A's row is unchanged and no extra participant was created.
    const aStates = stateByOption(await votesFor(a.participantId));
    expect(aStates[optionIds[0]]).toBe("yes");
    expect(await participantsFor(pollId)).toHaveLength(1);
  });

  it("404s and changes nothing when the token belongs to a participant of a different poll", async () => {
    const pollA = await seedPoll();
    const pollB = await seedPoll();
    // Token owned by a participant of poll B, presented on poll A's edit URL.
    const b = await seedParticipant(pollB.pollId, pollB.optionIds, {
      [pollB.optionIds[0]]: "yes",
    });

    const { notFound } = await run(
      fd({
        participantUrlId: pollA.participantUrlId, // wrong poll for B's token
        editToken: b.editToken,
        name: "CrossPoll",
        votes: votesJson([{ optionId: pollB.optionIds[0], state: "no" }]),
      }),
    );
    expect(notFound).toBe(true);

    // B's rows in poll B are unchanged.
    const bStates = stateByOption(await votesFor(b.participantId));
    expect(bStates[pollB.optionIds[0]]).toBe("yes");
  });
});

describe("updateResponse — status guard", () => {
  it("rejects the write when poll.status != 'open' and changes no rows", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll({
      status: "closed",
    });
    const p = await seedParticipant(pollId, optionIds, {
      [optionIds[0]]: "yes",
    });

    const { state, redirectUrl } = await run(
      fd({
        participantUrlId,
        editToken: p.editToken,
        name: "Late",
        votes: votesJson([{ optionId: optionIds[0], state: "no" }]),
      }),
    );
    expect(redirectUrl).toBeNull();
    expect(state?.errors?._form?.[0]).toBe("Voting is closed for this poll.");
    const pStates = stateByOption(await votesFor(p.participantId));
    expect(pStates[optionIds[0]]).toBe("yes");
  });
});

describe("updateResponse — concurrency backstop (VOTE-05 race)", () => {
  it("two opposing concurrent edits resolve to ONE complete set, never a mixed blend", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll();
    const p = await seedParticipant(
      pollId,
      optionIds,
      Object.fromEntries(optionIds.map((id) => [id, "no"])),
    );

    const allYes = votesJson(
      optionIds.map((id) => ({ optionId: id, state: "yes" })),
    );
    const allNo = votesJson(
      optionIds.map((id) => ({ optionId: id, state: "no" })),
    );

    await Promise.all([
      run(fd({ participantUrlId, editToken: p.editToken, name: "P", votes: allYes })),
      run(fd({ participantUrlId, editToken: p.editToken, name: "P", votes: allNo })),
    ]);

    const vs = await votesFor(p.participantId);
    expect(vs).toHaveLength(optionIds.length);
    const distinct = new Set(vs.map((v) => v.state));
    // Exactly one winning state across ALL rows — never a mixed/partial blend.
    expect(distinct.size).toBe(1);
    expect(["yes", "no"]).toContain([...distinct][0]);
  });
});

// A distinct seed helper alias used by the idempotency test for readability.
async function seedParticipantPoll() {
  return seedPoll({
    dates: [
      { date: "2026-08-01", startTime: null },
      { date: "2026-08-02", startTime: "10:00" },
    ],
  });
}

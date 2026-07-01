// getResultsForPoll DB-backed tests (runs against live Postgres — needs
// DATABASE_URL). Mirrors page.test.ts: DATABASE_URL guard in beforeAll, seed via
// direct inserts, inArray cleanup in afterAll.
//
// The three things proven here:
//  1. participants come back in createdAt-asc (submission) order (DASH-01);
//  2. a participant with ZERO vote rows still appears as a present row with an
//     empty votes record (LEFT JOIN, Pitfall 3);
//  3. the no-leak guarantee is NON-VACUOUS: a seeded participant carries a
//     distinctive canary email, and we prove that string — plus the
//     email/editToken/createdAt own-keys — are ALL absent from the returned
//     shape (SPEC Prohibition #1/#2). Asserting "no email substring" would pass
//     vacuously if email were NULL; the canary makes the assertion real.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { getResultsForPoll } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const CANARY_EMAIL = "leak-canary@example.com";
const createdPollIds: string[] = [];

async function seedPollWithResults() {
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Results Query Poll",
      participantUrlId: generateToken(),
      adminUrlId: generateToken(),
    })
    .returning({ id: polls.id });
  createdPollIds.push(poll.id);

  const insertedOptions = await db
    .insert(options)
    .values([
      { pollId: poll.id, date: "2026-08-01", startTime: null, position: 0 },
      { pollId: poll.id, date: "2026-08-02", startTime: "14:00", position: 1 },
    ])
    .returning({ id: options.id });
  const [opt1, opt2] = insertedOptions;

  // Insert participants in a deterministic createdAt order. Postgres defaults
  // createdAt to now() at insert time; separate sequential inserts guarantee
  // first < second < third. The canary email lives on the FIRST voter.
  const [first] = await db
    .insert(participants)
    .values({
      pollId: poll.id,
      name: "Alice First",
      email: CANARY_EMAIL,
      editToken: generateToken(),
    })
    .returning({ id: participants.id });

  const [second] = await db
    .insert(participants)
    .values({
      pollId: poll.id,
      name: "Bob Second",
      email: null,
      editToken: generateToken(),
    })
    .returning({ id: participants.id });

  // Third participant has ZERO vote rows (Pitfall 3 coverage).
  const [third] = await db
    .insert(participants)
    .values({
      pollId: poll.id,
      name: "Carol NoVotes",
      email: null,
      editToken: generateToken(),
    })
    .returning({ id: participants.id });

  await db.insert(votes).values([
    { pollId: poll.id, participantId: first.id, optionId: opt1.id, state: "yes" },
    {
      pollId: poll.id,
      participantId: first.id,
      optionId: opt2.id,
      state: "ifneedbe",
    },
    { pollId: poll.id, participantId: second.id, optionId: opt1.id, state: "no" },
    { pollId: poll.id, participantId: second.id, optionId: opt2.id, state: "yes" },
  ]);

  return {
    pollId: poll.id,
    opt1Id: opt1.id,
    opt2Id: opt2.id,
    firstId: first.id,
    secondId: second.id,
    thirdId: third.id,
  };
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (point at the Docker Postgres)");
  }
});

afterAll(async () => {
  if (createdPollIds.length) {
    // ON DELETE CASCADE removes options/participants/votes with the poll.
    await db.delete(polls).where(inArray(polls.id, createdPollIds));
  }
});

describe("getResultsForPoll", () => {
  it("returns participants in createdAt-asc submission order (DASH-01)", async () => {
    const seed = await seedPollWithResults();
    const result = await getResultsForPoll(seed.pollId);
    expect(result.map((p) => p.name)).toEqual([
      "Alice First",
      "Bob Second",
      "Carol NoVotes",
    ]);
    expect(result.map((p) => p.id)).toEqual([
      seed.firstId,
      seed.secondId,
      seed.thirdId,
    ]);
  });

  it("includes a zero-vote participant as a present row with an empty votes record (Pitfall 3)", async () => {
    const seed = await seedPollWithResults();
    const result = await getResultsForPoll(seed.pollId);
    const carol = result.find((p) => p.id === seed.thirdId);
    expect(carol).toBeDefined();
    expect(carol!.votes).toEqual({});
  });

  it("maps each voting participant's optionId -> state correctly", async () => {
    const seed = await seedPollWithResults();
    const result = await getResultsForPoll(seed.pollId);
    const alice = result.find((p) => p.id === seed.firstId)!;
    const bob = result.find((p) => p.id === seed.secondId)!;
    expect(alice.votes).toEqual({
      [seed.opt1Id]: "yes",
      [seed.opt2Id]: "ifneedbe",
    });
    expect(bob.votes).toEqual({
      [seed.opt1Id]: "no",
      [seed.opt2Id]: "yes",
    });
  });

  it("leaks no email/token/canary substrings into the serialized shape (non-vacuous, Prohibition #1/#2)", async () => {
    const seed = await seedPollWithResults();
    const result = await getResultsForPoll(seed.pollId);
    const serialized = JSON.stringify(result);
    // The canary email WAS stored on Alice, so absence here is meaningful.
    expect(serialized).not.toContain(CANARY_EMAIL);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("editToken");
    expect(serialized).not.toContain("edit_token");
    expect(serialized).not.toContain("adminUrlId");
    expect(serialized).not.toContain("admin_url_id");
  });

  it("returns participant objects whose own keys are exactly id/name/votes (structural)", async () => {
    const seed = await seedPollWithResults();
    const result = await getResultsForPoll(seed.pollId);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(Object.keys(p).sort()).toEqual(["id", "name", "votes"]);
    }
  });

  it("returns an empty array for a poll with no participants", async () => {
    const [poll] = await db
      .insert(polls)
      .values({
        title: "Empty Poll",
        participantUrlId: generateToken(),
        adminUrlId: generateToken(),
      })
      .returning({ id: polls.id });
    createdPollIds.push(poll.id);
    const result = await getResultsForPoll(poll.id);
    expect(result).toEqual([]);
  });
});

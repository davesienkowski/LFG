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
import {
  getResultsForPoll,
  getVoterEmailsForPoll,
  getFinalizedPollsByOrganizerId,
  getPollAdminNotifyTargets,
} from "@/lib/db/queries";
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

describe("getVoterEmailsForPoll", () => {
  it("returns ONLY emailed voters (a null-email voter is excluded), name/email only (T-04-08)", async () => {
    // The shared seed has three voters: Alice (canary email), Bob (null email),
    // Carol (null email). Only Alice should come back.
    const seed = await seedPollWithResults();
    const voters = await getVoterEmailsForPoll(seed.pollId);

    expect(voters).toHaveLength(1);
    expect(voters[0]).toEqual({ name: "Alice First", email: CANARY_EMAIL });

    // Structural: own keys are EXACTLY name/email — never a token/admin column.
    for (const v of voters) {
      expect(Object.keys(v).sort()).toEqual(["email", "name"]);
    }
    const serialized = JSON.stringify(voters);
    expect(serialized).not.toContain("editToken");
    expect(serialized).not.toContain("edit_token");
    expect(serialized).not.toContain("adminUrlId");
    expect(serialized).not.toContain("admin_url_id");
  });

  it("returns an empty array for a poll whose voters all lack an email", async () => {
    const [poll] = await db
      .insert(polls)
      .values({
        title: "No-Email Poll",
        participantUrlId: generateToken(),
        adminUrlId: generateToken(),
      })
      .returning({ id: polls.id });
    createdPollIds.push(poll.id);
    await db.insert(participants).values({
      pollId: poll.id,
      name: "Anon",
      email: null,
      editToken: generateToken(),
    });
    const voters = await getVoterEmailsForPoll(poll.id);
    expect(voters).toEqual([]);
  });
});

// getFinalizedPollsByOrganizerId (LD-4 / LD-7 / EP-FEED-ORDER). Seeds a fresh
// organizer token and, under it, two CLOSED polls with distinct winning dates
// plus one OPEN poll (winning_option_id null) that must be excluded. A canary
// email on a participant under one closed poll makes the no-leak assertion
// non-vacuous.
async function seedFinalizedPoll(
  organizerId: string,
  winningDate: string,
  winningStartTime: string | null,
  opts?: { open?: boolean; canaryEmail?: string },
) {
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Finalized Feed Poll",
      description: "Bring dice",
      participantUrlId: generateToken(),
      adminUrlId: generateToken(),
      organizerId,
      status: opts?.open ? "open" : "closed",
    })
    .returning({ id: polls.id });
  createdPollIds.push(poll.id);

  const [opt] = await db
    .insert(options)
    .values({
      pollId: poll.id,
      date: winningDate,
      startTime: winningStartTime,
      position: 0,
    })
    .returning({ id: options.id });

  // An OPEN poll keeps winning_option_id NULL (must be excluded); a CLOSED poll
  // wires the winner.
  if (!opts?.open) {
    await db
      .update(polls)
      .set({ winningOptionId: opt.id })
      .where(inArray(polls.id, [poll.id]));
  }

  if (opts?.canaryEmail) {
    await db.insert(participants).values({
      pollId: poll.id,
      name: "Canary Voter",
      email: opts.canaryEmail,
      editToken: generateToken(),
    });
  }

  return { pollId: poll.id, winningOptionId: opt.id };
}

describe("getFinalizedPollsByOrganizerId", () => {
  const FEED_CANARY = "feed-canary@example.com";

  it("returns ONLY finalized (closed + winner) polls for the organizer, ordered by winning date asc, excluding open polls", async () => {
    const organizerId = generateToken();
    // Seed OUT of date order to prove the ORDER BY (later date first).
    const later = await seedFinalizedPoll(organizerId, "2026-10-20", "18:00", {
      canaryEmail: FEED_CANARY,
    });
    const earlier = await seedFinalizedPoll(organizerId, "2026-10-10", null);
    // An OPEN poll under the SAME organizer must be excluded.
    await seedFinalizedPoll(organizerId, "2026-10-15", null, { open: true });

    const result = await getFinalizedPollsByOrganizerId(organizerId);

    expect(result.map((p) => p.id)).toEqual([earlier.pollId, later.pollId]);
    expect(result.map((p) => p.winningDate)).toEqual([
      "2026-10-10",
      "2026-10-20",
    ]);
  });

  it("returns objects whose own keys are EXACTLY id/title/description/winningOptionId/winningDate/winningStartTime", async () => {
    const organizerId = generateToken();
    await seedFinalizedPoll(organizerId, "2026-11-01", null);
    const result = await getFinalizedPollsByOrganizerId(organizerId);
    expect(result.length).toBeGreaterThan(0);
    for (const p of result) {
      expect(Object.keys(p).sort()).toEqual([
        "description",
        "id",
        "title",
        "winningDate",
        "winningOptionId",
        "winningStartTime",
      ]);
    }
  });

  it("leaks no email/token substrings into the serialized shape (non-vacuous, LD-7)", async () => {
    const organizerId = generateToken();
    await seedFinalizedPoll(organizerId, "2026-11-05", null, {
      canaryEmail: FEED_CANARY,
    });
    const result = await getFinalizedPollsByOrganizerId(organizerId);
    const serialized = JSON.stringify(result);
    // The canary email WAS stored under this organizer, so absence is meaningful.
    expect(serialized).not.toContain(FEED_CANARY);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("editToken");
    expect(serialized).not.toContain("edit_token");
    expect(serialized).not.toContain("adminUrlId");
    expect(serialized).not.toContain("admin_url_id");
    expect(serialized).not.toContain("participantUrlId");
    expect(serialized).not.toContain("participant_url_id");
  });

  it("orders two finalized polls sharing the same date+time deterministically (stable polls.id tiebreaker, EP-FEED-ORDER)", async () => {
    const organizerId = generateToken();
    const a = await seedFinalizedPoll(organizerId, "2026-12-01", "19:00");
    const b = await seedFinalizedPoll(organizerId, "2026-12-01", "19:00");
    const expectedOrder = [a.pollId, b.pollId].sort();

    // Two independent calls must return the SAME order (deterministic).
    const first = await getFinalizedPollsByOrganizerId(organizerId);
    const second = await getFinalizedPollsByOrganizerId(organizerId);
    expect(first.map((p) => p.id)).toEqual(expectedOrder);
    expect(second.map((p) => p.id)).toEqual(expectedOrder);
  });

  it("returns [] for an unknown organizerId", async () => {
    const result = await getFinalizedPollsByOrganizerId(generateToken());
    expect(result).toEqual([]);
  });
});

// getPollAdminNotifyTargets (t7e / T-t7e-01/02). The sole server-side resolver
// of admin_url_id for the participant actions; returns { adminUrlId,
// creatorEmail } keyed by poll id (creatorEmail null when the column is unset),
// or null for an unknown poll.
describe("getPollAdminNotifyTargets", () => {
  it("returns { adminUrlId, creatorEmail } for a poll with a stored creator_email", async () => {
    const adminUrlId = generateToken();
    const [poll] = await db
      .insert(polls)
      .values({
        title: "Notify Poll",
        participantUrlId: generateToken(),
        adminUrlId,
        creatorEmail: "creator@example.com",
      })
      .returning({ id: polls.id });
    createdPollIds.push(poll.id);

    const target = await getPollAdminNotifyTargets(poll.id);
    expect(target).toEqual({ adminUrlId, creatorEmail: "creator@example.com" });
    // Structural: own keys are EXACTLY adminUrlId/creatorEmail — no token/email
    // of participants, no other poll column.
    expect(Object.keys(target!).sort()).toEqual(["adminUrlId", "creatorEmail"]);
  });

  it("returns creatorEmail null when the column is unset", async () => {
    const adminUrlId = generateToken();
    const [poll] = await db
      .insert(polls)
      .values({
        title: "No-Creator-Email Poll",
        participantUrlId: generateToken(),
        adminUrlId,
      })
      .returning({ id: polls.id });
    createdPollIds.push(poll.id);

    const target = await getPollAdminNotifyTargets(poll.id);
    expect(target).toEqual({ adminUrlId, creatorEmail: null });
  });

  it("returns null for an unknown pollId", async () => {
    // A random UUID that matches no poll row.
    const target = await getPollAdminNotifyTargets(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(target).toBeNull();
  });
});

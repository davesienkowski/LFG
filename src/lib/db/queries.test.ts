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
  getPollsByOrganizerId,
  getPollAdminNotifyTargets,
  getInvitationTrackingForPoll,
} from "@/lib/db/queries";
import { db } from "@/lib/db";
import { polls, options, participants, votes, invitations } from "@/lib/db/schema";
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

// getPollsByOrganizerId (MYP-01 / MYP-04 / MYP-05 / MYP-07 / PROH-1 / PROH-2).
// The "Your polls" dashboard read: every poll (open + closed) for one organizer
// token, newest-first, with per-poll aggregate counts and participant-safe
// columns only. Each case mints its OWN generateToken() organizer so rows from
// other cases (or other describe blocks) can never contaminate an assertion.
async function seedDashboardPoll(
  organizerId: string | null,
  opts?: {
    title?: string;
    optionSpecs?: { date: string; startTime: string | null }[];
    participantSpecs?: { name: string; email: string | null }[];
    winnerIndex?: number; // index into optionSpecs to set as winner (closes poll)
  },
) {
  const [poll] = await db
    .insert(polls)
    .values({
      title: opts?.title ?? "Dashboard Poll",
      participantUrlId: generateToken(),
      adminUrlId: generateToken(),
      // null => leave organizer_id NULL (the null-organizer / legacy case).
      organizerId: organizerId ?? undefined,
      status: opts?.winnerIndex != null ? "closed" : "open",
    })
    .returning({ id: polls.id, adminUrlId: polls.adminUrlId });
  createdPollIds.push(poll.id);

  let insertedOptions: { id: string }[] = [];
  if (opts?.optionSpecs?.length) {
    insertedOptions = await db
      .insert(options)
      .values(
        opts.optionSpecs.map((o, i) => ({
          pollId: poll.id,
          date: o.date,
          startTime: o.startTime,
          position: i,
        })),
      )
      .returning({ id: options.id });
  }

  const editTokens: string[] = [];
  if (opts?.participantSpecs?.length) {
    for (const p of opts.participantSpecs) {
      const editToken = generateToken();
      editTokens.push(editToken);
      await db.insert(participants).values({
        pollId: poll.id,
        name: p.name,
        email: p.email,
        editToken,
      });
    }
  }

  if (opts?.winnerIndex != null && insertedOptions[opts.winnerIndex]) {
    await db
      .update(polls)
      .set({ winningOptionId: insertedOptions[opts.winnerIndex].id })
      .where(inArray(polls.id, [poll.id]));
  }

  return {
    pollId: poll.id,
    adminUrlId: poll.adminUrlId,
    optionIds: insertedOptions.map((o) => o.id),
    editTokens,
  };
}

describe("getPollsByOrganizerId", () => {
  const DASH_CANARY_EMAIL = "dash-canary@example.com";
  const DASH_CANARY_NAME = "Zorbnax The Canary";

  it("returns every poll (open + closed) newest-first (created_at DESC), MYP-01", async () => {
    const organizerId = generateToken();
    // Sequential inserts => strictly increasing created_at; newest is last seeded.
    const oldest = await seedDashboardPoll(organizerId, { title: "Oldest" });
    const middle = await seedDashboardPoll(organizerId, { title: "Middle" });
    const newest = await seedDashboardPoll(organizerId, { title: "Newest" });

    const result = await getPollsByOrganizerId(organizerId);
    expect(result.map((p) => p.adminUrlId)).toEqual([
      newest.adminUrlId,
      middle.adminUrlId,
      oldest.adminUrlId,
    ]);
  });

  it("orders deterministically across repeated calls via the stable polls.id tiebreaker (MYP-01)", async () => {
    const organizerId = generateToken();
    await seedDashboardPoll(organizerId, { title: "One" });
    await seedDashboardPoll(organizerId, { title: "Two" });

    const first = await getPollsByOrganizerId(organizerId);
    const second = await getPollsByOrganizerId(organizerId);
    expect(second.map((p) => p.adminUrlId)).toEqual(
      first.map((p) => p.adminUrlId),
    );
  });

  it("computes optionCount/responseCount as numbers, 0 (not null) for an empty poll (MYP-04)", async () => {
    const organizerId = generateToken();
    const counted = await seedDashboardPoll(organizerId, {
      title: "Counted",
      optionSpecs: [
        { date: "2026-09-01", startTime: null },
        { date: "2026-09-02", startTime: "14:00" },
        { date: "2026-09-03", startTime: "18:00" },
      ],
      participantSpecs: [
        { name: "P1", email: null },
        { name: "P2", email: null },
      ],
    });
    const empty = await seedDashboardPoll(organizerId, { title: "Empty" });

    const result = await getPollsByOrganizerId(organizerId);
    const countedRow = result.find((p) => p.adminUrlId === counted.adminUrlId)!;
    const emptyRow = result.find((p) => p.adminUrlId === empty.adminUrlId)!;

    expect(typeof countedRow.optionCount).toBe("number");
    expect(typeof countedRow.responseCount).toBe("number");
    expect(countedRow.optionCount).toBe(3);
    expect(countedRow.responseCount).toBe(2);

    expect(emptyRow.optionCount).toBe(0);
    expect(emptyRow.responseCount).toBe(0);
    expect(emptyRow.optionCount).not.toBeNull();
    expect(emptyRow.responseCount).not.toBeNull();
  });

  it("resolves winner columns for a CLOSED poll and null for an OPEN poll — both appear (MYP-01)", async () => {
    const organizerId = generateToken();
    const closed = await seedDashboardPoll(organizerId, {
      title: "Closed",
      optionSpecs: [{ date: "2026-10-05", startTime: "19:30:00" }],
      winnerIndex: 0,
    });
    const open = await seedDashboardPoll(organizerId, {
      title: "Open",
      optionSpecs: [{ date: "2026-10-06", startTime: null }],
    });

    const result = await getPollsByOrganizerId(organizerId);
    const closedRow = result.find((p) => p.adminUrlId === closed.adminUrlId)!;
    const openRow = result.find((p) => p.adminUrlId === open.adminUrlId)!;

    expect(closedRow).toBeDefined();
    expect(openRow).toBeDefined();
    expect(closedRow.status).toBe("closed");
    expect(closedRow.winningDate).toBe("2026-10-05");
    expect(closedRow.winningStartTime).toBe("19:30:00");
    expect(openRow.status).toBe("open");
    expect(openRow.winningDate).toBeNull();
    expect(openRow.winningStartTime).toBeNull();
  });

  it("scopes strictly to the organizer — never leaks another organizer's poll (PROH-1)", async () => {
    const organizerA = generateToken();
    const organizerB = generateToken();
    const a = await seedDashboardPoll(organizerA, { title: "A's Poll" });
    const b = await seedDashboardPoll(organizerB, { title: "B's Poll" });

    const resultA = await getPollsByOrganizerId(organizerA);
    const resultB = await getPollsByOrganizerId(organizerB);

    const aIds = resultA.map((p) => p.adminUrlId);
    const bIds = resultB.map((p) => p.adminUrlId);
    expect(aIds).toContain(a.adminUrlId);
    expect(aIds).not.toContain(b.adminUrlId);
    expect(bIds).toContain(b.adminUrlId);
    expect(bIds).not.toContain(a.adminUrlId);
  });

  it("returns [] for an empty/whitespace organizerId even with a null-organizer poll present (MYP-05)", async () => {
    // Seed a poll with organizer_id NULL — it must not be grouped by "" or "   ".
    await seedDashboardPoll(null, { title: "Null Organizer" });
    expect(await getPollsByOrganizerId("")).toEqual([]);
    expect(await getPollsByOrganizerId("   ")).toEqual([]);
  });

  it("never returns a null-organizer poll under any organizer token (MYP-07)", async () => {
    const nullPoll = await seedDashboardPoll(null, { title: "Orphan" });
    const organizerId = generateToken();
    await seedDashboardPoll(organizerId, { title: "Owned" });

    const result = await getPollsByOrganizerId(organizerId);
    expect(result.map((p) => p.adminUrlId)).not.toContain(nullPoll.adminUrlId);
    // And an unknown organizer sees nothing (the orphan is not a wildcard match).
    expect(await getPollsByOrganizerId(generateToken())).toEqual([]);
  });

  it("leaks no participant email/name/edit-token/participant_url_id and has EXACTLY the 7-key shape (non-vacuous, PROH-2)", async () => {
    const organizerId = generateToken();
    const seeded = await seedDashboardPoll(organizerId, {
      title: "No-Leak Poll",
      participantSpecs: [
        { name: DASH_CANARY_NAME, email: DASH_CANARY_EMAIL },
      ],
    });

    const result = await getPollsByOrganizerId(organizerId);
    // Non-vacuous: the poll DID appear.
    expect(result.length).toBeGreaterThanOrEqual(1);
    const row = result.find((p) => p.adminUrlId === seeded.adminUrlId)!;
    expect(row).toBeDefined();

    // Exactly the 7 documented, participant-safe columns (sorted).
    expect(Object.keys(row).sort()).toEqual([
      "adminUrlId",
      "optionCount",
      "responseCount",
      "status",
      "title",
      "winningDate",
      "winningStartTime",
    ]);

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(DASH_CANARY_EMAIL);
    expect(serialized).not.toContain(DASH_CANARY_NAME);
    expect(serialized).not.toContain(seeded.editTokens[0]);
    expect(serialized).not.toContain("email");
    expect(serialized).not.toContain("editToken");
    expect(serialized).not.toContain("edit_token");
    expect(serialized).not.toContain("participantUrlId");
    expect(serialized).not.toContain("participant_url_id");
    expect(serialized).not.toContain("creatorEmail");
    expect(serialized).not.toContain("creator_email");
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

// getInvitationTrackingForPoll (RESP-01 / T-07-10). The admin-only respondent
// read: one row per invitation with a `responded` flag = some participant on the
// SAME poll has a case-insensitively matching email. Seeds a single poll with the
// exact/case-differ/no-match/null-email matrix plus a SECOND poll proving
// cross-poll isolation.
describe("getInvitationTrackingForPoll", () => {
  async function seedTrackingPoll() {
    const [poll] = await db
      .insert(polls)
      .values({
        title: "Tracking Poll",
        participantUrlId: generateToken(),
        adminUrlId: generateToken(),
      })
      .returning({ id: polls.id });
    createdPollIds.push(poll.id);

    // The SECOND poll — used only for the cross-poll isolation case. It has a
    // participant whose email equals invitation (iii)'s address; that MUST NOT
    // mark poll-one's invitation (iii) responded.
    const [otherPoll] = await db
      .insert(polls)
      .values({
        title: "Other Poll",
        participantUrlId: generateToken(),
        adminUrlId: generateToken(),
      })
      .returning({ id: polls.id });
    createdPollIds.push(otherPoll.id);

    // Participants on poll-one:
    //  - "exact@example.com" matches invitation (i) EXACTLY.
    //  - "Case@Example.com" matches invitation (ii) by DIFFERENT casing.
    //  - a NULL-email participant (must never match anything).
    await db.insert(participants).values([
      {
        pollId: poll.id,
        name: "Exact Voter",
        email: "exact@example.com",
        editToken: generateToken(),
      },
      {
        pollId: poll.id,
        name: "Case Voter",
        email: "Case@Example.com",
        editToken: generateToken(),
      },
      {
        pollId: poll.id,
        name: "No Email Voter",
        email: null,
        editToken: generateToken(),
      },
    ]);

    // A participant on the OTHER poll whose email equals invitation (iii)'s
    // address — the cross-poll isolation trap.
    await db.insert(participants).values({
      pollId: otherPoll.id,
      name: "Cross Poll Voter",
      email: "nomatch@example.com",
      editToken: generateToken(),
    });

    // Invitations on poll-one, inserted in a deterministic invited_at order
    // (sequential inserts => strictly increasing invited_at):
    //  (i)   exact-case match          -> responded=true
    //  (ii)  different-casing match     -> responded=true
    //  (iii) no matching participant    -> responded=false (cross-poll trap)
    //  (iv)  matches only a NULL-email  -> responded=false
    const [inv1] = await db
      .insert(invitations)
      .values({ pollId: poll.id, email: "exact@example.com" })
      .returning({ id: invitations.id });
    const [inv2] = await db
      .insert(invitations)
      .values({ pollId: poll.id, email: "case@example.com" })
      .returning({ id: invitations.id });
    const [inv3] = await db
      .insert(invitations)
      .values({ pollId: poll.id, email: "nomatch@example.com" })
      .returning({ id: invitations.id });
    const [inv4] = await db
      .insert(invitations)
      .values({ pollId: poll.id, email: "nulled@example.com" })
      .returning({ id: invitations.id });

    return {
      pollId: poll.id,
      otherPollId: otherPoll.id,
      invIds: [inv1.id, inv2.id, inv3.id, inv4.id],
    };
  }

  it("labels each invitation responded via a case-insensitive same-poll match, ordered by invited_at", async () => {
    const seed = await seedTrackingPoll();
    const rows = await getInvitationTrackingForPoll(seed.pollId);

    // One row per invitation, in invited_at (send) order.
    expect(rows.map((r) => r.email)).toEqual([
      "exact@example.com",
      "case@example.com",
      "nomatch@example.com",
      "nulled@example.com",
    ]);
    expect(rows.map((r) => r.responded)).toEqual([
      true, // (i)   exact-case match
      true, // (ii)  different-casing match
      false, // (iii) no matching participant on THIS poll
      false, // (iv)  only a NULL-email participant exists
    ]);
  });

  it("is cross-poll isolated: a same-email voter on a DIFFERENT poll never marks this poll's invitation responded (T-07-10)", async () => {
    const seed = await seedTrackingPoll();

    // Poll-one's invitation (iii) "nomatch@example.com" has NO matching
    // participant on poll-one, but the OTHER poll DOES have one — it must stay
    // responded=false here.
    const rows = await getInvitationTrackingForPoll(seed.pollId);
    const iii = rows.find((r) => r.email === "nomatch@example.com")!;
    expect(iii.responded).toBe(false);

    // And the other poll has no invitations at all -> empty.
    const otherRows = await getInvitationTrackingForPoll(seed.otherPollId);
    expect(otherRows).toEqual([]);
  });

  it("returns [] for a poll with no invitations", async () => {
    const [poll] = await db
      .insert(polls)
      .values({
        title: "No Invites Poll",
        participantUrlId: generateToken(),
        adminUrlId: generateToken(),
      })
      .returning({ id: polls.id });
    createdPollIds.push(poll.id);
    expect(await getInvitationTrackingForPoll(poll.id)).toEqual([]);
  });

  it("returns rows whose own keys are EXACTLY email/responded (structural)", async () => {
    const seed = await seedTrackingPoll();
    const rows = await getInvitationTrackingForPoll(seed.pollId);
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["email", "responded"]);
      expect(typeof r.responded).toBe("boolean");
    }
  });
});

// Admin page tests (runs against live Postgres). Asserts the page renders both
// share links plus the "Keep private" badge AND the do-not-share warning copy
// (UI-P1), and that an unknown admin token triggers notFound() / 404
// (LINK-02/LINK-03). next/navigation + next/headers are mocked so the RSC can run
// outside a Next request context.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { eq, inArray } from "drizzle-orm";

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

import AdminPage from "./page";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

type VoteState = "yes" | "ifneedbe" | "no";

async function seedPoll(overrides?: {
  description?: string | null;
  location?: string | null;
  // Participants to seed, each with votes keyed by OPTION INDEX (0 = 2026-07-12,
  // 1 = 2026-07-19). `email` seeds a leak canary (SPEC Prohibition #1).
  participants?: {
    name: string;
    email?: string | null;
    votes?: Partial<Record<number, VoteState>>;
  }[];
}) {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Admin Render Poll",
      description: overrides?.description ?? "Bring snacks",
      location: overrides?.location ?? "Tavern on Main St",
      participantUrlId,
      adminUrlId,
    })
    .returning({ id: polls.id });
  const insertedOptions = await db
    .insert(options)
    .values([
      { pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 },
      { pollId: poll.id, date: "2026-07-19", startTime: "14:00", position: 1 },
    ])
    .returning({ id: options.id, position: options.position });
  // Map option index (== position) -> id, independent of RETURNING row order.
  const optionIdByIndex = [...insertedOptions]
    .sort((a, b) => a.position - b.position)
    .map((o) => o.id);

  for (const p of overrides?.participants ?? []) {
    const [part] = await db
      .insert(participants)
      .values({
        pollId: poll.id,
        name: p.name,
        email: p.email ?? null,
        editToken: generateToken(),
      })
      .returning({ id: participants.id });
    const voteRows = Object.entries(p.votes ?? {}).map(([idx, state]) => ({
      pollId: poll.id,
      participantId: part.id,
      optionId: optionIdByIndex[Number(idx)],
      state: state as VoteState,
    }));
    if (voteRows.length) await db.insert(votes).values(voteRows);
  }

  createdAdminIds.push(adminUrlId);
  return { pollId: poll.id, participantUrlId, adminUrlId };
}

async function renderAdmin(adminUrlId: string): Promise<string> {
  const element = await AdminPage({
    params: Promise.resolve({ adminUrlId }),
  });
  return renderToStaticMarkup(element);
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

describe("AdminPage", () => {
  it("renders both share links, the Keep private badge, and the warning copy (UI-P1)", async () => {
    const { participantUrlId, adminUrlId } = await seedPoll();
    const html = await renderAdmin(adminUrlId);

    expect(html).toContain(`/p/${participantUrlId}`);
    expect(html).toContain(`/a/${adminUrlId}`);
    expect(html).toContain("Keep private");
    expect(html).toContain(
      "Do not share this link. It grants full management access to this poll.",
    );
    expect(html).toContain("Participant link");
    expect(html).toContain("Admin link");
  });

  it("renders candidate dates chronologically via the string formatter", async () => {
    const { adminUrlId } = await seedPoll();
    const html = await renderAdmin(adminUrlId);
    expect(html).toContain("Sunday, July 12");
    expect(html).toContain("Sunday, July 19 at 2:00 PM");
  });

  it("renders a title-only poll (no description/location) without error", async () => {
    const { adminUrlId } = await seedPoll({
      description: null,
      location: null,
    });
    const html = await renderAdmin(adminUrlId);
    expect(html).toContain("Admin Render Poll");
  });

  it("renders the Results section (heading, names, exact tally, Best badge) and never leaks the canary email", async () => {
    // opt-0 (2026-07-12): yes=2 (Alex, Sam), ifneedbe=1 (Jordan) -> strict best.
    // opt-1 (2026-07-19): yes=0, ifneedbe=0.
    const { adminUrlId } = await seedPoll({
      participants: [
        {
          name: "Alex Canary",
          email: "alex-canary@example.com",
          votes: { 0: "yes", 1: "no" },
        },
        { name: "Sam Ryder", votes: { 0: "yes", 1: "no" } },
        { name: "Jordan Vale", votes: { 0: "ifneedbe", 1: "no" } },
      ],
    });
    const html = await renderAdmin(adminUrlId);

    // (a) heading + every participant name render.
    expect(html).toContain("Results");
    expect(html).toContain("Alex Canary");
    expect(html).toContain("Sam Ryder");
    expect(html).toContain("Jordan Vale");
    // (b) exact tally caption for the known date column.
    expect(html).toContain("2 yes · 1 if-need-be");
    // (c) the strict yes-leader renders the Best badge.
    expect(html).toContain("Best");
    // (d) NEGATIVE, non-vacuous: the seeded participant IS rendered (name above),
    // yet the canary email never appears in the admin HTML (SPEC Prohibition #1).
    expect(html).not.toContain("alex-canary@example.com");
  });

  it("renders the 'No responses yet' empty state (no table) for a poll with zero participants", async () => {
    const { adminUrlId } = await seedPoll();
    const html = await renderAdmin(adminUrlId);
    expect(html).toContain("No responses yet");
    expect(html).not.toContain("<table");
  });

  it("calls notFound() (404) for an unknown admin token", async () => {
    await expect(renderAdmin("nonexistent-token-000000")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("calls notFound() (404) for a tampered/incremented valid token", async () => {
    const { adminUrlId } = await seedPoll();
    const tampered = adminUrlId.slice(0, -1) + (adminUrlId.endsWith("a") ? "b" : "a");
    await expect(renderAdmin(tampered)).rejects.toThrow("NEXT_NOT_FOUND");
    // sanity: a valid token is >= 21 chars (non-enumerable, LINK-03)
    const [row] = await db
      .select({ adminUrlId: polls.adminUrlId })
      .from(polls)
      .where(eq(polls.adminUrlId, adminUrlId))
      .limit(1);
    expect(row.adminUrlId.length).toBeGreaterThanOrEqual(21);
  });
});

// Participant page tests (runs against live Postgres). The load-bearing
// assertion (prohibition P2 / D-09): the rendered HTML and the query result
// NEVER contain the poll's admin_url_id. Also verifies an unknown participant
// token triggers notFound() / 404 (LINK-01). next/navigation is mocked.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { inArray } from "drizzle-orm";

vi.mock("next/navigation", () => ({
  notFound: () => {
    const err = new Error("NEXT_NOT_FOUND") as Error & { digest: string };
    err.digest = "NEXT_HTTP_ERROR_FALLBACK;404";
    throw err;
  },
}));

import ParticipantPage from "./page";
import { getPollByParticipantUrlId } from "@/lib/db/queries";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

async function seedPoll() {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Participant Render Poll",
      description: "Bring snacks",
      location: "Tavern on Main St",
      participantUrlId,
      adminUrlId,
    })
    .returning({ id: polls.id });
  await db.insert(options).values([
    { pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 },
    { pollId: poll.id, date: "2026-07-19", startTime: "14:00", position: 1 },
  ]);
  createdAdminIds.push(adminUrlId);
  return { pollId: poll.id, participantUrlId, adminUrlId };
}

async function renderParticipant(participantUrlId: string): Promise<string> {
  const element = await ParticipantPage({
    params: Promise.resolve({ participantUrlId }),
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

describe("ParticipantPage", () => {
  it("renders the poll shell with title, summary, dates, and the voting placeholder", async () => {
    const { participantUrlId } = await seedPoll();
    const html = await renderParticipant(participantUrlId);
    expect(html).toContain("Participant Render Poll");
    expect(html).toContain("Bring snacks");
    expect(html).toContain("Tavern on Main St");
    expect(html).toContain("Sunday, July 12");
    expect(html).toContain("Voting isn");
    expect(html).toContain(
      "The organizer is still setting up this poll. Check back soon.",
    );
  });

  it("NEVER exposes admin_url_id in the rendered HTML (P2)", async () => {
    const { participantUrlId, adminUrlId } = await seedPoll();
    const html = await renderParticipant(participantUrlId);
    expect(html).not.toContain(adminUrlId);
    expect(html).not.toContain("/a/");
  });

  it("participant-safe query result has no adminUrlId key (P2)", async () => {
    const { participantUrlId, adminUrlId } = await seedPoll();
    const poll = await getPollByParticipantUrlId(participantUrlId);
    expect(poll).not.toBeNull();
    expect(Object.keys(poll as object)).not.toContain("adminUrlId");
    // belt-and-suspenders: the serialized payload contains no admin token
    expect(JSON.stringify(poll)).not.toContain(adminUrlId);
  });

  it("calls notFound() (404) for an unknown participant token", async () => {
    await expect(
      renderParticipant("nonexistent-token-000000"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

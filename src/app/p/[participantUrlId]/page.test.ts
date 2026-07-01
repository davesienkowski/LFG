// Participant vote view + /thanks tests (runs against live Postgres).
//
// Load-bearing assertions:
//  - open poll renders the VoteForm (name/email inputs, "Your availability"
//    heading, grid cells with the 3-state icon+label vocabulary, submit button)
//  - closed poll renders the "Voting is closed" banner, non-interactive cells,
//    and NO submit button (server also rejects the write — see submit-response)
//  - the rendered HTML NEVER contains admin_url_id or '/a/' (prohibition P2)
//  - an unknown participant token triggers notFound() / 404
//  - /thanks surfaces the edit-link card + the explicit don't-share warning and
//    leaks no admin_url_id; a missing edit cookie 404s
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

// /thanks reads the edit cookie + request headers. Control both per test.
let mockCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      mockCookieValue !== undefined ? { value: mockCookieValue } : undefined,
  }),
  headers: async () => new Map<string, string>([["host", "lfg.test"]]),
}));

import ParticipantPage from "./page";
import ThanksPage from "./thanks/page";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

async function seedPoll(status = "open") {
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
      status,
    })
    .returning({ id: polls.id });
  const inserted = await db
    .insert(options)
    .values([
      { pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 },
      { pollId: poll.id, date: "2026-07-19", startTime: "14:00", position: 1 },
    ])
    .returning({ id: options.id });
  createdAdminIds.push(adminUrlId);
  return {
    pollId: poll.id,
    participantUrlId,
    adminUrlId,
    optionIds: inserted.map((r) => r.id),
  };
}

// Seed an existing participant + one vote row per option — the prior response the
// same-device auto-load preloads. Returns the editToken to place in the cookie.
async function seedParticipant(
  pollId: string,
  optionIds: string[],
  states: string[],
  name = "Returning",
  email: string | null = null,
): Promise<{ editToken: string }> {
  const editToken = generateToken();
  const [participant] = await db
    .insert(participants)
    .values({ pollId, name, email, editToken })
    .returning({ id: participants.id });
  await db.insert(votes).values(
    optionIds.map((optionId, i) => ({
      pollId,
      participantId: participant.id,
      optionId,
      state: states[i] ?? "no",
    })),
  );
  return { editToken };
}

async function renderParticipant(participantUrlId: string): Promise<string> {
  const element = await ParticipantPage({
    params: Promise.resolve({ participantUrlId }),
  });
  return renderToStaticMarkup(element);
}

async function renderThanks(participantUrlId: string): Promise<string> {
  const element = await ThanksPage({
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

describe("ParticipantPage — open poll", () => {
  it("renders the vote form with name/email inputs, grid cells, and a submit button", async () => {
    const { participantUrlId } = await seedPoll("open");
    const html = await renderParticipant(participantUrlId);
    expect(html).toContain("Participant Render Poll");
    expect(html).toContain("Your availability");
    expect(html).toContain("Your name");
    expect(html).toContain("Email (optional)");
    // Grid renders the untouched cells with the full "Not available" label.
    expect(html).toContain("Not available");
    // Bulk actions + submit CTA present when open.
    expect(html).toContain("Set all Available");
    expect(html).toContain("Submit availability");
  });

  it("NEVER exposes admin_url_id or '/a/' in the rendered HTML (P2)", async () => {
    const { participantUrlId, adminUrlId } = await seedPoll("open");
    const html = await renderParticipant(participantUrlId);
    expect(html).not.toContain(adminUrlId);
    expect(html).not.toContain("/a/");
  });
});

describe("ParticipantPage — closed poll", () => {
  it("renders the 'Voting is closed' banner and NO submit button", async () => {
    const { participantUrlId } = await seedPoll("closed");
    const html = await renderParticipant(participantUrlId);
    expect(html).toContain("Voting is closed");
    expect(html).toContain(
      "The organizer has closed this poll. You can no longer submit or change your availability.",
    );
    // No submit affordance and no bulk actions when read-only.
    expect(html).not.toContain("Submit availability");
    expect(html).not.toContain("Set all Available");
    // Recorded state is still visible as a label.
    expect(html).toContain("Not available");
  });
});

describe("ParticipantPage — unknown token", () => {
  it("calls notFound() (404) for an unknown participant token", async () => {
    await expect(
      renderParticipant("nonexistent-token-000000"),
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("ThanksPage", () => {
  it("surfaces the edit-link card, copy button, and the don't-share warning; no admin leak", async () => {
    const { participantUrlId, adminUrlId } = await seedPoll("open");
    mockCookieValue = "edit-token-abc123";
    const html = await renderThanks(participantUrlId);
    expect(html).toContain("Thanks for responding!");
    expect(html).toContain("Your personal link");
    expect(html).toContain("anyone who has it can change your answer");
    expect(html).toContain(`/p/${participantUrlId}/edit/edit-token-abc123`);
    expect(html).toContain("Copy edit link");
    expect(html).not.toContain(adminUrlId);
    expect(html).not.toContain("/a/");
  });

  it("404s when the edit cookie is absent (no direct-nav-without-submit)", async () => {
    const { participantUrlId } = await seedPoll("open");
    mockCookieValue = undefined;
    await expect(renderThanks(participantUrlId)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("ParticipantPage — same-device auto-load (VOTE-05)", () => {
  it("preloads the prior response and points the form at updateResponse (editToken carried, notice shown)", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll("open");
    const { editToken } = await seedParticipant(
      pollId,
      optionIds,
      ["yes", "ifneedbe"],
      "Alex",
      "alex@same.test",
    );
    mockCookieValue = editToken;
    const html = await renderParticipant(participantUrlId);

    // The same-device notice appears (informational — never auto-submits).
    expect(html).toContain(
      "Showing your previous response. Submit again to update it.",
    );
    // The editToken is carried as a hidden input so the re-submit routes through
    // updateResponse (UPDATE, not a duplicate INSERT).
    expect(html).toContain(editToken);
    // Prior name + states preloaded.
    expect(html).toContain("Alex");
    expect(html).toContain("Available");
    expect(html).toContain("If-need-be");
    // Preload only fills state — a submit affordance is still present (the user
    // must click to update; nothing is auto-submitted on load).
    expect(html).toContain("Submit availability");
  });

  it("renders the FRESH submitResponse form (no notice, no editToken) when the cookie is absent", async () => {
    const { participantUrlId } = await seedPoll("open");
    mockCookieValue = undefined;
    const html = await renderParticipant(participantUrlId);
    expect(html).not.toContain("Showing your previous response");
    expect(html).not.toContain('name="editToken"');
    expect(html).toContain("Submit availability");
  });

  it("ignores a cookie whose token belongs to a DIFFERENT poll (no cross-poll preload)", async () => {
    const other = await seedPoll("open");
    const { editToken } = await seedParticipant(
      other.pollId,
      other.optionIds,
      ["yes", "yes"],
      "Foreign",
    );
    const { participantUrlId } = await seedPoll("open");
    mockCookieValue = editToken; // valid token, wrong poll
    const html = await renderParticipant(participantUrlId);
    expect(html).not.toContain("Showing your previous response");
    expect(html).not.toContain("Foreign");
  });

  it("preload still leaks no admin_url_id", async () => {
    const { pollId, participantUrlId, optionIds, adminUrlId } =
      await seedPoll("open");
    const { editToken } = await seedParticipant(pollId, optionIds, [
      "yes",
      "no",
    ]);
    mockCookieValue = editToken;
    const html = await renderParticipant(participantUrlId);
    expect(html).not.toContain(adminUrlId);
    expect(html).not.toContain("/a/");
  });
});

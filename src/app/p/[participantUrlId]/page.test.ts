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
import { inArray, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
import {
  polls,
  options,
  participants,
  votes,
  invitations,
} from "@/lib/db/schema";
import { getInvitationTrackingForPoll } from "@/lib/db/queries";
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
    // This poll has no participant responses — unanswered dates read as
    // "No response", NOT a definite "Not available" (UX-UAT F1 on the recap).
    expect(html).toContain("No response");
    expect(html).not.toContain("Not available");
  });

  it("surfaces the finalized date on a booked poll (UX-UAT F2)", async () => {
    const { pollId, participantUrlId, optionIds } = await seedPoll("closed");
    // Finalize on the first option (2026-07-12) so the winning date resolves.
    await db
      .update(polls)
      .set({ winningOptionId: optionIds[0] })
      .where(eq(polls.id, pollId));

    const html = await renderParticipant(participantUrlId);
    // The participant learns the outcome ON-PAGE, not only by email.
    expect(html).toContain("The group is meeting");
    expect(html).toContain("Sunday, July 12");
    expect(html).not.toContain("Submit availability");
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

  it("renders a graceful 'not on this device' fallback when the edit cookie is absent (UX-UAT F3)", async () => {
    const { participantUrlId } = await seedPoll("open");
    mockCookieValue = undefined;
    // The poll EXISTS, so a misleading notFound()/"Poll not found" would be
    // wrong (F3). Instead: a friendly message + a link back to the poll, and no
    // NEXT_NOT_FOUND throw.
    const html = await renderThanks(participantUrlId);
    expect(html).toContain("couldn&#x27;t find your response on this device");
    expect(html).toContain(`/p/${participantUrlId}`);
    // Still never leaks a token/edit-link on this cookieless surface.
    expect(html).not.toContain("/edit/");
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

describe("ParticipantPage — invitation no-leak (RESP-01 / D-09 / T-07-01)", () => {
  it("NON-VACUOUS canary: a seeded invitation email is admin-visible yet ABSENT from the participant page", async () => {
    const canary = "invited-canary-do-not-leak@example.com";
    const { pollId, participantUrlId } = await seedPoll("open");
    // Record an invitation carrying the canary — exactly what 07-01 records on
    // send. It is intentionally admin-visible (getInvitationTrackingForPoll)…
    await db.insert(invitations).values({ pollId, email: canary });

    // …proven here: the admin-only tracking read DOES surface it (non-vacuous —
    // the canary genuinely exists and would render on the admin surface).
    const tracking = await getInvitationTrackingForPoll(pollId);
    expect(tracking.map((t) => t.email)).toContain(canary);

    // …but the PARTICIPANT page must never expose it (D-09 no-leak boundary).
    const html = await renderParticipant(participantUrlId);
    expect(html).not.toContain(canary);
  });

  it("no participant-facing route module imports getInvitationTrackingForPoll (grep-style)", async () => {
    // Structural guard: the invitations read is admin-only. If a future edit
    // wires it into a participant route this fails loudly.
    const participantRoutes = [
      "src/app/p/[participantUrlId]/page.tsx",
      "src/app/p/[participantUrlId]/thanks/page.tsx",
      "src/app/p/[participantUrlId]/edit/[editToken]/page.tsx",
    ];
    for (const rel of participantRoutes) {
      let source: string;
      try {
        source = readFileSync(join(process.cwd(), rel), "utf8");
      } catch {
        continue; // route file may not exist — skip
      }
      expect(source).not.toContain("getInvitationTrackingForPoll");
      expect(source).not.toContain("invitations");
    }
  });
});

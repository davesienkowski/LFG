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
  status?: string;
  // Optional organizer token. Omitted => the column stays NULL, so the subscribe
  // card is not rendered (keeps ALL pre-existing tests unaffected).
  organizerId?: string;
  // Index (0 = 2026-07-12, 1 = 2026-07-19) of the winning option to record +
  // flip the poll to closed. Used to render the finalized state.
  winningOptionIndex?: number;
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
      status: overrides?.status ?? "open",
      ...(overrides?.organizerId
        ? { organizerId: overrides.organizerId }
        : {}),
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

  if (overrides?.winningOptionIndex !== undefined) {
    await db
      .update(polls)
      .set({ winningOptionId: optionIdByIndex[overrides.winningOptionIndex] })
      .where(eq(polls.id, poll.id));
  }

  createdAdminIds.push(adminUrlId);
  return { pollId: poll.id, participantUrlId, adminUrlId };
}

async function renderAdmin(
  adminUrlId: string,
  searchParams: { created?: string } = {},
): Promise<string> {
  const element = await AdminPage({
    params: Promise.resolve({ adminUrlId }),
    searchParams: Promise.resolve(searchParams),
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

  it("renders the 'Your polls' (/polls) and 'Create a poll' (/) entry links (MYP-06)", async () => {
    const { adminUrlId } = await seedPoll();
    const html = await renderAdmin(adminUrlId);

    // Both entry links are static paths — no token embedded (T-06-09).
    expect(html).toContain('href="/polls"');
    expect(html).toContain("Your polls");
    expect(html).toContain('href="/"');
    expect(html).toContain("Create a poll");
  });

  it("shows the one-time 'poll created' banner only with ?created=1 (UX-UAT F5)", async () => {
    const { adminUrlId } = await seedPoll();

    const created = await renderAdmin(adminUrlId, { created: "1" });
    expect(created).toContain("Poll created");
    expect(created).toContain("Share the participant link below");

    // A later visit / refresh without the flag drops the banner.
    const plain = await renderAdmin(adminUrlId);
    expect(plain).not.toContain("Poll created");
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

    // (a) heading + the DEFAULT-visible participants render. The results grid
    // now defaults to "Best day + Available" (260703-r8r rework), so only
    // participants available on the best day appear in the initial SSR; Jordan
    // (if-need-be on the best day) is filtered out of the default view.
    expect(html).toContain("Results");
    expect(html).toContain("Alex Canary");
    expect(html).toContain("Sam Ryder");
    // The DESKTOP table default-filters Jordan (if-need-be on the best day), but
    // the UNFILTERED mobile date-cards list him (260703-wfm). Scope the negative
    // to the table markup, and assert his positive presence in the full HTML.
    const tableHtml = html.slice(
      html.indexOf("<table"),
      html.indexOf("</table>") + 8,
    );
    expect(tableHtml).not.toContain("Jordan Vale"); // desktop table default-filters him
    expect(html).toContain("Jordan Vale"); // present in the unfiltered mobile card
    // (b) exact tally caption for the known date column (headers are unfiltered).
    expect(html).toContain("2 yes · 1 if-need-be");
    // (c) the strict yes-leader renders the Best badge.
    expect(html).toContain("Best");
    // (d) NEGATIVE, non-vacuous: Alex Canary IS rendered (name above), yet the
    // canary email never appears in the admin HTML (SPEC Prohibition #1).
    expect(html).not.toContain("alex-canary@example.com");
  });

  it("renders the 'No responses yet' empty state (no table) for a poll with zero participants", async () => {
    const { adminUrlId } = await seedPoll();
    const html = await renderAdmin(adminUrlId);
    expect(html).toContain("No responses yet");
    expect(html).not.toContain("<table");
  });

  it("renders the Book-it picker (not the finalized card) for an open poll, with no Booked badge (FNL-01)", async () => {
    const { adminUrlId } = await seedPoll({
      participants: [{ name: "Alex", votes: { 0: "yes", 1: "no" } }],
    });
    const html = await renderAdmin(adminUrlId);

    // Picker state renders; finalized state and Booked badge do not.
    expect(html).toContain("Book it");
    expect(html).toContain("Candidate dates");
    expect(html).toContain("Book this date");
    expect(html).not.toContain("Poll finalized");
    expect(html).not.toContain("Booked");
    // The best day (opt-0, the strict yes-leader) is pre-selected + Suggested.
    expect(html).toContain("Suggested");
  });

  it("renders the finalized card + Booked badge (not the picker) for a closed poll (FNL-02)", async () => {
    const { adminUrlId } = await seedPoll({
      status: "closed",
      winningOptionIndex: 1, // 2026-07-19 at 14:00
      participants: [{ name: "Alex", votes: { 0: "no", 1: "yes" } }],
    });
    const html = await renderAdmin(adminUrlId);

    // Finalized state renders; picker does not.
    expect(html).toContain("Poll finalized");
    expect(html).toContain("Booked");
    expect(html).toContain("Sunday, July 19 at 2:00 PM is booked.");
    // Best-effort framing — "should get", never "was notified" (D-09 / UI-SPEC).
    expect(html).toContain("should get a confirmation");
    expect(html).not.toContain("was notified");
    // The picker + its confirm control are gone once closed. (The candidate-date
    // ECHO — a <details><summary>Candidate dates (N)</summary> — still renders on
    // every poll, so target the picker's <legend> to prove the picker is absent
    // without colliding with the echo summary text.)
    expect(html).not.toContain("Book this date");
    expect(html).not.toContain("<legend");
  });

  it("renders the neutral subscribe card for a poll WITH an organizerId (no second Keep-private badge) (LD-6)", async () => {
    const organizerId = generateToken();
    const { adminUrlId } = await seedPoll({ organizerId });
    const html = await renderAdmin(adminUrlId);

    expect(html).toContain(`/feed/${organizerId}/calendar.ics`);
    expect(html).toContain("Subscribe to your booked-dates calendar");
    // MYP-08: the shared SubscribeCard carries the same-browser guidance, so the
    // admin surface shows it from the single source of truth after the swap.
    expect(html).toContain("Create your polls from the same browser");
    // The subscribe card is NEUTRAL — it must not add a SECOND "Keep private"
    // badge (only the admin-link card carries the single one).
    expect(html.split("Keep private").length - 1).toBe(1);
  });

  it("renders NO subscribe card for a legacy poll WITHOUT an organizerId (null)", async () => {
    const { adminUrlId } = await seedPoll();
    const html = await renderAdmin(adminUrlId);

    expect(html).not.toContain("/feed/");
    expect(html).not.toContain("Subscribe to your booked-dates calendar");
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

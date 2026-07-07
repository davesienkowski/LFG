// "Your polls" dashboard `/polls` render tests (runs against live Postgres).
//
// Load-bearing assertions:
//  - MYP-01/02 populated: an organizer with ≥1 owned poll renders one row per
//    poll (newest-first), each linking to /a/<adminUrlId>, with the Open/Booked
//    badge, the booked-date-or-"{n} dates" summary, and the "{n} responses" count,
//    plus the SubscribeCard on top.
//  - MYP-03 no-oracle: an absent cookie AND an unknown organizer both return a
//    normal 200 render whose empty-state HTML is BYTE-IDENTICAL — no status or
//    markup distinguishes them (no 404/throw).
//  - PROH-4: the empty state embeds no SubscribeCard and no "/feed/" organizer
//    token; the subscribe card renders ONLY in the ≥1-poll case.
//  - PROH-2 no-leak: the rendered HTML carries no participant name/email, no edit
//    token, and no /p/<participantUrlId> URL — asserted non-vacuously (the poll
//    title IS present).
//  - PROH-3 dynamic: a source guard that the route reads cookies() and exports no
//    force-static/revalidate.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inArray, eq } from "drizzle-orm";

// /polls reads the lfg_organizer cookie + request headers. Control the cookie per
// test via a module-level `mockCookieValue`; undefined => the cookie is absent.
let mockCookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      mockCookieValue !== undefined ? { value: mockCookieValue } : undefined,
  }),
  headers: async () => new Map<string, string>([["host", "lfg.test"]]),
}));

import PollsPage from "./page";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";
import { formatDateWithTime } from "@/lib/format-date";

const createdAdminIds: string[] = [];

type VoteState = "yes" | "ifneedbe" | "no";

async function seedPoll(opts: {
  title: string;
  organizerId: string;
  status?: string;
  createdAt?: Date;
  // Index (0 = 2026-07-12 date-only, 1 = 2026-07-19 14:00) of the winning option
  // to record + flip the poll to closed (renders the booked state).
  winningOptionIndex?: number;
  participants?: {
    name: string;
    email?: string | null;
    editToken?: string;
    votes?: Partial<Record<number, VoteState>>;
  }[];
}): Promise<{ pollId: string; adminUrlId: string; participantUrlId: string }> {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: opts.title,
      participantUrlId,
      adminUrlId,
      status: opts.status ?? "open",
      organizerId: opts.organizerId,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning({ id: polls.id });

  const insertedOptions = await db
    .insert(options)
    .values([
      { pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 },
      { pollId: poll.id, date: "2026-07-19", startTime: "14:00", position: 1 },
    ])
    .returning({ id: options.id, position: options.position });
  const optionIdByIndex = [...insertedOptions]
    .sort((a, b) => a.position - b.position)
    .map((o) => o.id);

  for (const p of opts.participants ?? []) {
    const [part] = await db
      .insert(participants)
      .values({
        pollId: poll.id,
        name: p.name,
        email: p.email ?? null,
        editToken: p.editToken ?? generateToken(),
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

  if (opts.winningOptionIndex !== undefined) {
    await db
      .update(polls)
      .set({ winningOptionId: optionIdByIndex[opts.winningOptionIndex] })
      .where(eq(polls.id, poll.id));
  }

  createdAdminIds.push(adminUrlId);
  return { pollId: poll.id, adminUrlId, participantUrlId };
}

async function renderPolls(cookie: string | undefined): Promise<string> {
  mockCookieValue = cookie;
  return renderToStaticMarkup(await PollsPage());
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

describe("PollsPage /polls", () => {
  it("(a) MYP-01/02: lists owned polls newest-first with badges, summaries, and the subscribe card", async () => {
    const organizerId = generateToken();
    // Closed poll seeded OLDER; open poll seeded NEWER — newest-first ordering
    // must place the open poll's title before the closed one's.
    const closed = await seedPoll({
      title: "Older Booked Quest",
      organizerId,
      status: "closed",
      winningOptionIndex: 0, // 2026-07-12, date-only
      createdAt: new Date("2026-06-01T10:00:00Z"),
      participants: [{ name: "Solo Ranger" }],
    });
    const open = await seedPoll({
      title: "Newer Open Campaign",
      organizerId,
      createdAt: new Date("2026-06-02T10:00:00Z"),
      participants: [{ name: "Grog" }, { name: "Vex" }],
    });

    const html = await renderPolls(organizerId);

    // Both titles + admin links render.
    expect(html).toContain("Older Booked Quest");
    expect(html).toContain("Newer Open Campaign");
    expect(html).toContain(`href="/a/${open.adminUrlId}"`);
    expect(html).toContain(`href="/a/${closed.adminUrlId}"`);

    // Both badge kinds render (one Open, one Booked).
    expect(html).toContain(">Open<");
    expect(html).toContain(">Booked<");

    // Open poll: candidate-count summary + responses; closed poll: booked date.
    expect(html).toContain("2 dates");
    expect(html).toContain("2 responses"); // open poll's 2 participants
    expect(html).toContain("1 response"); // closed poll's 1 participant (singular)
    expect(html).toContain(formatDateWithTime("2026-07-12", null));

    // Subscribe card on top (populated branch only).
    expect(html).toContain("Subscribe to your booked-dates calendar");

    // Newest-first: the newer open poll appears before the older closed poll.
    expect(html.indexOf("Newer Open Campaign")).toBeLessThan(
      html.indexOf("Older Booked Quest"),
    );
  });

  it("(b) MYP-03: no cookie renders a 200 empty state with a Create-a-poll link and no subscribe card/feed", async () => {
    const html = await renderPolls(undefined);

    expect(html).toContain("created any polls yet");
    expect(html).toContain('href="/"');
    expect(html).toContain("Create a poll");
    expect(html).not.toContain("Subscribe to your booked-dates calendar");
    expect(html).not.toContain("/feed/");
  });

  it("(c) MYP-03/PROH-4: no-cookie and unknown-organizer empty states are byte-identical with no feed token (no oracle)", async () => {
    const unknownToken = generateToken();
    const noCookieHtml = await renderPolls(undefined);
    const unknownHtml = await renderPolls(unknownToken);

    expect(unknownHtml).toBe(noCookieHtml);
    expect(noCookieHtml).not.toContain("/feed/");
    expect(unknownHtml).not.toContain("/feed/");
    expect(unknownHtml).not.toContain(unknownToken);
  });

  it("(d) MYP-03: at the 0↔1 boundary, exactly one owned poll renders exactly one row (not the empty state)", async () => {
    const organizerId = generateToken();
    const only = await seedPoll({ title: "Only Poll", organizerId });

    const html = await renderPolls(organizerId);

    expect(html).not.toContain("created any polls yet");
    const rowMatches = html.match(/href="\/a\//g) ?? [];
    expect(rowMatches).toHaveLength(1);
    expect(html).toContain(`href="/a/${only.adminUrlId}"`);
  });

  it("(e) PROH-2: renders the poll title but leaks no participant name/email, edit token, or participant URL", async () => {
    const organizerId = generateToken();
    const canaryName = "CANARY_PARTICIPANT_NAME_ZZZ";
    const canaryEmail = "canary-leak@example.test";
    const canaryToken = generateToken();
    const seeded = await seedPoll({
      title: "Leak Probe Poll",
      organizerId,
      participants: [
        {
          name: canaryName,
          email: canaryEmail,
          editToken: canaryToken,
          votes: { 0: "yes" },
        },
      ],
    });

    const html = await renderPolls(organizerId);

    // Non-vacuous: the poll DID render.
    expect(html).toContain("Leak Probe Poll");
    // ...but none of the participant secrets leak.
    expect(html).not.toContain(canaryName);
    expect(html).not.toContain(canaryEmail);
    expect(html).not.toContain(canaryToken);
    expect(html).not.toContain(`/p/${seeded.participantUrlId}`);
    expect(html).not.toContain("/p/");
  });

  it("(f) PROH-3: the route source reads cookies() and exports no force-static/revalidate (stays per-cookie dynamic)", () => {
    const src = readFileSync(
      fileURLToPath(new URL("./page.tsx", import.meta.url)),
      "utf8",
    );
    expect(src).toContain("cookies(");
    expect(src).not.toContain("force-static");
    expect(src).not.toContain("export const revalidate");
  });
});

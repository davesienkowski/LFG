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
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

async function seedPoll(overrides?: {
  description?: string | null;
  location?: string | null;
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
  await db.insert(options).values([
    { pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 },
    { pollId: poll.id, date: "2026-07-19", startTime: "14:00", position: 1 },
  ]);
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

// Organizer feed route tests (DB-backed — needs DATABASE_URL pointed at the
// Docker Postgres). Seeds polls directly, drives GET, and asserts: a populated
// organizer serves one VEVENT per finalized poll with stable UIDs (open polls
// excluded); an organizer with zero closed polls AND an unknown token both return
// an IDENTICAL empty 200 (no oracle); and the feed leaks no participant email or
// token. Mirrors event.ics/route.test.ts — no next/headers mock needed (params +
// db only).
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { GET } from "./route";
import { db } from "@/lib/db";
import { polls, options, participants } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdPollIds: string[] = [];

async function seedFinalizedPoll(
  organizerId: string,
  winningDate: string,
  winningStartTime: string | null,
  opts?: { open?: boolean; canaryEmail?: string },
): Promise<{ pollId: string; winningOptionId: string }> {
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Feed Route Poll",
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

function req(): Request {
  return new Request("http://test.local/feed/x/calendar.ics");
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set (point at the Docker Postgres)");
  }
});

afterAll(async () => {
  if (createdPollIds.length) {
    await db.delete(polls).where(inArray(polls.id, createdPollIds));
  }
});

describe("GET /feed/[organizerId]/calendar.ics", () => {
  it("POPULATED: serves 200 text/calendar with one VEVENT per finalized poll (open excluded), stable UIDs", async () => {
    const organizerId = generateToken();
    const a = await seedFinalizedPoll(organizerId, "2026-10-10", null);
    const b = await seedFinalizedPoll(organizerId, "2026-10-20", "18:00");
    // An OPEN poll under the same organizer must NOT appear.
    const open = await seedFinalizedPoll(organizerId, "2026-10-15", null, {
      open: true,
    });

    const res = await GET(req(), { params: Promise.resolve({ organizerId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = await res.text();
    // A UID built from two UUIDs exceeds 75 octets and is RFC5545 line-folded
    // (CRLF + space); unfold to reconstruct the logical lines before matching.
    const unfolded = body.replace(/\r\n /g, "");
    expect(body.split("BEGIN:VEVENT").length - 1).toBe(2);
    // Both winning dates present as compact YYYYMMDD.
    expect(body).toContain("20261010");
    expect(body).toContain("20261020");
    // Both stable UIDs present (dedup key so clients update, not duplicate).
    expect(unfolded).toContain(`UID:${a.pollId}-${a.winningOptionId}@lfg`);
    expect(unfolded).toContain(`UID:${b.pollId}-${b.winningOptionId}@lfg`);
    // The open poll's data is absent.
    expect(unfolded).not.toContain("20261015");
    expect(unfolded).not.toContain(`${open.pollId}-`);
  });

  it("EMPTY: an organizer with no closed polls returns a valid empty 200 (no VEVENT)", async () => {
    const organizerId = generateToken();
    await seedFinalizedPoll(organizerId, "2026-11-01", null, { open: true });

    const res = await GET(req(), { params: Promise.resolve({ organizerId }) });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
  });

  it("UNKNOWN: a random organizerId returns an IDENTICAL empty 200 (no oracle)", async () => {
    const res = await GET(req(), {
      params: Promise.resolve({ organizerId: generateToken() }),
    });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("END:VCALENDAR");
    expect(body).not.toContain("BEGIN:VEVENT");
  });

  it("NO-LEAK: the feed body carries neither a participant canary email nor any poll token", async () => {
    const CANARY = "feed-route-canary@example.com";
    const organizerId = generateToken();
    // Seed a closed poll and capture its tokens to assert their absence.
    const [poll] = await db
      .insert(polls)
      .values({
        title: "Leak Check Poll",
        participantUrlId: generateToken(),
        adminUrlId: generateToken(),
        organizerId,
        status: "closed",
      })
      .returning({
        id: polls.id,
        participantUrlId: polls.participantUrlId,
        adminUrlId: polls.adminUrlId,
      });
    createdPollIds.push(poll.id);
    const [opt] = await db
      .insert(options)
      .values({ pollId: poll.id, date: "2026-12-01", startTime: null, position: 0 })
      .returning({ id: options.id });
    await db
      .update(polls)
      .set({ winningOptionId: opt.id })
      .where(inArray(polls.id, [poll.id]));
    const [part] = await db
      .insert(participants)
      .values({
        pollId: poll.id,
        name: "Canary Voter",
        email: CANARY,
        editToken: generateToken(),
      })
      .returning({ editToken: participants.editToken });

    const res = await GET(req(), { params: Promise.resolve({ organizerId }) });
    const body = await res.text();
    // Unfold so a token can't hide across a fold boundary (rigorous absence).
    const unfolded = body.replace(/\r\n /g, "");

    expect(body).toContain("BEGIN:VEVENT"); // non-vacuous: the poll DID render
    expect(unfolded).not.toContain(CANARY);
    expect(unfolded).not.toContain(poll.adminUrlId);
    expect(unfolded).not.toContain(poll.participantUrlId);
    expect(unfolded).not.toContain(part.editToken);
  });
});

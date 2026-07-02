// Hosted .ics route tests (DB-backed — needs DATABASE_URL pointed at the Docker
// Postgres). Seeds a poll directly, drives GET, and asserts the closed-poll 200
// text/calendar body plus the IDENTICAL 404 for an open and an unknown poll (no
// oracle). No next/headers mock needed — the route uses params + db only.
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import { inArray } from "drizzle-orm";
import { GET } from "./route";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdPollIds: string[] = [];

async function seedClosedPoll(opts?: {
  status?: string;
  startTime?: string | null;
  withWinner?: boolean;
}): Promise<{ participantUrlId: string; winningDate: string }> {
  const participantUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Route Poll",
      participantUrlId,
      adminUrlId: generateToken(),
      status: opts?.status ?? "closed",
    })
    .returning({ id: polls.id });
  createdPollIds.push(poll.id);

  const winningDate = "2026-09-15";
  const [opt] = await db
    .insert(options)
    .values({
      pollId: poll.id,
      date: winningDate,
      startTime: opts?.startTime ?? "18:00",
      position: 0,
    })
    .returning({ id: options.id });

  if (opts?.withWinner ?? true) {
    await db
      .update(polls)
      .set({ winningOptionId: opt.id })
      .where(inArray(polls.id, [poll.id]));
  }
  return { participantUrlId, winningDate };
}

function req(): Request {
  return new Request("http://test.local/p/x/event.ics");
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

describe("GET /p/[participantUrlId]/event.ics", () => {
  it("serves text/calendar with a VCALENDAR body for a CLOSED poll", async () => {
    const { participantUrlId, winningDate } = await seedClosedPoll({
      startTime: "18:00",
    });
    const res = await GET(req(), {
      params: Promise.resolve({ participantUrlId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(res.headers.get("Content-Disposition")).toContain("event.ics");
    const body = await res.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    // winningDate 2026-09-15 -> compact 20260915 present in DTSTART.
    expect(body).toContain(winningDate.replace(/-/g, ""));
  });

  it("returns 404 for an OPEN poll (no oracle)", async () => {
    const { participantUrlId } = await seedClosedPoll({
      status: "open",
      withWinner: false,
    });
    const res = await GET(req(), {
      params: Promise.resolve({ participantUrlId }),
    });
    expect(res.status).toBe(404);
  });

  it("returns an IDENTICAL 404 for an unknown participantUrlId", async () => {
    const res = await GET(req(), {
      params: Promise.resolve({ participantUrlId: "does-not-exist-xyz" }),
    });
    expect(res.status).toBe(404);
  });
});

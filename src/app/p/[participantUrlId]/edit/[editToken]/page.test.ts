// Edit view tests `/p/[participantUrlId]/edit/[editToken]` (runs against live
// Postgres). Load-bearing assertions:
//  - a valid edit link preloads the VoteForm ("Save changes", prior states shown)
//  - a garbage token AND a well-formed-but-unknown 21-char token BOTH throw the
//    IDENTICAL NEXT_NOT_FOUND — no distinguishing copy / no token-format oracle
//    (T-02-08)
//  - the rendered HTML NEVER contains admin_url_id, '/a/', or another
//    participant's email (P2 + email non-disclosure)
//  - a closed poll renders read-only: "Voting is closed", non-interactive cells,
//    and NO "Save changes" submit button
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

import EditParticipantPage from "./page";
import { db } from "@/lib/db";
import { polls, options, participants, votes } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

const createdAdminIds: string[] = [];

async function seedPollWithParticipant(opts?: {
  status?: string;
  targetEmail?: string | null;
  states?: string[];
}): Promise<{
  participantUrlId: string;
  adminUrlId: string;
  editToken: string;
  optionIds: string[];
  otherEmail: string;
}> {
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();
  const [poll] = await db
    .insert(polls)
    .values({
      title: "Edit Render Poll",
      description: "Bring dice",
      location: "The Keep",
      participantUrlId,
      adminUrlId,
      status: opts?.status ?? "open",
    })
    .returning({ id: polls.id });
  const inserted = await db
    .insert(options)
    .values([
      { pollId: poll.id, date: "2026-07-12", startTime: null, position: 0 },
      { pollId: poll.id, date: "2026-07-19", startTime: "14:00", position: 1 },
    ])
    .returning({ id: options.id });
  const optionIds = inserted.map((r) => r.id);

  // The target participant (whose edit link we render).
  const editToken = generateToken();
  const [target] = await db
    .insert(participants)
    .values({
      pollId: poll.id,
      name: "Target",
      email: opts?.targetEmail ?? null,
      editToken,
    })
    .returning({ id: participants.id });
  const states = opts?.states ?? ["yes", "ifneedbe"];
  await db.insert(votes).values(
    optionIds.map((optionId, i) => ({
      pollId: poll.id,
      participantId: target.id,
      optionId,
      state: states[i] ?? "no",
    })),
  );

  // A SECOND participant with a distinctive email — must never leak into the
  // target's edit surface.
  const otherEmail = `other-${generateToken()}@secret.test`;
  const [other] = await db
    .insert(participants)
    .values({
      pollId: poll.id,
      name: "Other",
      email: otherEmail,
      editToken: generateToken(),
    })
    .returning({ id: participants.id });
  await db.insert(votes).values(
    optionIds.map((optionId) => ({
      pollId: poll.id,
      participantId: other.id,
      optionId,
      state: "no",
    })),
  );

  createdAdminIds.push(adminUrlId);
  return { participantUrlId, adminUrlId, editToken, optionIds, otherEmail };
}

async function renderEdit(
  participantUrlId: string,
  editToken: string,
): Promise<string> {
  const element = await EditParticipantPage({
    params: Promise.resolve({ participantUrlId, editToken }),
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

describe("EditParticipantPage — valid token", () => {
  it("preloads the prior response with a 'Save changes' CTA and 'Edit your availability' heading", async () => {
    const { participantUrlId, editToken } = await seedPollWithParticipant();
    const html = await renderEdit(participantUrlId, editToken);
    expect(html).toContain("Edit Render Poll");
    expect(html).toContain("Edit your availability");
    expect(html).toContain("Save changes");
    // Prior states preloaded into the grid (yes -> "Available", ifneedbe ->
    // "If-need-be").
    expect(html).toContain("Available");
    expect(html).toContain("If-need-be");
    // The editToken is carried as a hidden input for updateResponse ownership.
    expect(html).toContain(editToken);
  });

  it("NEVER exposes admin_url_id, '/a/', or another participant's email (P2)", async () => {
    const { participantUrlId, editToken, adminUrlId, otherEmail } =
      await seedPollWithParticipant({ targetEmail: "target@edit.test" });
    const html = await renderEdit(participantUrlId, editToken);
    // The target's OWN email is preloaded (expected); a foreign participant's is not.
    expect(html).toContain("target@edit.test");
    expect(html).not.toContain(otherEmail);
    expect(html).not.toContain(adminUrlId);
    expect(html).not.toContain("/a/");
  });
});

describe("EditParticipantPage — bad token (no oracle, T-02-08)", () => {
  it("throws the IDENTICAL 404 for a garbage token and a well-formed-but-unknown token", async () => {
    const { participantUrlId } = await seedPollWithParticipant();

    // Garbage (malformed) token.
    const garbage = renderEdit(participantUrlId, "not-a-real-token").then(
      () => "RENDERED",
      (e) => (e as Error).message,
    );
    // Well-formed 21-char nanoid that simply does not exist.
    const wellFormed = renderEdit(participantUrlId, generateToken()).then(
      () => "RENDERED",
      (e) => (e as Error).message,
    );

    const [gMsg, wMsg] = await Promise.all([garbage, wellFormed]);
    expect(gMsg).toBe("NEXT_NOT_FOUND");
    expect(wMsg).toBe("NEXT_NOT_FOUND");
    // Identical surface — no distinguishing copy between the two branches.
    expect(gMsg).toBe(wMsg);
  });

  it("404s for a valid token presented on a DIFFERENT poll's edit URL (wrong-poll cross-check)", async () => {
    const a = await seedPollWithParticipant();
    const b = await seedPollWithParticipant();
    // b's token on a's participantUrlId -> pollId mismatch -> notFound.
    await expect(renderEdit(a.participantUrlId, b.editToken)).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});

describe("EditParticipantPage — closed poll", () => {
  it("renders read-only: 'Voting is closed', no 'Save changes' button, prior state still visible", async () => {
    const { participantUrlId, editToken } = await seedPollWithParticipant({
      status: "closed",
    });
    const html = await renderEdit(participantUrlId, editToken);
    expect(html).toContain("Voting is closed");
    expect(html).not.toContain("Save changes");
    // Recorded state is still visible as a non-interactive label.
    expect(html).toContain("Available");
    // No interactive submit button element.
    expect(html).not.toContain('type="submit"');
  });
});

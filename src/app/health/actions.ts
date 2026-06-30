"use server";

// Walking-skeleton probe (SKELETON.md). Proves Next.js Server Action + Drizzle
// dual-driver client + Postgres work end-to-end inside Docker Desktop.
//
// This is a DELIBERATELY hardcoded diagnostic — MVP walking skeleton, no
// validation, no user input persisted. The real validated createPoll lands in
// plan 01-02. This route never touches the surfaces 01-02 owns (/, /a, /p).
import { count, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls, options } from "@/lib/db/schema";
import { generateToken } from "@/lib/tokens";

export type SkeletonResult = {
  wrote: {
    pollId: string;
    participantUrlId: string;
    adminUrlId: string;
  };
  read: {
    pollCount: number;
    latestParticipantUrlId: string;
    latestAdminUrlId: string;
  };
};

export async function runSkeletonCheck(): Promise<SkeletonResult> {
  // --- REAL WRITE ---
  // Two independent tokens (never derive one from the other — D-07 / P1).
  const participantUrlId = generateToken();
  const adminUrlId = generateToken();

  const [poll] = await db
    .insert(polls)
    .values({
      title: "Skeleton check",
      participantUrlId,
      adminUrlId,
    })
    .returning({ id: polls.id });

  await db.insert(options).values({
    pollId: poll.id,
    date: "2025-07-12", // hardcoded date-only string (skeleton probe)
    position: 0,
  });

  // --- REAL READ ---
  const [{ value: pollCount }] = await db
    .select({ value: count() })
    .from(polls);

  const [latest] = await db
    .select({
      participantUrlId: polls.participantUrlId,
      adminUrlId: polls.adminUrlId,
    })
    .from(polls)
    .orderBy(desc(polls.createdAt))
    .limit(1);

  return {
    wrote: { pollId: poll.id, participantUrlId, adminUrlId },
    read: {
      pollCount,
      latestParticipantUrlId: latest.participantUrlId,
      latestAdminUrlId: latest.adminUrlId,
    },
  };
}

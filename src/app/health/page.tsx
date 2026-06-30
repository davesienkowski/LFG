// Walking-skeleton health route (SKELETON.md). RSC page performs an independent
// READ on load (count of polls) — proving the server-side DB path works — and
// renders the client probe that performs a full write+read round-trip on click.
//
// Temporary diagnostic only. It does not touch the surfaces plan 01-02 owns
// (/, /a/[adminUrlId], /p/[participantUrlId]).
import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { polls } from "@/lib/db/schema";
import { SkeletonCheck } from "./skeleton-check";

// Always run fresh against the DB — never statically cache the skeleton read.
export const dynamic = "force-dynamic";

export default async function HealthPage() {
  const [{ value: pollCount }] = await db
    .select({ value: count() })
    .from(polls);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-12">
      <h1 className="text-3xl font-semibold leading-tight">
        Walking Skeleton — database health
      </h1>
      <p className="text-base leading-relaxed text-muted-foreground">
        This page reads the live database on load and lets you run a full
        write + read round-trip against the Dockerized Postgres.
      </p>

      <div className="rounded-lg border bg-card p-4 text-sm">
        <p className="font-semibold">Server-side read on load</p>
        <p>polls currently in the database: {pollCount}</p>
      </div>

      <SkeletonCheck />
    </main>
  );
}

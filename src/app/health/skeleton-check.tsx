"use client";

// Client probe for the walking skeleton. Clicking the button invokes the
// runSkeletonCheck Server Action (a real DB write + read) and renders the
// returned write/read result in the browser.
import { useState, useTransition } from "react";
import { runSkeletonCheck, type SkeletonResult } from "./actions";
import { Button } from "@/components/ui/button";

export function SkeletonCheck() {
  const [result, setResult] = useState<SkeletonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onClick() {
    setError(null);
    startTransition(async () => {
      try {
        const r = await runSkeletonCheck();
        setResult(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Button onClick={onClick} disabled={isPending} className="w-fit">
        {isPending ? "Running database check…" : "Run database check"}
      </Button>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          Database check failed: {error}
        </p>
      )}

      {result && (
        <div className="rounded-lg border bg-muted p-4 text-sm">
          <p className="font-semibold">Write OK — inserted poll {result.wrote.pollId}</p>
          <p>participantUrlId: {result.wrote.participantUrlId}</p>
          <p>adminUrlId: {result.wrote.adminUrlId}</p>
          <p className="mt-2 font-semibold">
            Read OK — {result.read.pollCount} poll(s) in the database
          </p>
          <p>latest participantUrlId: {result.read.latestParticipantUrlId}</p>
          <p>latest adminUrlId: {result.read.latestAdminUrlId}</p>
        </div>
      )}
    </div>
  );
}

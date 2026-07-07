"use client";

// NudgeControl (RESP-02) — the "Nudge non-respondents" client island nested
// inside WhosRespondedCard. Mirrors InviteByEmailForm's mechanics exactly:
// useActionState + a hidden-input <form> + an aria-live result-chip list that
// fully replaces itself on each submit.
//
// Load-bearing invariants:
//  - Prohibition Probe #1 / T-07-02: the <form> submits ONLY adminUrlId — never a
//    client-rendered recipient list. nudgeNonRespondents re-queries the current
//    non-respondents server-side; this control's badge list is just a snapshot.
//  - Zero non-respondents: the button is DISABLED and the positive completion
//    copy "Everyone's responded — nothing to nudge." is shown (visible, not
//    hidden — a state the organizer should see).
//  - Result chips reuse the SHARED SEND_STATUS_META (icon + label + palette),
//    never color alone (WCAG 1.4.1).
//  - The action's form-level notice (e.g. a closed-poll guard) surfaces via the
//    same role="alert" pattern as InviteByEmailForm's formError.
import { useActionState } from "react";
import {
  nudgeNonRespondents,
} from "@/lib/actions/nudge-non-respondents";
import type { SendInvitesState } from "@/lib/actions/send-invites";
import { Button } from "@/components/ui/button";
import { SEND_STATUS_META } from "@/components/send-status-meta";
import { cn } from "@/lib/utils";

export function NudgeControl({
  adminUrlId,
  nonRespondentCount,
}: {
  adminUrlId: string;
  nonRespondentCount: number;
}) {
  const [state, formAction, isPending] = useActionState<
    SendInvitesState,
    FormData
  >(nudgeNonRespondents, null);

  const results = state?.results ?? [];
  const formError = state?.errors?._form?.[0];
  const nothingToNudge = nonRespondentCount === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Prohibition Probe #1: the ONLY field is adminUrlId — the server
          re-derives the recipient set. No recipient list is submitted. */}
      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="adminUrlId" value={adminUrlId} />

        {formError ? (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            className="h-11"
            disabled={isPending || nothingToNudge}
          >
            {isPending ? "Nudging…" : "Nudge non-respondents"}
          </Button>
          {nothingToNudge ? (
            <span className="text-sm text-muted-foreground">
              Everyone&apos;s responded — nothing to nudge.
            </span>
          ) : null}
        </div>
      </form>

      {/* Per-recipient results — one chip per nudged address, replaced entirely
          on the next submit. Identical mechanic to the invite results list. */}
      {results.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-live="polite">
          {results.map((r) => {
            const meta = SEND_STATUS_META[r.status];
            const Icon = meta.icon;
            return (
              <li
                key={r.email}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="font-semibold">{r.email}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                    meta.className,
                  )}
                >
                  <Icon aria-hidden className="size-3.5" />
                  {r.message ?? meta.label}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

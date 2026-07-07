"use client";

// InviteByEmailForm (UI-SPEC "Invite-by-email Card", MAIL-01/02, D-05/D-06).
// The organizer's send-invites island — modeled on vote-form.tsx's
// useActionState + hidden-input pattern. Sends run synchronously inside the
// sendInvites server action (D-06); the per-recipient result list renders once
// the action returns.
//
// Accessibility invariants (carried from Phase 2/3):
//  - Every result chip communicates via a lucide icon AND a text label, never
//    color alone (SEND_STATUS_META).
//  - The result list is an aria-live="polite" region so the outcome is announced
//    once without navigating back to the form.
//  - The textarea has an associated <Label htmlFor>; textarea + button share the
//    isPending disabled state (no partial-submit).
//  - Re-submitting replaces the prior result list (no accumulation).
import { useActionState } from "react";
import {
  sendInvites,
  type SendInvitesState,
} from "@/lib/actions/send-invites";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
// Shared chip metadata — icon + label + palette (never color alone). Extracted
// to send-status-meta.ts so NudgeControl reuses the identical styling with no
// restyle to these invite chips.
import { SEND_STATUS_META } from "@/components/send-status-meta";

export function InviteByEmailForm({ adminUrlId }: { adminUrlId: string }) {
  const [state, formAction, isPending] = useActionState<
    SendInvitesState,
    FormData
  >(sendInvites, null);

  const results = state?.results ?? [];
  const formError = state?.errors?._form?.[0];

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-col gap-1">
        <h3 className="text-2xl font-semibold leading-snug">Invite by email</h3>
        <p className="text-base text-muted-foreground">
          Enter one or more email addresses (comma or newline separated). Each
          person gets their own invite — no one sees anyone else&apos;s address.
        </p>
      </div>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="adminUrlId" value={adminUrlId} />

        <div className="flex flex-col gap-1">
          <Label htmlFor="invite-addresses">Email addresses</Label>
          <Textarea
            id="invite-addresses"
            name="addresses"
            placeholder="alex@example.com, sam@example.com"
            className="min-h-24"
            disabled={isPending}
          />
        </div>

        {formError ? (
          <p role="alert" className="text-destructive text-sm">
            {formError}
          </p>
        ) : null}

        <div>
          <Button type="submit" className="h-11" disabled={isPending}>
            {isPending ? "Sending…" : "Send invites"}
          </Button>
        </div>
      </form>

      {/* Per-recipient results — one chip per submitted address, in submission
          order. Replaced entirely on the next submit. */}
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
    </Card>
  );
}

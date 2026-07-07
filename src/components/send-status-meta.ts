// Shared SEND_STATUS_META (RESP-02, extracted verbatim from
// invite-by-email-form.tsx so InviteByEmailForm AND NudgeControl render the
// per-recipient result chips identically — same icon + label + palette, never
// color alone (WCAG 1.4.1 / UI-SPEC Accessibility). Extracting this to a shared
// module MUST NOT restyle the invite chips: the object below is byte-for-byte
// the original, only relocated.
//
// Chip mechanic reused from Phase 2/3 STATE_META: icon + label + palette.
import { Check, TriangleAlert, X, type LucideIcon } from "lucide-react";
import type { SendInviteStatus } from "@/lib/actions/send-invites";

export const SEND_STATUS_META: Record<
  SendInviteStatus,
  { icon: LucideIcon; label: string; className: string }
> = {
  sent: {
    icon: Check,
    label: "Sent",
    className: "bg-emerald-50 text-emerald-700 border border-emerald-300",
  },
  rate_limited: {
    icon: TriangleAlert,
    label: "Rate limited — try again tomorrow or share the link manually",
    className: "bg-amber-50 text-amber-700 border border-amber-300",
  },
  failed: {
    icon: X,
    label: "Failed to send — share the link manually",
    className: "bg-destructive/10 text-destructive border border-destructive/30",
  },
};

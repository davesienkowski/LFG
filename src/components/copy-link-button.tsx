"use client";

// Copy-to-clipboard button (UI-SPEC "Admin Page — Copy Link Feedback").
//
// UI-P2 (load-bearing): the "Copied!" / Check success state is entered ONLY
// after navigator.clipboard.writeText() RESOLVES. If the write rejects or
// throws, we swallow the error silently and never show success — a failed copy
// must not mislead the user into thinking the link is on their clipboard.
import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CopyLinkButton({
  url,
  label,
}: {
  url: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      // Success state only reached on a RESOLVED write (UI-P2).
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent per UI-SPEC; do NOT enter the success state on failure.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      aria-label={label}
      onClick={handleCopy}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Copied!" : "Copy link"}
    </Button>
  );
}

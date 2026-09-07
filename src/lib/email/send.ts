// Env-switched sendEmail() transport seam (D-01). A single async function whose
// behavior branches on EMAIL_PROVIDER (+ an optional EMAIL_FALLBACK_PROVIDER),
// so every call site (sendInvites, submitResponse, closePoll, nudge) stays
// provider-agnostic — no call site ever touches Nodemailer or Resend directly.
// Mirrors db/index.ts's "one exported surface whose implementation branches on
// an env var, read ONCE at module load" shape.
//
// DLVR-02 — the seam now tries an ORDERED provider chain [primary, fallback]:
// sendEmail() returns on the FIRST provider that succeeds and only falls through
// to the fallback when an earlier provider returns { ok: false } (transport error
// or rate-limit). The fallback is OPTIONAL — with EMAIL_FALLBACK_PROVIDER unset
// the chain is exactly [primary], a strict superset of the pre-DLVR-02 behavior.
// The chain lives ENTIRELY inside sendEmail(); no call site changes.
//
// Load-bearing invariants (unchanged, now enforced on EVERY link of the chain):
//  - NEVER throws for a transport error. Returns a discriminated SendResult
//    (matches the action-layer's CreatePollState/UpdateResponseState result
//    convention, applied one layer lower). An unconfigured chain (no primary and
//    no fallback) is a first-class { ok: false, error: "Email not configured" }
//    result (D-02), not an exception, and touches NO transport.
//  - The catch returns ONLY err.message — it MUST NEVER echo SMTP_PASS or
//    RESEND_API_KEY into the error string or any log (T-04-05). This holds on the
//    fallback's failure path too — the both-fail result carries only a message.
//  - The primary `from` is ALWAYS process.env.EMAIL_FROM; the fallback `from` is
//    EMAIL_FALLBACK_FROM ?? EMAIL_FROM — never a gmail address on a non-gmail
//    relay (D-03 DMARC trap). Each provider's `from` must be a sender that
//    transport is authorized for. A gmail Reply-To on a relay is fine; a gmail
//    From on a relay fails DMARC alignment and spam-folders. (Full SPF/DKIM/DMARC
//    alignment is Phase 10 / DLVR-03; this only makes a distinct fallback sender
//    POSSIBLE.)
//  - Recipients are passed as a single string `to` by every caller — sendInvites
//    loops individually, never CC/BCC-all (T-04-03).
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

type Provider = "smtp" | "resend";

type SendAttachment = {
  filename: string;
  content: string;
  contentType?: string;
};

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  // OPTIONAL (04-k1u): the finalization email attaches an event.ics so iOS Mail
  // shows its native "Add to Calendar" banner. Absent for invite/confirmation —
  // those sends stay byte-identical. The "none" branch never touches this.
  attachments?: SendAttachment[];
};

export type SendResult =
  | { ok: true }
  | { ok: false; error: string; rateLimited?: boolean };

function isProvider(p: string | undefined): p is Provider {
  return p === "smtp" || p === "resend";
}

// Read the provider chain ONCE at module load (mirrors db/index.ts's single
// NODE_ENV read). Each attempt pairs a concrete provider with the `from` it is
// authorized for. "none"/unset values are dropped; a provider appearing in both
// slots is de-duplicated so it is never tried twice. An empty chain is the
// MAIL-03 "Email not configured" path (D-02).
type Attempt = { provider: Provider; from: string | undefined };
const CHAIN: Attempt[] = (() => {
  const primaryFrom = process.env.EMAIL_FROM;
  const fallbackFrom = process.env.EMAIL_FALLBACK_FROM ?? process.env.EMAIL_FROM;
  const raw: Attempt[] = [];
  if (isProvider(process.env.EMAIL_PROVIDER)) {
    raw.push({ provider: process.env.EMAIL_PROVIDER, from: primaryFrom });
  }
  if (isProvider(process.env.EMAIL_FALLBACK_PROVIDER)) {
    raw.push({ provider: process.env.EMAIL_FALLBACK_PROVIDER, from: fallbackFrom });
  }
  // De-duplicate by provider (keep the first/primary occurrence).
  return raw.filter((a, i) => raw.findIndex((x) => x.provider === a.provider) === i);
})();

// Lazily-constructed, module-cached SMTP transport (mirrors the `db` singleton).
let smtpTransport: Transporter | null = null;
function getSmtpTransport(): Transporter {
  if (smtpTransport) return smtpTransport;
  smtpTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true", // true for 465, false for 587/STARTTLS
    // auth is undefined when SMTP_USER is unset so Mailpit (unauthenticated on
    // :1025) works locally.
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return smtpTransport;
}

/**
 * Send one email through a SINGLE concrete provider. Never throws; returns a
 * discriminated result. Internal — sendEmail() drives one or two of these in an
 * ordered chain. `from` is the sender that specific provider is authorized for.
 */
async function sendVia(provider: Provider, from: string | undefined, args: SendArgs): Promise<SendResult> {
  try {
    if (provider === "resend") {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: from!,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        // Map to resend's attachment shape (Buffer content, utf-8 default). Only
        // present when a caller supplies attachments (finalization email).
        ...(args.attachments && {
          attachments: args.attachments.map((a) => ({
            filename: a.filename,
            content: Buffer.from(a.content),
            ...(a.contentType && { contentType: a.contentType }),
          })),
        }),
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    // "smtp" — Gmail, Mailpit, or any relay, all speak plain SMTP. Nodemailer's
    // structured sendMail strips CR/LF from header fields (T-04-01); a single
    // string `to`, never an array/CC (T-04-03).
    await getSmtpTransport().sendMail({
      from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      // Nodemailer accepts { filename, content, contentType } directly. Passed
      // straight through; undefined when the caller omits attachments.
      attachments: args.attachments,
    });
    return { ok: true };
  } catch (err) {
    // Return ONLY the message — never the SMTP_PASS/RESEND_API_KEY (T-04-05).
    const message = err instanceof Error ? err.message : String(err);
    // Narrow inline heuristic (the create-poll.ts isUniqueViolation style, not a
    // library): providers surface a 4xx/"rate"/"quota" substring on a daily-cap
    // rejection so the UI can render distinct copy (D-05/D-06).
    const rateLimited = /rate|quota|too many|421|450/i.test(message);
    return { ok: false, error: message, rateLimited };
  }
}

/**
 * Send one email through the env-selected provider CHAIN (DLVR-02). Tries the
 * primary, then the optional fallback, returning the FIRST { ok: true }; only
 * falls through when an earlier provider returns { ok: false }. Never throws;
 * `to` is a single recipient string — callers that fan out loop and call this
 * once per address (never CC/BCC-all). An empty chain returns the first-class
 * "Email not configured" result WITHOUT touching any transport (D-02).
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (CHAIN.length === 0) {
    return { ok: false, error: "Email not configured" };
  }
  // Preserved only if the loop somehow makes no assignment (unreachable given the
  // length guard) — keeps the return type total.
  let last: SendResult = { ok: false, error: "Email not configured" };
  for (const attempt of CHAIN) {
    last = await sendVia(attempt.provider, attempt.from, args);
    if (last.ok) return last;
  }
  // All providers failed — surface the LAST attempt's failure (message + any
  // rateLimited flag), which never contains a secret (T-04-05).
  return last;
}

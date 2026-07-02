// Env-switched sendEmail() transport seam (D-01). A single async function whose
// behavior branches on EMAIL_PROVIDER, so every call site (sendInvites,
// submitResponse, closePoll) stays provider-agnostic — no call site ever touches
// Nodemailer or Resend directly. Mirrors db/index.ts's "one exported surface
// whose implementation branches on an env var, read ONCE at module load" shape.
//
// Load-bearing invariants:
//  - NEVER throws for a transport error. Returns a discriminated SendResult
//    (matches the action-layer's CreatePollState/UpdateResponseState result
//    convention, applied one layer lower). An unconfigured provider is a
//    first-class { ok: false, error: "Email not configured" } result (D-02), not
//    an exception.
//  - The catch returns ONLY err.message — it MUST NEVER echo SMTP_PASS or
//    RESEND_API_KEY into the error string or any log (T-04-05).
//  - `from` is ALWAYS process.env.EMAIL_FROM — never a gmail address on a
//    non-gmail relay (D-03 DMARC trap). EMAIL_FROM must be a sender the active
//    transport is authorized for (the same gmail as SMTP_USER on smtp.gmail.com,
//    or the relay's own verified sender otherwise). A gmail Reply-To on a relay
//    is fine; a gmail From on a relay fails DMARC alignment and spam-folders.
//  - Recipients are passed as a single string `to` by every caller — sendInvites
//    loops individually, never CC/BCC-all (T-04-03).
import nodemailer, { type Transporter } from "nodemailer";
import { Resend } from "resend";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

export type SendResult =
  | { ok: true }
  | { ok: false; error: string; rateLimited?: boolean };

// Read the provider ONCE at module load (mirrors db/index.ts's single NODE_ENV
// read), defaulting to "none" so an unset/invalid value is the MAIL-03 path.
const PROVIDER = process.env.EMAIL_PROVIDER ?? "none"; // "smtp" | "resend" | "none"

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
 * Send one email through the env-selected transport. Never throws; returns a
 * discriminated result. `to` is a single recipient string — callers that fan out
 * to many addresses loop and call this once per address (never CC/BCC-all).
 */
export async function sendEmail(args: SendArgs): Promise<SendResult> {
  if (PROVIDER === "none") {
    return { ok: false, error: "Email not configured" };
  }
  try {
    if (PROVIDER === "resend") {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from: process.env.EMAIL_FROM!,
        to: [args.to],
        subject: args.subject,
        html: args.html,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    // "smtp" — Gmail, Mailpit, or any relay, all speak plain SMTP. Nodemailer's
    // structured sendMail strips CR/LF from header fields (T-04-01); a single
    // string `to`, never an array/CC (T-04-03).
    await getSmtpTransport().sendMail({
      from: process.env.EMAIL_FROM!,
      to: args.to,
      subject: args.subject,
      html: args.html,
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

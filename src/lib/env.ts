// Type-safe environment variables (RESEARCH.md Standard Stack / Pitfall 5).
// Fails loudly at build/startup if DATABASE_URL or NEXT_PUBLIC_BASE_URL are
// missing or malformed, rather than surfacing as undefined at runtime.
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    // --- Phase 4 email transport (D-02): ALL optional. The app MUST build,
    // boot, and pass every non-email test with none of these set — an
    // unset/"none" EMAIL_PROVIDER is the first-class "email not configured"
    // (MAIL-03) state, not an error. ---
    //
    // "smtp" | "resend" | "none" (default when unset). Selects the sendEmail()
    // transport branch; unset/invalid is treated as "none" downstream.
    EMAIL_PROVIDER: z.enum(["smtp", "resend", "none"]).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_SECURE: z.coerce.boolean().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    // D-03 (DMARC trap): EMAIL_FROM must be a sender the active transport is
    // authorized for — the same gmail address as SMTP_USER on smtp.gmail.com,
    // or the relay's own verified sender on any other host. Never a gmail From
    // on a third-party relay (that fails DMARC alignment and spam-folders); a
    // gmail Reply-To on a relay is fine (EMAIL_REPLY_TO).
    EMAIL_FROM: z.string().optional(),
    EMAIL_REPLY_TO: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    // Email vars mirrored 1:1 with `server` above — this file keeps zero drift
    // between the two objects; never add to one without the other.
    EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURE: process.env.SMTP_SECURE,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  },
  // Skip validation during drizzle-kit / lint steps that don't load the app env.
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event?.startsWith("db:"),
  emptyStringAsUndefined: true,
});

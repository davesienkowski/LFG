// Type-safe environment variables (RESEARCH.md Standard Stack / Pitfall 5).
// Fails loudly at build/startup if DATABASE_URL or NEXT_PUBLIC_BASE_URL are
// missing or malformed, rather than surfacing as undefined at runtime.
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
  },
  client: {
    NEXT_PUBLIC_BASE_URL: z.string().url(),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
  },
  // Skip validation during drizzle-kit / lint steps that don't load the app env.
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION || process.env.npm_lifecycle_event?.startsWith("db:"),
  emptyStringAsUndefined: true,
});

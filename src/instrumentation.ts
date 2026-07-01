// Next.js instrumentation entry point (src/ variant — Next reads
// src/instrumentation.ts, not the repo root, in this project).
//
// WHY THIS FILE EXISTS: src/lib/env.ts exports `env = createEnv({...})` whose
// only side effect is to fail loudly when DATABASE_URL or NEXT_PUBLIC_BASE_URL
// are missing/malformed. But nothing imports it (`grep -rln "lib/env" src/`
// returns 0 hits), so that guard is dead code and never runs. This file is the
// always-executed startup entry point that activates it. The Phase 2 /thanks
// edit link is built via resolveBaseUrl() in src/lib/urls.ts, which silently
// falls back to request Host/X-Forwarded-Proto headers when NEXT_PUBLIC_BASE_URL
// is unset — so validating that var at startup is the point.
export async function register() {
  // Guard: register() can also fire in the edge runtime; env validation should
  // run once, at Node server startup only. Dynamic import keeps it scoped here.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("@/lib/env");
  }
}

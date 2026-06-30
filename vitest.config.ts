// Vitest config — node environment for the schema/token/date helper tests.
// TZ-sensitive tests (format-date) are exercised by setting the TZ env var on
// the test process (see src/lib/format-date.test.ts and package.json scripts).
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Mirror the tsconfig "@/*" -> "./src/*" path alias so tests can import
      // app modules the same way the Next bundler resolves them.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Default to node for DB/action/helper tests. Component tests (.test.tsx)
    // opt into jsdom per-file via a `// @vitest-environment jsdom` pragma.
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

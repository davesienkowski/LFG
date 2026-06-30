// Vitest config — node environment for the schema/token/date helper tests.
// TZ-sensitive tests (format-date) are exercised by setting the TZ env var on
// the test process (see src/lib/format-date.test.ts and package.json scripts).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

// drizzle-kit configuration (D-04 / RESEARCH.md Pattern 5).
// Points at the single schema file; migrations are emitted to ./drizzle
// and applied to DATABASE_URL via `npm run db:generate` + `npm run db:migrate`.
import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

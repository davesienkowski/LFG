// Dual-driver Drizzle client (D-03 / RESEARCH.md Pattern 1).
// - Local development (Docker Postgres): node-postgres (pg) over TCP.
// - Production (Vercel): @neondatabase/serverless neon-http over HTTP.
// The driver is selected by NODE_ENV so a single schema serves both
// environments with zero code divergence.
import { drizzle as nodePgDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB =
  | NodePgDatabase<typeof schema>
  | NeonHttpDatabase<typeof schema>;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export const db: DB =
  process.env.NODE_ENV === "production"
    ? neonDrizzle(neon(databaseUrl), { schema })
    : nodePgDrizzle(databaseUrl, { schema });

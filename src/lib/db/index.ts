// Dual-driver Drizzle client (D-03 / RESEARCH.md Pattern 1).
// - Local development (Docker Postgres): node-postgres (pg) over TCP.
// - Production (Vercel): @neondatabase/serverless neon-http over HTTP.
// The driver is selected by NODE_ENV so a single schema serves both
// environments with zero code divergence.
import { drizzle as nodePgDrizzle } from "drizzle-orm/node-postgres";
import { drizzle as neonDrizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Both drivers expose the same Drizzle query-builder surface for our usage
// (insert / select / query). Declaring the export as a single concrete type
// keeps call-site types usable — a union of the two driver types collapses the
// overloaded method signatures and breaks every query at compile time. The
// runtime still switches drivers by NODE_ENV (node-postgres dev / neon-http
// prod); the production branch is cast to the shared type.
type DB = NodePgDatabase<typeof schema>;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

export const db: DB =
  process.env.NODE_ENV === "production"
    ? (neonDrizzle(neon(databaseUrl), { schema }) as unknown as DB)
    : nodePgDrizzle(databaseUrl, { schema });

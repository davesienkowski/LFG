# Looking For Group (LFG)

A free, self-hostable clone of Doodle's "Group Poll" feature — propose candidate dates, share a link, let everyone mark **Available / If-need-be / Not available**, and read the results to pick a day. Built to schedule D&D sessions without a subscription.

Stack: Next.js 16 (App Router + Server Actions) · Drizzle ORM · Postgres (local Docker / Neon in prod) · nanoid tokens · Tailwind + shadcn/ui. No participant accounts — access is via unguessable links.

## Local development (Docker Desktop)

The dev environment runs entirely in Docker Desktop — a `web` (Next.js dev server) service + a `db` (Postgres) service.

```bash
# 1. Start Docker Desktop, then bring up the stack:
docker compose up --build

# 2. App: http://localhost:3000   (db: localhost:5432, user/pass postgres/password, db "lfg")
```

Schema migrations (run against the local Docker Postgres):

```bash
npm run db:generate   # drizzle-kit generate -> SQL in ./drizzle
npm run db:migrate    # apply migrations to the DB in DATABASE_URL
```

Tests:

```bash
npm test                          # full vitest suite
TZ=Pacific/Kiritimati npm test    # date helpers are timezone-safe (also test Etc/GMT+12)
```

Env: copy `.env.example` → `.env.local` (already set for the Docker stack). Secrets are never committed (`.env*` is gitignored).

## Deploy (Vercel + Neon, free tier)

Deploy happens **after** the local Docker stack works end-to-end. The same single Drizzle schema is reused — only the driver switches (`node-postgres` locally, `neon-http` when `NODE_ENV=production`).

1. **Neon** (free Postgres). Create a project and grab the **pooled** connection string (host contains `-pooler` / `c-N.<region>.aws.neon.tech`, `sslmode=require`):
   ```bash
   npx neonctl@latest projects list --org-id <your-org>
   npx neonctl@latest connection-string --project-id <project-id> --org-id <your-org> --pooled
   ```
2. **Migrate the schema to Neon** (before the app serves traffic):
   ```bash
   DATABASE_URL="<neon-pooled-url>" npm run db:migrate
   ```
3. **Vercel** (free Hobby). Set project env vars and deploy:
   - `DATABASE_URL` = the Neon **pooled** connection string
   - `NEXT_PUBLIC_BASE_URL` = `https://<your-project>.vercel.app`
   Deploy via the Vercel Claude Code plugin, the `vercel` CLI (`vercel --prod`), or a connected Git repo.
4. **Verify:** create a poll on the deployed URL → confirm both links (admin marked "Keep private"); alter a token → 404; after Neon idle (~5 min) create another poll → no cold-start 504. The diagnostic `/health` route is **not** present in production (returns 404).

Constraints: everything runs on free tiers; Vercel Hobby cron is not used (per-request side effects only).

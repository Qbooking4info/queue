# Queue

A hospital booking and queue management platform for Nigerian healthcare providers —
patients book appointments (in-person or virtual) via mobile, hospital staff manage
appointments, doctors, clinics and queues via a web dashboard.

- **`web/`** — Next.js 16 App Router dashboard + API routes (Vercel)
- **`mobile/`** — Expo SDK 56 React Native app (patients, doctors, front desk)
- **`supabase/`** — Postgres schema, RLS policies and migrations

See [`Queue-PRD-v2.0.md`](Queue-PRD-v2.0.md) for product context,
[`Queue-Database-Schema.md`](Queue-Database-Schema.md) for the schema,
[`Queue-RLS-Policies.md`](Queue-RLS-Policies.md) for row-level security,
[`Queue-API-Routes.md`](Queue-API-Routes.md) / [`Queue-Mobile-API-Routes.md`](Queue-Mobile-API-Routes.md)
for the web and mobile API surfaces, and [`Queue-Env-Config.md`](Queue-Env-Config.md)
for environment variables — **read that last one before adding any new env var**; it
documents which variables are safe to expose to the browser/app bundle and which must
stay server-only. Getting that wrong is how a service-role key ends up in client
JavaScript (see `AUDIT-FINDINGS.md` and the git history around `web/src/lib/supabase/admin-client.ts`
for exactly that incident and its fix).

## Prerequisites

- Node.js 20+
- The [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`
  or see the linked docs), logged in (`supabase login`) with access to the project
- [Expo Go](https://expo.dev/go) on a phone, or an iOS/Android simulator, for mobile

## Setup

1. **Clone and install dependencies:**
   ```bash
   cd web && npm install
   cd ../mobile && npm install
   ```

2. **Environment variables.** Copy the templates in
   [`Queue-Env-Config.md`](Queue-Env-Config.md) into `web/.env.local` and `mobile/.env`
   (both are git-ignored). You'll need the Supabase project URL, anon key, and — for
   `web/.env.local` only — the service-role key.

3. **Link the Supabase CLI to the project** (one-time, per machine):
   ```bash
   supabase link --project-ref <project-ref>
   ```
   The project ref is in the Supabase dashboard URL and in `Queue-Env-Config.md`.

4. **Apply migrations** (if your local schema is behind):
   ```bash
   supabase db push
   ```
   Migrations live in `supabase/migrations/`, one file per change, named
   `YYYYMMDDHHMMSS_description.sql`. `CREATE POLICY IF NOT EXISTS` isn't supported by
   this Postgres version — use `DROP POLICY IF EXISTS` immediately before `CREATE POLICY`
   when replacing one.

5. **Run the apps:**
   ```bash
   cd web && npm run dev       # http://localhost:3000
   cd mobile && npm start       # Expo dev server — scan the QR with Expo Go
   ```

## Database types

`web/src/types/database.ts` and `mobile/types/database.ts` are generated, not
hand-written. Regenerate both from the live schema after any migration:

```bash
./scripts/gen-types.sh          # writes both files
./scripts/gen-types.sh --check  # CI-style check: fails if either file is out of date
```

This runs `supabase gen types typescript` once and re-appends each app's own small
"convenience row types" section (`scripts/database-types-tail/{web,mobile}.ts`) — see
the comment at the top of `scripts/gen-types.sh` for why this isn't a single shared file.

## Tests

```bash
cd web
npm test          # Vitest — API route handler tests (src/app/api/**/*.test.ts)
npm run test:rls   # pgTAP — RLS policy tests (supabase/tests/database/), requires
                    # local Supabase (`supabase start`, needs Docker) or CI
```

There is no mobile test suite yet.

## Deployment

- **Web** deploys to Vercel on push to `main`. `npm run build` runs
  `scripts/check-env-safety.mjs` first (`prebuild`), which fails the build if any
  `NEXT_PUBLIC_*` environment variable looks like it holds a secret.
- **Mobile** builds via EAS (`eas build`); see `mobile/AGENTS.md` for the Expo SDK
  version note and `mobile/eas.json` for build profiles. Environment variables for EAS
  builds are set via `eas secret:create`, not `mobile/.env` (see
  [`Queue-Env-Config.md`](Queue-Env-Config.md)).

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the contribution workflow.

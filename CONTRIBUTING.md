# Contributing

## Before you start

Read [`Queue-Env-Config.md`](Queue-Env-Config.md) if you're touching anything related to
environment variables or the Supabase clients (`web/src/lib/supabase/admin.ts` /
`admin-client.ts`). The single most damaging mistake in this codebase's history was a
service-role key becoming reachable from the browser via a `NEXT_PUBLIC_` variable — see
`AUDIT-FINDINGS.md` and the commit history around that file for the incident and its fix.
The short version: the service-role key (`SUPABASE_SERVICE_ROLE_KEY`, no `NEXT_PUBLIC_`
prefix) must only ever be read inside `web/src/lib/supabase/admin.ts` /
`admin-client.ts`, both of which are guarded with `import 'server-only'`. Never import
either module from a `'use client'` component — use a `fetch()` call to an API route
instead. `web/scripts/check-env-safety.mjs` runs on every build and fails it if a
`NEXT_PUBLIC_*` variable looks like it holds a secret, but that's a safety net, not a
substitute for getting the pattern right.

## Definition of done

- **Schema or RLS policy changes** must update [`Queue-Database-Schema.md`](Queue-Database-Schema.md)
  and/or [`Queue-RLS-Policies.md`](Queue-RLS-Policies.md) in the same PR. These docs are
  accurate and current as of this writing — that's rare, and it's what makes a security
  or schema review possible in one pass instead of an archaeology exercise. Don't be the
  PR that breaks that.
- **New or changed API routes** must update [`Queue-API-Routes.md`](Queue-API-Routes.md)
  or [`Queue-Mobile-API-Routes.md`](Queue-Mobile-API-Routes.md).
- **New environment variables** must be added to [`Queue-Env-Config.md`](Queue-Env-Config.md),
  with an explicit note on whether they're safe to expose to the browser/app bundle.
- If you regenerate database types (`./scripts/gen-types.sh`), commit the result.
  `./scripts/gen-types.sh --check` is the CI-equivalent check.

## Security-sensitive patterns

- **Every new API route** that isn't intentionally public should start with
  `requireRole([...])` (from `web/src/lib/supabase/auth-server.ts`) and scope its
  queries by `caller.hospitalId` / `caller.clinicId` / `caller.doctorId` from that
  resolved session — never by an ID read from the request body or query string. If a
  route accepts a hospital/clinic/doctor ID from the client at all, verify it belongs to
  the caller before using it.
- **Dashboard components are `'use client'`** and must never import
  `@/lib/supabase/admin` or `@/lib/supabase/admin-client` (or anything that transitively
  does, like most of `@/lib/admin-api.ts`) as a value — only `import type` from
  `@/lib/admin-api.ts` is safe (erased at compile time). Fetch data via API routes
  instead. `npm run build` in `web/` will fail if this is violated, but don't rely on
  the build to catch it — design the route first.
- **New tables** need an explicit RLS policy in the same migration that creates them.
  Run the schema-wide audit query in `Queue-RLS-Policies.md` (or see
  `supabase/tests/database/rls.test.sql` for the pgTAP equivalent) if you're unsure
  whether a table has one.
- **Migrations**: one file per logical change, `YYYYMMDDHHMMSS_description.sql`. Use
  `DROP POLICY IF EXISTS` before `CREATE POLICY` when replacing a policy —
  `CREATE POLICY IF NOT EXISTS` isn't supported by the Postgres version this project
  runs. Apply with `supabase db push` after review; don't apply directly to production
  without reading the SQL first.

## Commits and PRs

- One logical change per commit. Security fixes especially — a mixed commit (a security
  fix plus an unrelated refactor) is much harder to review and to revert if something
  goes wrong.
- Run `npm run build` and `npm test` in `web/` before opening a PR.
- If you find an unrelated problem while working on something else, note it rather than
  fixing it in the same commit — see `AUDIT-FINDINGS.md` for the pattern this project
  already uses for that.

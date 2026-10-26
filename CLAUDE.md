# Queue — project instructions

Nigerian hospital booking, queue, virtual-care and ambulance platform. npm-workspaces monorepo:
`apps/{client,doctor,hospital,ambulance}` (Expo SDK 56 / RN 0.85) share `packages/shared`;
`web/` (Next.js 16) hosts every API route the apps call plus the hospital dashboard; Supabase
Postgres (`supabase/migrations/`) is the source of truth. `README.md` still describes an old
`mobile/` folder — see `docs/repair/ARCHITECTURE.md` for the current map.

## Repair campaign

Ongoing audit/repair work is tracked in `docs/repair/`. **Start every session with
`docs/repair/STATUS.md` (RESUME HERE)**, then `PROGRESS.json`, `ISSUES.md`, `TEST_MATRIX.md`.
Update them after each batch; never mark an issue `verified_fixed` without an executed test.

## Commands (verified 2026-10-13)

- Web tests / types / lint / build: `cd web && npx vitest run` · `npx tsc --noEmit` · `npx eslint` (329 pre-existing errors — don't add more) · `npm run build`
- App typechecks (all four): `npm run typecheck` (repo root) · shared jest: `npm test`
- pgTAP `npm run test:rls` needs local Supabase (Docker) — not available on this machine.

## Safety rules

- There is **one database and it is production** (no staging; branching needs Pro). Never run
  migrations, seeds or writes without explicit approval. Use `TEST`-named fixtures only.
- Mobile role/permission lookups go through SECURITY DEFINER RPCs, never direct staff-table reads (RLS returns 0 rows silently).
- Service-role client only in `web/src/lib/supabase/admin*.ts` (server-only). Read `Queue-Env-Config.md` before adding env vars.
- New SECURITY DEFINER functions: `revoke … from public, anon, authenticated` unless clients must call them.
- Schema/RLS changes update `Queue-Database-Schema.md` / `Queue-RLS-Policies.md` in the same PR (CONTRIBUTING.md).
- Don't commit, push, deploy or switch branches without approval; other sessions may share this checkout.

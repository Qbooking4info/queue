# Queue — Environment Configuration
**Updated:** July 2026

---

## Web (`web/.env.local`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL — used by both browser and server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key — safe to expose to the browser; RLS enforces access control |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service-role key — **server-only**; never expose to the browser. Used by `createAdminClient()` to bypass RLS in API routes |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Sentry DSN for error monitoring. Unset = Sentry is fully disabled (no-op init, zero overhead) |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | No | Enables source map upload on build. Unset = build skips upload, no functional change |
| `CRON_SECRET` | Yes (ambulance dispatch) | Shared secret for `/api/transport/sweep`. **Not driven by Vercel Cron** — this project is on the Hobby plan, which caps crons at once daily and fails the whole deployment on a sub-daily schedule. The tick comes from Postgres instead: `invoke_transport_sweep()` on pg_cron every 30s via pg_net. The same value must be stored in the `app_config` table (`key='cron_secret'`), or the sweep 401s silently. Check with `select * from transport_sweep_health()` |
| `NEXT_PUBLIC_SUPABASE_PUBLIC_KEY` | Yes | The `sb_publishable_` key. Preferred over `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which is the legacy JWT kept only as a fallback until legacy keys are disabled |
| `MAPBOX_ACCESS_TOKEN` | No | Road-ETA matrix for ambulance dispatch ranking. Unset = dispatch degrades to straight-line distance ranking (logged, not fatal) |

**Template:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
NEXT_PUBLIC_SENTRY_DSN=<sentry-dsn>
```

> `NEXT_PUBLIC_SITE_URL` is also read by `/api/clear-session` for the redirect target — defaults to `http://localhost:3000` if unset. Add it in production:
> ```bash
> NEXT_PUBLIC_SITE_URL=https://yourdomain.com
> ```

---

## Mobile (`mobile/.env`)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL — bundled into the app at build time |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key — bundled into the app; RLS enforces access control |
| `EXPO_PUBLIC_API_URL` | Yes | Base URL of the web app's API (e.g. `https://queue-web-omega.vercel.app`). Used for `deleteAccount` and the cached `/api/public/hospitals` reads — falls back to a direct Supabase query if unreachable |
| `EXPO_PUBLIC_SENTRY_DSN` | No | Sentry DSN for error monitoring. Unset = Sentry is fully disabled |

**Template:**
```bash
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
EXPO_PUBLIC_API_URL=https://<your-vercel-domain>
EXPO_PUBLIC_SENTRY_DSN=<sentry-dsn>
```

> The mobile app uses the same Supabase project as the web app. Both the URL and anon key are identical to the web values.

---

## Supabase CLI (`supabase/.temp/`)

The CLI links to the remote project using the project reference stored in `.temp/cli-latest`. No secret keys are stored here — the CLI uses your local Supabase login (`supabase login`) to authenticate.

To push migrations:
```bash
supabase db push
```

---

## Key Management Notes

- **Never commit** `web/.env.local` or `mobile/.env` — both are git-ignored
- The **service-role key** has full database access bypassing RLS. Keep it server-side only — it must never appear in any `NEXT_PUBLIC_*` variable or be bundled into the mobile app
- The **anon key** is safe to ship in the browser and mobile bundle because RLS policies enforce per-user access
- Both keys are JWTs signed with your project's JWT secret — rotating the JWT secret invalidates all existing sessions

---

## Production Checklist

| Item | Notes |
|---|---|
| Set `NEXT_PUBLIC_SITE_URL` on Vercel | Used for auth redirects |
| Add Supabase project URL to Vercel environment | Same as local |
| Add anon key to Vercel environment | Same as local |
| Add service-role key to Vercel environment | Mark as **secret** / server-only |
| Set `EXPO_PUBLIC_*` in EAS secrets for mobile builds | Via `eas secret:create` |
| Nominatim `User-Agent` in `/api/geocode` | Already set to `QueueApp/1.0 (qbooking4info@gmail.com)` |
| Set `CRON_SECRET` on Vercel | Required for `/api/transport/sweep` |
| ~~Schedule `/api/transport/sweep`~~ | **Done.** Driven from Postgres: `invoke-transport-sweep` pg_cron job every 30s via pg_net. Vercel Cron was not viable on the Hobby plan |
| Confirm the sweep is actually firing | `select * from transport_sweep_health()` — check `last_status_code = 200` and `cron_active`. A 401 means `CRON_SECRET` on Vercel and `app_config.cron_secret` disagree |

---

## Stale variables on Vercel — do not trust these

The Supabase–Vercel integration auto-created a set of variables that point at a
**different Supabase project** (`hsgynvkclwjllvscacjm`), not the live one
(`qzodmkgyzguzzyovjpfx`):

```
SUPABASE_URL                          <- NOT the live project
SUPABASE_ANON_KEY
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
SUPABASE_JWT_SECRET
POSTGRES_URL / POSTGRES_PRISMA_URL / POSTGRES_* 
```

Verified: **nothing in this codebase reads any of them.** The app uses
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLIC_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` exclusively.

They are inert, but they are a live footgun: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
was very nearly reused during the August key rotation because the name looked
right — it would have pointed the app at the wrong database. If you delete them,
confirm nothing else in the team's Vercel projects depends on that other project
first; the values are encrypted and cannot be recovered afterwards.

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
| `CRON_SECRET` | Yes (if ambulance dispatch is live) | Shared secret for `/api/transport/sweep`, the dispatch scheduler tick. Vercel Cron sends it automatically as `Authorization: Bearer <CRON_SECRET>`. **The route fails closed** — if this is unset the sweep returns 401 and stranded searches are never advanced and scheduled transport is never promoted |
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
| Set `CRON_SECRET` on Vercel | Required for `/api/transport/sweep`. `web/vercel.json` schedules it every minute; **minute-level cron needs a Vercel Pro plan** (Hobby caps crons at once per day, which is far too coarse for a 30s offer TTL). If you stay on Hobby, drive the same endpoint from an external scheduler instead — the route is trigger-agnostic |
| Confirm the sweep is actually firing | `GET /api/transport/sweep` with the bearer secret returns `{advanced, promoted, failed}`. If nothing ever advances, ambulance requests strand in `searching` silently |

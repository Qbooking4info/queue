# Queue platform — architecture map (repair campaign)

Discovered from the repository on 2026-10-13. Older top-level docs (`README.md`) still
describe a `mobile/` folder; that layout was replaced on 2026-08-31 by the workspace below.

## Shape

npm-workspaces monorepo. Four Expo apps share one package; **`web/` is the only backend
service** (Next.js route handlers) and **Supabase Postgres is the single source of truth**.
There is no separate staging database: Supabase branching needs the Pro plan, so the
linked project `qzodmkgyzguzzyovjpfx` is production *and* the only test target.

```
apps/client  ─┐                       ┌─> Supabase Postgres (RLS + SECURITY DEFINER RPCs,
apps/doctor  ─┤  Bearer JWT            │     pg_cron sweepers, triggers)
apps/hospital─┼──> web/src/app/api/** ─┤
apps/ambulance┘  + direct supabase-js  └─> Agora, Paystack, Google Routes/Maps, Expo push,
                   (anon/publishable key,      Sentry, optional alert webhook/SMS relay
                    subject to RLS)
web dashboard (cookie session) ──> same route handlers + server actions (service role)
```

## Applications

| App | Path | Package id | Users | Entry |
|---|---|---|---|---|
| Queue (patient) | `apps/client` | com.qbooking.mobile | patients, dependents | `App.tsx`, `screens/*` (booking, appointments, queue pass, virtual care, SOS/ambulance, wallet, care plans, messages) |
| Queue Doctor | `apps/doctor` | com.qbooking.doctor | doctors | `App.tsx`, `screens/specialist/*` + shared doctor components |
| Queue Hospital | `apps/hospital` | com.qbooking.hospital | hospital admin, front desk | `App.tsx`, `screens/{admin,frontdesk,staff,onboarding}` + `lib/staffApi.ts` |
| Queue Ambulance | `apps/ambulance` | com.qbooking.ambulance | ambulance crew | `App.tsx`, `screens/crew/*` |
| Web API + dashboard | `web/` | Vercel project queue-web | hospital admins, front desk, clinic admins, super admin | `src/app/api/**` (route handlers), `src/app/dashboard/**` |
| Shared | `packages/shared` (`@queue/shared`) | — | all apps | `lib/api.ts`, `admin-api.ts`, `crew-api.ts`, `ambulance-api.ts`, `contexts/AuthContext.tsx`, `agoraCall.ts` |

Stack: Expo SDK 56 / React Native 0.85 / React 19.2 / TypeScript 6 (apps); Next.js 16.3 /
React 19.2 / Tailwind 4 / Vitest 4 (web); Supabase Postgres + PostGIS + btree_gist +
pg_cron; Node 24 locally.

## Ownership of core operations

| Operation | Authoritative path |
|---|---|
| Appointment booking / cancel / status | `web/src/app/api/appointments/**` + RPCs (slot capacity) |
| Walk-ins, check-in, queue position | `api/appointments/walkin`, `api/appointments/queue`, `[id]/queue-position`, `lib/appointment-checkin.ts` |
| Virtual consultation | `api/virtual/{token,end}` mints Agora RTC tokens server-side (`AGORA_APP_CERTIFICATE` server-only); apps join via `packages/shared/lib/agoraCall.ts` |
| Ambulance dispatch | `api/transport/{request,dispatch,offers/respond,location,sweep,triage}` + `lib/dispatch/*` engine; state machine enforced by DB triggers; crew actions via RPCs (`crew_update_job_status`, `crew_complete_job`); pg_cron sweepers |
| Hospital receive / fleet | `api/ambulances/**` |
| Payments / wallet | `api/payments/**` (Paystack, webhook), `api/wallet/**` |
| Role resolution | Mobile: `AuthContext` → `get_my_staff_profile`, `get_my_crew_profile` RPCs; web: `lib/supabase/auth-server.ts`, `lib/admin-api.ts` |

## Tests that exist

- `web`: Vitest route/unit tests (`npm test` in `web/`) — dispatch matching/routing/eta, fees, paystack, clinic-staff, virtual token, transport sweep, walk-in.
- `packages/shared/lib/__tests__`: jest (`api.test.ts`, `pure-logic.test.ts`).
- `supabase/tests/database/rls.test.sql`: pgTAP — needs local Supabase (Docker), **Docker is not installed** on this machine.
- `scripts/e2e/*.js`: sign in as TEST accounts against prod with the anon key and exercise read paths per role.

## Known integration risks (see ISSUES.md for confirmed defects)

- Mobile direct table reads silently return 0 rows under RLS — role lookups must use RPCs.
- `web/src/lib/chat.ts` is a hand-kept copy of `packages/shared/lib/chat.ts`.
- Staff apps have no Firebase `google-services.json`, so Expo push cannot reach doctor/hospital/crew devices; crew offers rely on local alerts from the background location task.
- Road ETA: ranking reads Mapbox (unset), live ETA uses Google Routes.

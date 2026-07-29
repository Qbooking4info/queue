# Ambulance Services — Integration Notes

Written against the codebase as of 2026-07-29.

---

## What's in this drop

```
supabase/migrations/20260729000001_ambulance_core.sql       schema, triggers, RLS
supabase/migrations/20260729000002_ambulance_dispatch_fns.sql  dispatch, destination, location fns

web/src/lib/dispatch/matching.ts        pure scoring — unit tested, no I/O
web/src/lib/dispatch/matching.test.ts   vitest, runs via `npm run test`
web/src/lib/dispatch/routing.ts         Mapbox matrix adapter, degrades to distance
web/src/lib/dispatch/engine.ts          one call = one dispatch round
web/src/app/api/transport/request/route.ts        patient creates a request
web/src/app/api/transport/offers/respond/route.ts crew accept / decline
web/src/app/api/transport/location/route.ts       batched location ingest
web/src/app/api/transport/dispatch/route.ts       staff manual re-dispatch + cron target

mobile/lib/ambulance-api.ts             client, realtime subscriptions, ETA formatting, symptom→triage map
```

Everything matches your existing conventions: text columns with CHECK
constraints rather than Postgres enums, `users` as the single person table,
role link tables in the style of `hospital_admins` / `clinic_admins`, RLS
resolving `auth.uid()` through `users.auth_id`, and `createAdminClient()` in
API routes.

---

## Why PostGIS, and why it doesn't touch `hospitals`

Your fleet at launch will be tens of vehicles, not thousands, so the
performance case for a spatial index is weak. The real arguments are different:

1. **Provider service areas are polygons.** `ST_Covers` is one line. Point in
   polygon by hand is not, and getting it subtly wrong means dispatching units
   outside their licensed coverage.
2. **Distance logic would otherwise live in two places** — SQL for filtering,
   TypeScript for scoring — and drift apart.
3. **Enabling it is additive and reversible.** `create extension postgis` adds
   types and functions; it changes no existing table.

`hospitals` keeps its `latitude` / `longitude` float8 columns exactly as they
are. `rank_destination_hospitals()` is the single place the two representations
meet, converting on the fly with `ST_MakePoint(longitude, latitude)`. Nothing
else in the system needs to know hospitals aren't PostGIS.

**Caveat worth knowing before you run it:** PostGIS makes `pg_dump` restores
slower and adds a dependency to Supabase branch creation. Not a blocker, but
check it works on a branch before touching production.

---

## The appointments constraint this works around

`appointments.doctor_id` is `NOT NULL`. That makes a true pre-arrival encounter
record impossible — when an ambulance is 12 minutes out you know the hospital
but not the doctor.

Rather than loosen a constraint that's protecting your existing booking flow,
`transport_requests` stays independent and carries a nullable `appointment_id`.
The front desk reads inbound transports **directly from `transport_requests`**
(there's an RLS policy for exactly this), and the appointment row is created at
`arrived_at_destination` through your existing walk-in path, which already
assigns a doctor.

You still get the clinically valuable part — the ED knows who's coming, with
triage level, symptoms, and a live ETA, before the patient arrives — without
changing the appointments table.

If you'd rather have the appointment exist earlier, the alternative is a
"pending" duty doctor per emergency clinic. That's a real product decision, not
a schema detail, so it's left alone here.

---

## Wiring steps

### 1. Migrations

This project's Supabase CLI is already linked (`supabase link`), and branching
is available on this project (`supabase branches list` shows a `main` branch).
Recommended order:

```bash
supabase branches create ambulance-services   # test here first
supabase db push --db-url "<branch db url>"
# verify (see Verification section), then:
supabase db push                              # applies to the linked (production) project
```

Then regenerate types for both apps — several files reference tables that don't
exist in your current `database.ts`:

```bash
npm run gen-types      # from repo root, per scripts/gen-types.sh
```

Until you do, the `as any` casts in the route handlers are load bearing. Remove
them after regenerating and confirm `web` and `mobile` both typecheck.

### 2. Environment

```
MAPBOX_ACCESS_TOKEN=          # web only, server side — dispatch degrades to distance-based ranking without it
```

`EXPO_PUBLIC_API_URL` (mobile) is already set — `mobile/lib/ambulance-api.ts`
reuses it rather than introducing a second API base URL variable.

### 3. Cron

```sql
select cron.schedule('expire-offers',  '*/10 * * * * *', 'select expire_stale_offers()');
select cron.schedule('stale-tracking', '*/30 * * * * *', 'select flag_stale_tracking()');
```

pg_cron is already enabled on this project (used by
`recompute_denormalised_counters`), but that existing job runs on a standard
5-field nightly schedule. Confirm your pg_cron version actually accepts the
6-field seconds syntax above before relying on it — if it doesn't, fall back to
`'* * * * *'` (once a minute) for both; `expire_stale_offers()` is idempotent
either way, so the only cost of a coarser schedule is up to ~60s of added
latency before a timed-out offer's unit becomes offerable again.

The offer sweeper is not optional. Without it, a crew that ignores a push
notification leaves the request stuck in `searching` forever.

### 4. `EmergencyBookingScreen.tsx`

This is the integration point, and it's a small change. Your triage step already
collects the symptom (`SYMPTOMS` in the screen); the arrival step already offers
`Now (walk-in)`.

Add one option to `ARRIVAL_OPTIONS`:

```ts
const ARRIVAL_OPTIONS = [
  'Now (walk-in)',
  'I need an ambulance',   // → new
  '15 min', '30 min', '45 min', '1 hr',
]
```

When selected, branch to `requestAmbulance()` instead of
`createHospitalAppointment`, using `triageForSymptom(symptom)` from
`mobile/lib/ambulance-api.ts` to resolve triage level and required tier from
the symptom the patient already picked — never let the patient set triage
directly.

This screen change is intentionally **not** included in this drop; it needs
the design system and the map pattern in `mobile/components/map/HospitalsMap.native.tsx`
rather than a freehand implementation.

### 5. Screens still to build

- `AmbulanceRequestScreen` — pickup pin confirmation, symptom, contact number
- `AmbulanceTrackingScreen` — live map, status timeline, ETA, cancel
- Crew app: offer accept screen with countdown, job screen with status buttons
- Dispatcher console (web): live fleet map, active jobs, `dispatcher_alerts` inbox

---

## Things known to be unfinished

- **`estimateJobDuration()` returns a flat 45/60 min.** It drives the shift
  headroom filter, so a bad value silently shrinks your usable fleet. Replace
  with a rolling median by triage level and route once you have trip data.
- **Billing is schema only.** `transport_invoices` exists; nothing writes to it.
  Invoice generation on `completed`, split by `settlement_path`, is not written.
- **Scheduled transport assigns greedily.** Fine for v1. The T minus 60 minute
  promotion cron isn't written yet either — `/api/transport/dispatch` is the
  target for it.
- **No cancellation fee logic.** The rules are in the design doc; the code
  charges nothing.
- **Route polyline is never written.** `route_polyline` stays null until you add
  Douglas Peucker simplification on completion.
- **Provider and fleet management UI does not exist.** You cannot onboard an
  ambulance provider through any interface right now — it's direct SQL until
  that's built, which makes it the practical next thing.
- **No management UI exists at all.** Nothing is testable end-to-end until a
  provider, unit, shift, and crew member are seeded by SQL.

---

## Build order from here

1. Regenerate types, run migrations on a branch first, seed one provider and one unit by SQL
2. Provider + fleet management screens (nothing is testable without them)
3. Crew app: shift start, location pings, offer accept, status transitions
4. Patient request + tracking screens, wired into `EmergencyBookingScreen`
5. Dispatcher console and the alerts inbox
6. Scheduled transport promotion cron
7. Billing and payouts

Scheduled transport before emergency dispatch is worth doing first — the same
engine runs both, so exercise it on a routine discharge run before it ever
handles a triage 1 call.

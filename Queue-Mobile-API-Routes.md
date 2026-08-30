# Queue — Mobile-Facing API Routes

> These are the Supabase client routes consumed by the React Native mobile app (patient-side and doctor-side). All calls go directly to Supabase; there are no intermediate Next.js handlers for patient flows.

---

## Authentication

All mobile auth goes through the Supabase Auth SDK directly.

| Action | Method |
|--------|--------|
| Sign up | `supabase.auth.signUp({ email, password })` |
| Sign in | `supabase.auth.signInWithPassword({ email, password })` |
| Sign out | `supabase.auth.signOut()` |
| Get session | `supabase.auth.getSession()` |
| Refresh token | Automatic via `@supabase/supabase-js` |

Session tokens are stored in `SecureStore` (Expo) — never in AsyncStorage.

---

## Patient — Hospital & Doctor Discovery

### Search hospitals

```
GET /rest/v1/hospitals
  ?is_active=eq.true
  &is_verified=eq.true
  &select=id,name,slug,type,address,city,state,latitude,longitude,avg_rating,review_count,accepts_virtual,emergency_hours
  &name=ilike.*{query}*        (optional)
  &city=eq.{city}              (optional)
  &order=avg_rating.desc.nullslast
  &limit=20
  &offset={offset}
```

RLS: public read (is_active = true AND is_verified = true).

### Get hospital details

```
GET /rest/v1/hospitals?id=eq.{id}
  &select=*,hospital_specialties(specialty_id,specialties(name,icon)),hospital_operating_hours(*),hospital_clinics(id,name,description,is_active)
```

> `select=*` here is illustrative, not literal — as of migration `20260726000004`,
> `anon` no longer has table-level SELECT on `hospitals` or `doctors` at all (a direct
> `select=*`/`select=email,...` now gets `42501`); it's granted SELECT on an explicit
> column allowlist instead (excludes `hospitals.email`/`registration_number`/
> `mdcn_accreditation`). The actual public directory query lives in
> `web/src/lib/public-hospital-select.ts` (web) and `mobile/lib/api.ts`'s `HOSPITAL_SELECT`
> (mobile's direct-Supabase fallback) — keep both in sync with the grant if either
> changes. See `AUDIT-FINDINGS.md` for why this needed a DB-level fix, not just an
> application-layer column list.

### List doctors for a hospital

```
GET /rest/v1/doctors
  ?hospital_id=eq.{hospitalId}
  &is_active=eq.true
  &select=id,full_name,title,qualification,specialty_id,consultation_fee,virtual_fee,accepts_virtual,bio,avg_rating,review_count,specialties(name)
```

RLS: public read (is_active = true).

### Doctor availability (open slots)

```
GET /rest/v1/time_slots
  ?doctor_id=eq.{doctorId}
  &is_available=eq.true
  &slot_date=gte.{today}
  &booked_count=lt.max_capacity   ← filter unavailable via PostgREST
  &select=id,slot_date,start_time,end_time,is_virtual
  &order=slot_date,start_time
  &limit=60
```

---

## Patient — Booking

### Create appointment

```
POST /rest/v1/appointments
Body: {
  hospital_id, doctor_id, clinic_id?,
  patient_id,                    ← from auth session → users.id
  appointment_date,              ← "YYYY-MM-DD"
  start_time,                    ← "HH:MM:00"
  time_slot_id?,
  type,                          ← "in-person" | "virtual"
  reason?,
  booking_mode: "app",
  status: "pending",
  approval_status: "pending",
  urgency: "routine" | "urgent" | "emergency",
  booking_ref                    ← generate client-side: "APP-{timestamp-6}"
}
```

RLS: authenticated patient can insert their own appointment (patient_id = auth.uid()).

**Important:** The plan's monthly booking cap is enforced by a DB trigger on appointments INSERT. If the limit is hit, the insert fails with a custom Postgres error.

`time_slots.booked_count` is incremented by the web API's booking flow using the
service-role client, not by the mobile client directly. The `increment_slot_booking`
RPC exists in the schema but has no client call site in either app — as of migration
`20260726000002` it's granted to `service_role` only (previously `anon` and
`authenticated` could both call it with no ownership check, letting anyone drive any
doctor's `booked_count` to its cap).

### Cancel appointment

```
PATCH /rest/v1/appointments?id=eq.{appointmentId}
  &patient_id=eq.{patientId}   ← RLS enforces ownership
Body: { status: "cancelled" }
```

`approval_status` of `'rejected'` is terminal — the DB trigger blocks any UPDATE away from it.

### List patient appointments

```
GET /rest/v1/appointments
  ?patient_id=eq.{patientId}
  &select=id,appointment_date,start_time,status,approval_status,booking_mode,reason,booking_ref,
          doctors(id,full_name,title,avg_rating),
          hospitals(id,name,address,city)
  &order=appointment_date.desc
  &limit=20
  &offset={offset}
```

---

## Patient — Reviews

### Submit review (after completed appointment)

```
POST /rest/v1/reviews
Body: {
  appointment_id,   ← UNIQUE constraint; only one review per appointment
  hospital_id, doctor_id, patient_id,
  rating,           ← 1–5 integer
  body?
}
```

RLS: patient can insert review only for their own appointments. After insert, a DB trigger (`trg_reviews_hospital_rating`, `trg_reviews_doctor_rating`) automatically recalculates `avg_rating` and `review_count` on both `hospitals` and `doctors`.

### Read reviews for a doctor/hospital

```
GET /rest/v1/reviews
  ?hospital_id=eq.{hospitalId}
  &is_visible=eq.true
  &select=id,rating,body,created_at,users(full_name)
  &order=created_at.desc
  &limit=10
```

---

## Doctor Portal (mobile)

### Get doctor's appointments for today

```
GET /rest/v1/appointments
  ?doctor_id=eq.{doctorId}
  &appointment_date=eq.{today}
  &select=id,appointment_date,start_time,status,approval_status,type,reason,
          users!patient_id(id,full_name,phone,patient_number)
  &order=start_time
```

RLS: doctor can read appointments where `doctor_id` matches their `doctors.id`.

### Doctor queue (RPC, `get_doctor_queue`)

```
POST /rest/v1/rpc/get_doctor_queue
Body: { p_doctor_id, p_date, p_today }
```

Matches reassigned/OPD appointments the plain REST query above doesn't (via
`assigned_doctor_id`, and `check_in_date` for a walk-in that checked in today under a
different originally-booked date). `SECURITY DEFINER`, so it bypasses RLS by design —
**as of `20260726000001`, it requires the caller to be the doctor themselves or active
staff at that doctor's hospital, raising `42501` otherwise.** Previously granted to
`anon` with no caller check at all: doctor IDs are enumerable (`doctors` has a public
read policy) and the anon key ships in the APK, so any unauthenticated caller could pull
patient names, phone numbers and visit reasons for any doctor on any date. See
`Queue-RLS-Policies.md` and `AUDIT-FINDINGS.md` for the full incident.

### Record vitals

```
POST /rest/v1/vitals_audit_log
Body: {
  appointment_id,
  recorded_by_auth_id,   ← doctor's auth.uid()
  weight_kg?, height_cm?,
  bp_systolic?, bp_diastolic?,
  blood_sugar?, bmi?
}
```

`recorded_at` defaults to `now()`. Multiple entries are allowed; the latest is treated as current.

### Update appointment status (doctor confirms/completes)

```
PATCH /rest/v1/appointments?id=eq.{appointmentId}&doctor_id=eq.{doctorId}
Body: { status: "in-progress" | "completed" }
```

---

## Geocoding

Geocoding for hospital search is proxied through the web backend (rate-limits Nominatim):

```
GET /api/geocode?q={address}
Authorization: Bearer {supabase_session_token}   ← sent via cookie on web; on mobile pass as header
Response: { lat: "6.5244", lon: "3.3792" } | null
```

---

## Realtime Subscriptions

The mobile app uses Supabase Realtime to push queue updates without polling.

### Patient: watch their appointment status

```typescript
supabase
  .channel(`appointment:${appointmentId}`)
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'appointments',
    filter: `id=eq.${appointmentId}`,
  }, (payload) => { /* update UI */ })
  .subscribe()
```

### Doctor: watch incoming appointments

```typescript
supabase
  .channel(`doctor-queue:${doctorId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'appointments',
    filter: `doctor_id=eq.${doctorId}`,
  }, (payload) => { /* update queue */ })
  .subscribe()
```

**Scaling note:** Supabase Realtime has per-project connection limits on the free and Pro plans. If concurrent active users exceed the limit, new connections are rejected. Mitigation options: upgrade to Team plan, implement an SSE fallback via a Next.js `/api/queue-events` endpoint, or consolidate multiple per-appointment channels into a single per-doctor channel (already done above).

---

## Error Handling

All web API routes (`/api/*`) return structured errors:

```json
{
  "error": "Human-readable message",
  "code": "UNAUTHENTICATED | FORBIDDEN | NOT_FOUND | VALIDATION | BOOKING_LIMIT_MONTHLY | BOOKING_LIMIT_DAILY | PLAN_LIMIT_DOCTORS | STATUS_TERMINAL | APPROVAL_TERMINAL | INTERNAL"
}
```

Direct Supabase PostgREST calls return Postgres errors in the form `{ message, details, hint, code }`.

---

## Rate Limits (API routes only)

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /api/onboarding | 5 | per user per hour |
| POST /api/clinic-staff | 20 | per hospital per hour |
| POST /api/doctors/link | 20 | per hospital per hour |
| POST /api/dependents/link | 20 | per caretaker per hour |
| POST /api/appointments/walkin | 100 | per hospital per hour |
| POST /api/appointments/refer | 20 | per referring doctor per hour |
| POST /api/doctors/schedule | 20 | per hospital per hour |
| GET /api/geocode | 30 | per user per hour |
| DELETE /api/account | 3 | per user per hour |

Rate limit responses return HTTP 403 with code `FORBIDDEN`.

`checkRateLimit()` fails open (allows the request) if its underlying RPC errors, logged
via `console.error` — a defensible availability choice, but it means a misconfiguration
disables rate limiting everywhere; check server logs if a route's limit stops applying.

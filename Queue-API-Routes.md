# Queue — API Routes Reference
**Updated:** July 2026 · All routes are Next.js Route Handlers under `web/src/app/api/`

Auth guard legend:
- **`requireRole([...])`** — reads session cookie, resolves role via service key, returns 401/403 if not in the allowed list
- **`getServerUser()`** — basic session check only (any authenticated user)
- **`createAdminClient()`** — service-role Supabase client used inside routes; bypasses RLS

---

## Auth

### `POST /api/auth/signout`
Clears all Supabase auth cookies (`sb-{ref}-auth-token` and `.0/.1/.2`) and redirects to `/login`.

| Field | Value |
|---|---|
| Auth | None required |
| Body | None |
| Returns | 302 redirect to `/login` |

---

### `GET /api/clear-session`
Emergency escape hatch — wipes all `sb-*` cookies and redirects to `/login`. Use when a corrupted session cookie causes every server request to crash.

| Field | Value |
|---|---|
| Auth | None required |
| Returns | 302 redirect to `/login` |

---

## Role Resolution

### `GET /api/me/role`
Resolves the caller's role from their session. Used by `AdminContext` on every dashboard load.

| Field | Value |
|---|---|
| Auth | Session cookie |
| Returns | `{ role, hospitalId?, clinicId?, doctorId?, displayName }` or `null` |

**Role resolution order** (updated after Task 10's `clinic_admins` cleanup — the table's
`auth_user_id` column was dropped; every clinic_admin/front_desk row now resolves via
`user_id` only, confirmed zero rows depended on the old column):
1. Active row in `platform_admins` (by `user_id`) → `super_admin`
2. Row in `hospital_admins` with `role IN ('admin', 'owner')` → `hospital_admin`; `role = 'front_desk'` → `front_desk`
3. Row in `clinic_admins` (by `user_id`) → `clinic_admin` or `front_desk` (by `role` column)
4. Row in `doctors` (by `user_id`, then `auth_user_id`) → `doctor`

`requireRole()` (`web/src/lib/supabase/auth-server.ts`) follows the same order and is
the one place this logic should live — `/api/me/role` and `admin-api.ts`'s
`getUserRole()` duplicate it for historical reasons; keep all three in sync if this
order ever changes.

---

## Onboarding

### `POST /api/onboarding`
Registers a new hospital. Called from the onboarding wizard after the owner signs up.

| Field | Value |
|---|---|
| Auth | `getServerUser()` — any authenticated user |
| Creates | `hospitals`, `hospital_admins` (owner), `hospital_specialties`, `hospital_operating_hours`, `hospital_subscriptions`, `hospital_clinics` (multi-clinic) |

**Body:**
```json
{
  "name": "string",
  "type": "General | Specialist | Teaching",
  "description": "string?",
  "registrationNumber": "string?",
  "mdcnNumber": "string?",
  "address": "string",
  "city": "string",
  "state": "string",
  "phone": "string?",
  "email": "string?",
  "whatsapp": "string?",
  "clinicModel": "single | multi",
  "clinics": [{ "name": "string", "description": "string?" }],
  "accepts_virtual": "boolean",
  "emergency_hours": "boolean",
  "specialtyIds": ["uuid"],
  "hours": [{ "day": 0, "open": "08:00", "close": "17:00", "closed": false }],
  "planId": "uuid?"
}
```

**Returns:** `{ success: true, hospitalId: uuid }`

---

## Geocode

### `GET /api/geocode?q={address}`
Nominatim proxy with server-side rate limiting (1.1 s between calls) and in-process cache. Prevents browsers from calling Nominatim directly and hitting rate limits across tabs.

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Returns | `{ lat: string, lon: string }` or `null` |

---

## Doctors

### `POST /api/doctors`
Creates a doctor record. Optionally creates a Supabase Auth account if `login_email` + `login_password` are provided.

| Field | Value |
|---|---|
| Auth | `getServerUser()` |
| Body | `hospitalId, clinicId?, full_name, title?, specialty_id?, consultation_fee?, virtual_fee?, years_experience?, accepts_virtual, bio?, qualification?, mdcn_number?, login_email?, login_password?` |
| Returns | `{ id: uuid, hasLogin: boolean }` |

---

### `POST /api/doctors/create`
Creates a doctor **with auto-generated portal credentials** (email + password). Also enforces the plan's `max_doctors` seat limit.

| Field | Value |
|---|---|
| Auth | Session cookie; caller must be `hospital_admin` with role `admin` or `owner` |
| Plan check | Queries active subscription `max_doctors`; returns 403 if at limit |
| Creates | `doctors` row, Supabase Auth user, `users` profile, `hospital_admins` (specialist) |

**Body:**
```json
{
  "full_name": "string",
  "title": "Dr.",
  "qualification": "string?",
  "specialty_id": "uuid?",
  "consultation_fee": "number?",
  "virtual_fee": "number?",
  "accepts_virtual": "boolean",
  "bio": "string?"
}
```

**Returns:** `{ success, doctorId, loginCreated, loginEmail?, loginPassword? }`

> Generated email format: `dr.{name-slug}.{random4}@portal.queueapp.co`

---

### `POST /api/doctors/link`
Links an existing, independent doctor account (self-registered via the `doctors/` app — see
`users.active_hospital_id` in the schema doc) to the caller's hospital, by inserting a new
`doctors` row that shares that account's `user_id`. Added Aug 2026 alongside multi-hospital
doctor identity. If the doctor was previously linked to this same hospital and later
deactivated, re-activates that row instead of inserting a duplicate. Copies profile fields
(`title`, `level`, `qualification`, `bio`, `years_experience`, `mdcn_number`, `specialty_id`,
`avatar_url`) from the doctor's oldest existing `doctors` row, if any, so they don't have to
re-enter them per hospital. Subject to the same `max_doctors` plan-seat check as
`POST /api/doctors/create`.

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Body | `{ doctorCode: string, clinicId?: uuid }` — `doctorCode` is the target doctor's `users.doctor_code`, a short 6-character code shown to them as their "Doctor ID" in the `doctors/` app (changed from the raw `users.id` UUID in `20260821000001` — shorter and human-typeable). Matched case-insensitively (uppercased server-side) |
| Returns | `{ id: uuid, relinked: boolean }` |

---

### `PATCH /api/doctors/[id]`
Updates an existing doctor's profile fields. If `email` is changed, also updates the Supabase Auth account.

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Allowed fields | `full_name`, `title`, `specialty_id`, `consultation_fee`, `virtual_fee`, `years_experience`, `accepts_virtual`, `bio`, `qualification`, `mdcn_number`, `email` |
| Returns | `{ success: true }` |

---

### `POST /api/doctors/[id]/reset-password`
Resets the portal login password for a doctor (via `doctors.auth_user_id`).

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Body | `{ newPassword: string }` (min 8 chars) |
| Returns | `{ success: true }` |

---

### `POST /api/doctors/schedule`
Generates time slots for a doctor across a date range based on working days and slot duration.

| Field | Value |
|---|---|
| Auth | Session cookie; caller must be `hospital_admin` with role `admin` or `owner` |

**Body:**
```json
{
  "doctor_id": "uuid",
  "working_days": [1, 2, 3, 4, 5],
  "start_time": "08:00",
  "end_time": "17:00",
  "slot_duration": 20,
  "days_ahead": 30,
  "accepts_virtual": false,
  "clear_existing": true
}
```

- `working_days`: array of day-of-week integers (0=Sun … 6=Sat)
- `slot_duration`: one of `10, 15, 20, 30, 45, 60`
- `days_ahead`: 1–180
- `clear_existing`: if true, deletes existing unbooked (`booked_count = 0`) future slots first
- Inserts in batches of 500

**Returns:** `{ success: true, inserted: number }`

---

### `GET /api/doctors/schedule?doctor_id={uuid}`
Returns all upcoming time slots for a doctor (from today, up to 1000 rows).

| Field | Value |
|---|---|
| Auth | Session cookie |
| Returns | `{ slots: [{ id, slot_date, start_time, end_time, is_virtual, booked_count, max_capacity, is_available }] }` |

---

## Clinic Staff

### `POST /api/clinic-staff`
Creates a clinic staff member (clinic_admin or front_desk). Creates Supabase Auth user + users profile + clinic_admins row.

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Body | `{ clinicId, hospitalId, staffName, staffEmail, tempPassword, role: 'clinic_admin' | 'front_desk' }` |
| Returns | `{ success: true }` |

Scoping (added after a cross-tenant IDOR was found — a clinic admin at Hospital A could
previously POST Hospital B's IDs): `hospitalId` must equal `caller.hospitalId` unless
`super_admin`; `clinicId` must belong to that `hospitalId`; a `clinic_admin` caller may
only create staff in their own clinic and may only create `front_desk` (not another
`clinic_admin`). `role` is allowlisted and `tempPassword` must be ≥12 characters.

---

### `PATCH /api/clinic-staff`
Updates a staff member's name and/or email. Also syncs email to Supabase Auth if changed.

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Body | `{ staffId: uuid, full_name?: string, email?: string }` |
| Returns | `{ success: true }` |

---

### `DELETE /api/clinic-staff`
Deactivates a staff member (sets `clinic_admins.is_active = false`). Does not delete the Auth account.

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Body | `{ staffId: uuid }` |
| Returns | `{ success: true }` |

---

### `POST /api/clinic-staff/reset-password`
Resets the login password for a clinic staff member (resolved via `clinic_admins → users → auth_id`).

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin', 'hospital_admin', 'clinic_admin'])` |
| Body | `{ staffId: uuid, newPassword: string }` (min 8 chars) |
| Returns | `{ success: true }` |

---

## Clinics

### `GET /api/clinics?hospitalId={uuid}`
Returns all clinics for a hospital.

| Field | Value |
|---|---|
| Auth | `getServerUser()` |
| Returns | Array of clinic records |

---

### `GET /api/clinics/{clinicId}/hours`
Returns a single clinic's operating hours. Not ownership-gated (unlike `GET /api/clinics/{clinicId}` itself, which manages a clinic's own settings) — any authenticated user, same as `GET /api/clinics?hospitalId=`, since reading a clinic you don't belong to is inherent to referring a patient there.

| Field | Value |
|---|---|
| Auth | `getServerUser()` |
| Returns | `{ hours: DayHours[], isCustom: boolean }` — `isCustom: false` means this clinic never set its own hours; callers should fall back to the hospital's hours (`GET /api/public/hospitals/{id}/hours`) instead of treating the returned defaults as authoritative |

---

### `POST /api/clinics`
Creates a new clinic within a hospital. Optionally creates a clinic_admin account at the same time.

| Field | Value |
|---|---|
| Auth | `getServerUser()` |
| Body | `{ hospitalId, clinicName, subAdminName?, subAdminEmail?, tempPassword?, serviceTags? }` |
| Returns | `{ success: true, clinicId: uuid }` |

> If admin creation fails, the clinic is rolled back to keep data consistent.

---

## Walk-in Appointments

### `GET /api/appointments/walkin?patientNumber={ref}` or `?phone={phone}`
Looks up a registered patient by patient number or phone number for the walk-in intake form.

| Field | Value |
|---|---|
| Auth | `requireRole(['hospital_admin', 'clinic_admin', 'front_desk'])` |
| PHI note | `super_admin` excluded — patient contact details are PHI |
| Returns | `{ found: boolean, patient?: { id, full_name, phone, patient_number, email } }` |

Scoping: only matches a patient who has an existing appointment at `caller.hospitalId`
(`findLinkablePatient()`). This used to be a platform-wide lookup — any front desk
account could confirm whether a phone number or patient reference existed anywhere on
the platform. A patient with no prior relationship to the caller's hospital now returns
`found: false`; staff link the walk-in in person instead.

---

### `POST /api/appointments/walkin`
Creates a walk-in appointment. Attempts to link to a registered patient by patient_number or phone (same hospital-scoped lookup as the GET above). Enforces monthly booking cap (belt-and-suspenders above the DB trigger). Rate limited: 100/hour per hospital.

| Field | Value |
|---|---|
| Auth | `requireRole(['hospital_admin', 'clinic_admin', 'front_desk'])` |
| PHI note | `super_admin` excluded — walk-in intake creates patient records |

Scoping (added after a cross-tenant IDOR): `hospitalId` must equal `caller.hospitalId`
unless `super_admin`; `doctorId`/`clinicId`, if given, must belong to that hospital; a
`front_desk` caller may only book into their own clinic.

**Body:**
```json
{
  "hospitalId": "uuid",
  "patientName": "string",
  "patientPhone": "string?",
  "patientNumber": "string?",
  "doctorId": "uuid?",
  "clinicId": "uuid?",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "reason": "string?",
  "staffId": "uuid?"
}
```

**Returns:** `{ id: uuid, bookingRef: "WLK-XXXXXX", linked: boolean }`

> `linked: true` means the walk-in was matched and linked to an existing patient account.

---

## Referrals

### `POST /api/appointments/refer`
A doctor refers a patient they're seeing to a different hospital (or a specific doctor
there) — or to another clinic at their *own* hospital. Unlike every other
appointment-creation route, there is deliberately no `caller.hospitalId === target
hospital` check — a referral's whole point is (usually) crossing hospitals, though a
same-hospital referral to a colleague/clinic is allowed too. Mirrors walk-in's plan
checks (subscription status, monthly booking cap) but against the *receiving* hospital.
Rate limited: 20/hour per referring doctor. CORS-enabled (`20260821`) — called
cross-origin by the doctors/mobile apps' Refer screen, which silently failed in the
browser (blocked preflight, no error surfaced) before this route had `OPTIONS`/
`AUTH_CORS_HEADERS`.

`appointmentId` identifies both the patient being referred and (implicitly) the doctor
relationship — there's no separate `patientId` field. This is deliberate: `patient_id` on
`appointments` is nullable (null = unregistered walk-in, the common case since most
patients here are registered by front desk rather than self-booked), so a patientId-based
API would silently have no way to refer a walk-in at all. Identifying by appointment
instead works for both, pulling `walkin_patient_name`/`walkin_patient_phone` off that row
onto the new one when there's no linked account.

If that appointment is (still) `in_progress` at submit time **and** the caller passes
`completeOriginal: true`, creating the referral also marks it `completed` (and ends its
`virtual_sessions` row, if any) in the same request — one action ("refer and I'm done with
this patient") instead of a separate Refer then Complete. `completeOriginal` defaults to
`true` for backward compatibility, but the doctors/mobile Refer screen now sends it
explicitly, gated by an "Also complete this consultation" toggle that defaults **off** —
this is what lets a doctor send more than one referral out of the same visit (e.g.
Cardiology *and* Radiology) without the first one prematurely ending the consult; they
complete it themselves afterwards (via `start_consultation`/`end_consultation`, i.e. the
Queue's End button) once actually done, or flip the toggle on for the last referral. Even
with `completeOriginal: true`, this is best-effort: if the appointment was already
completed/changed by someone else in the meantime, the referral itself still succeeds and
`originalCompleted` comes back `false`.

| Field | Value |
|---|---|
| Auth | `requireRole(['doctor'])` — doctors only |
| Relationship check | `appointmentId` must belong to the caller (`doctor_id` or `assigned_doctor_id`) at their own hospital — otherwise this becomes a way to book on behalf of any patient on the platform |

**Body:**
```json
{
  "appointmentId": "uuid",
  "receivingHospitalId": "uuid",
  "receivingDoctorId": "uuid?",
  "receivingClinicId": "uuid?",
  "date": "YYYY-MM-DD",
  "startTime": "HH:MM",
  "type": "in-person | virtual",
  "reason": "string?",
  "referralReason": "string",
  "urgency": "routine | urgent | emergency?",
  "paymentMethod": "string?",
  "completeOriginal": "boolean? (default true)"
}
```

**Returns:** `{ id: uuid, bookingRef: "REF-XXXXXXXX", approvalStatus: string, originalCompleted: boolean }`

The created appointment has `booking_mode: 'referral'`, `hospital_id`/`doctor_id` set to
the *receiving* side, and `referred_by_doctor_id`/`referring_hospital_id`/`referring_clinic_id`/
`referral_reason` set from the caller — see `Queue-Database-Schema.md`.
`referring_clinic_id` is the *referring* doctor's own clinic (denormalised server-side, not
client-supplied) — separate from `receivingClinicId`, which targets a clinic on the
receiving side. `approval_status` follows the receiving hospital's own `approval_mode`,
same as a patient self-booking.

### `GET /api/public/hospitals/{id}/hours`
Unauthenticated, same as the sibling `GET /api/public/hospitals/{id}` route. Used by the
referral UI (web and mobile) to restrict the date/time picker to days the receiving
hospital is actually open, and to warn (non-blocking) when an emergency referral is being
sent to a hospital that looks closed right now and has no 24/7 or emergency-hours flag.

| Field | Value |
|---|---|
| Auth | None |
| Returns | `{ hours: DayHours[] }`, `DayHours = { day: 0-6, open: "HH:MM", close: "HH:MM", closed: boolean }` |

An emergency referral skips the date/time picker entirely (sent for today, right now) —
it doesn't skip the hours *check*, just the manual selection.

---

## Direct Booking *(added Aug 2026, migration `20260817000001`)*

A patient booking a doctor **directly** — virtual consult or home visit, no hospital
involved at all. See `Queue-Database-Schema.md`'s `appointments` and `doctor_profiles`
sections for the underlying `doctor_user_id`/`hospital_id IS NULL` shape. Creation itself
isn't a route — it's a direct authenticated-client insert into `appointments`
(`mobile/lib/api.ts`'s `createDirectAppointment()`), same pattern as every other
patient-initiated booking in this app; the existing `"Patients can create their own
appointments"` RLS policy already permits it unmodified (keyed only on `patient_id`, no
`hospital_id` involved).

The routes below are all called **cross-origin** by the `doctors/` app (and, for the
public ones, `mobile/`) running in a browser at a different port than this Next.js app —
unlike the public hospital routes (`Access-Control-Allow-Origin`-only), the authenticated
ones here carry a non-simple `Authorization` header and use non-GET methods, so they need
full CORS handling: a real `OPTIONS` preflight response and the same headers on every
response including errors. See `web/src/lib/cors.ts`.

### `GET/PATCH /api/doctors/profile`
The caller's own `doctor_profiles` row — fee, direct-booking opt-ins, phone visibility,
and public-profile fields (title/specialty/bio/qualification/years). Any signed-in account
may read/write its own row; PATCH upserts (`onConflict: 'user_id'`), so the first save
creates the row.

| Field | Value |
|---|---|
| Auth | `getServerUser()` — any authenticated user |
| PATCH Body | Partial: `{ title?, specialty_id?, bio?, qualification?, years_experience?, virtual_fee?, home_visit_fee?, accepts_direct_virtual?, accepts_direct_home_visit?, show_phone_to_patients? }` |
| Returns | `{ profile: DoctorProfileRow | null }` |

### `GET/POST /api/doctors/qualifications`, `DELETE /api/doctors/qualifications/{id}`
The caller's own uploaded credential documents, stored in the private `doctor-credentials`
Storage bucket. GET/POST responses include a signed URL (5-minute TTL) per document, not a
raw storage path — the bucket is never read directly by a client.

| Field | Value |
|---|---|
| Auth | `getServerUser()` — any authenticated user; DELETE also checks the document belongs to the caller |
| POST Body | `multipart/form-data`: `file` (PDF/JPEG/PNG/WEBP, max 10MB), `title` (string) |
| Returns | GET: `{ documents: [{ id, title, uploadedAt, url }] }`. POST: `{ document: { id, title, uploaded_at, url } }`. DELETE: `{ success: true }` |

### `GET /api/public/doctors/search`
Unauthenticated directory of **every registered, active doctor** — not just ones who opted
into direct (no-hospital) bookings (changed `20260821`: source of truth is now `doctors`,
one row per hospital affiliation, grouped by `user_id` into one entry per person with
`hospitals: [{id,name}]` listed; `doctor_profiles` — only guaranteed to exist for a doctor
who's touched direct-booking settings — is joined on top for fee/bio/direct-booking
capability where present). A doctor with no `doctor_profiles` row still appears, just with
`acceptsDirectVirtual`/`acceptsDirectHomeVisit` both `false` and only bookable via one of
`hospitals`. Phone number is redacted server-side unless `show_phone_to_patients` is set —
never left to the client to decide.

| Field | Value |
|---|---|
| Auth | None |
| Query | `q?` (name/specialty substring), `specialtyId?`, `visitType?` (`virtual` \| `home_visit` — filters to doctors who specifically opted into that direct-booking type; omit to show every doctor regardless of direct-booking status) |
| Returns | `{ doctors: IndependentDoctor[] }` — safe fields only, `phone` possibly `null`, `hospitals: [{id,name}][]` |

### `GET /api/public/doctors/{id}`
Full public profile for one doctor (`{id}` is their `users.id`, i.e. their "Doctor ID").
404s only if the account isn't a registered doctor at all (no `doctor_profiles` row and no
active `doctors` link) — no longer requires having opted into direct booking (changed
`20260821`). `title`/`level`/`specialty`/`qualification`/`yearsExperience` fall back to the
doctor's oldest active `doctors` row when no `doctor_profiles` row exists. Includes
qualification documents as signed URLs.

| Field | Value |
|---|---|
| Auth | None |
| Returns | `{ doctor: IndependentDoctorProfile }` (adds `documents: [{ id, title, url }]` and `hospitals` to the search shape) or 404 |

### `PATCH /api/appointments/direct/{id}`
Doctor-side review actions on their own direct bookings — approve/reject/start/complete/
cancel. Cannot reuse `PATCH /api/appointments/[id]`: that route gates every action on
`caller.hospitalId === appt.hospital_id`, which a direct booking's `NULL hospital_id`
never satisfies. Scoped instead by `doctor_user_id === caller's own users.id`, and 404s
for any appointment that isn't a direct booking (`hospital_id IS NOT NULL`).

| Field | Value |
|---|---|
| Auth | `getServerUser()`; caller must be the appointment's `doctor_user_id` |
| Body | `{ action: 'approve' }` \| `{ action: 'reject', reason }` \| `{ action: 'start' }` (home-visit only — virtual consults start via `POST /api/virtual/token`, unchanged) \| `{ action: 'complete', diagnosis?, doctorNotes? }` \| `{ action: 'cancel', reason }` |
| Returns | `{ success: true }` |

Reading a doctor's own direct bookings is a direct RLS-scoped client query, not a route —
`"Doctors can read own direct appointments"` policy (`doctor_user_id = caller`).

`POST /api/virtual/token` and `POST /api/virtual/end` (pre-existing, undocumented here
before now) needed no new routes for direct virtual consults — both already resolved the
caller by looking up the appointment's doctor and checking identity, and now check
`doctor_user_id` first (falling back to the `doctors`-row path for hospital-mediated
appointments), so the same Agora-token flow works for both booking shapes unchanged.
Both gained CORS support in `20260821` (audit alongside the other doctor-consult routes
above) — the doctors/mobile apps call these cross-origin to start/end a video call, which
silently failed in the browser before either route had `OPTIONS`/`AUTH_CORS_HEADERS`.

---

## Dashboard Data

Added to move ~19 `'use client'` dashboard components off a service-role client that was
directly reachable from the browser (`web/src/lib/supabase/admin-client.ts` /
`admin-api.ts`'s `adminDb`) — see `AUDIT-FINDINGS.md` and the git history for the full
incident and the component-by-component migration. Every route below follows the same
shape: `requireRole([...])`, then scope every query by `caller.hospitalId` /
`caller.clinicId` / `caller.doctorId` from the resolved session — never by an ID read
from the request. Full request/response bodies are in each route file; this is a map of
what exists and what replaced what.

| Route | Replaces (`admin-api.ts`) | Notes |
|---|---|---|
| `GET /api/dashboard/bootstrap` | `getHospital`, `getHospitalStats`, `getClinicStats`, `getDoctors`, `getTodayAppointments`, `getDoctorTodayAppointments`, `getAllHospitals`, `getClinicDetail`, `getDoctorProfile` | `AdminContext`'s bootstrap — every dashboard page's initial load. `?hospitalId=` is honoured only for `super_admin` ("switch hospital") |
| `GET /api/patients/[id]` | `getPatientProfile`, `getPatientMedicalHistory` | Staff may view a patient's chart only if that patient has an appointment at the caller's hospital — `patient_medical_history` has no staff-read RLS policy, so this check lives in the route |
| `POST /api/appointments/[id]/vitals` | `updateAppointmentVitals` | `recorded_by_auth_id` comes from the session, not a client-supplied value. Writes to `vitals_audit_log`, not `appointments` (denormalised columns dropped `20260719000004`) — this is the *only* path that has ever actually recorded vitals; the mobile/doctors apps' consult screens previously read/wrote nonexistent `appointments.vitals_*` columns directly, so front-desk-recorded vitals never reached the doctor's view (fixed `20260821`, screens now query `vitals_audit_log` directly for reads and call this route for writes). CORS-enabled (`20260821`) for the same cross-origin reason as `PATCH /api/appointments/[id]` above. **Bug fixed `20260821`:** `handlePOST` called `requireRole([...])` without passing `req`, so it could never see the `Authorization: Bearer` header the doctors/mobile apps actually send cross-origin — silently fell through to cookie auth (never present cross-origin) and would 401 outside same-origin Node testing. Now called `requireRole([...], req)`. **Gated `20260823`:** now requires `status` to be `checked_in` or `in_progress` (fetched alongside `hospital_id`) — server-side backstop for a bug where "Record Vitals" was reachable before check-in from the web dashboard's appointments page and both doctors/mobile `PatientConsultScreen`s (only the mobile front-desk screen was ever correctly gated); those three UI surfaces were also fixed to hide the option pre-check-in, but this is what actually closes the gap for any surface that's missed or stale |
| `GET /api/appointments?from&to` | `getAppointments`, `getClinicAppointments`, `getDoctorAppointments` | Also returns the doctors list in the same response |
| `PATCH /api/appointments/[id]` | `assignDoctorToAppointment`, `markNoShow`, `approveAppointment`, `rejectAppointment`, `checkInAppointment`, `startConsultation`, `endConsultation`, `updateAppointmentStatus` | Action discriminator: `assign_doctor`, `mark_no_show`, `approve`, `reject`, `check_in`, `start_consultation`, `end_consultation`, `set_status` (bare status flip, no transition guard — matches the original `updateAppointmentStatus` exactly, distinct from `check_in`/`end_consultation`'s queue-position logic), `update_consult_notes` (added `20260821`: `{ notes?, diagnosis? }`, doctor-only and only the doctor actually on the appointment — this is the *only* path that has ever actually written `doctor_notes`/`diagnosis`; the mobile and doctors apps previously tried a direct client `.update()`, which silently no-ops — there has never been an RLS `UPDATE` policy on `appointments` for doctors, only `SELECT`), `ring` (added `20260821`: no body — doctor or front_desk/admin calls a `checked_in`/`in_progress` patient in, any time, not gated to being exactly next; a doctor caller may only ring their own patient; sends a `queue_ring`-type push naming the doctor via `notifyPatient`). `assign_doctor` also checks the doctor's `users.active_hospital_id` (added `20260820`) — a doctor linked to multiple hospitals can only be assigned patients at whichever one is currently active for them (falls back to their earliest-linked hospital if they've never touched the doctors app's hospital switcher); staff at a hospital that isn't currently active for that doctor get a validation error even though the `doctors` row itself is still `is_active=true`; also resets `queue_rank_override` to `null` on reassignment (`20260821`) so a manually-reordered patient starts fresh FIFO in the new doctor's queue rather than keeping a rank meaningless outside their old cohort. `start_consultation` also fires a one-time `queue_next_alert` push (added `20260821`) to whoever is now `checked_in` at `queue_position=2` for that doctor+day — guarded by `next_up_alert_sent_at` so it doesn't repeat on later queue touches. Now CORS-enabled (`20260821`) — the doctors/mobile apps call `start_consultation`/`end_consultation`/`update_consult_notes`/`ring` cross-origin, which silently failed in the browser (blocked preflight, no error surfaced to the app) until this route gained `OPTIONS`/`AUTH_CORS_HEADERS` |
| `GET/POST /api/appointments/[id]/queue-position` | *(new)* | Manual queue reordering (added `20260821`), backed by `move_appointment_in_queue()` — see `Queue-Database-Schema.md`. Dual auth: tries staff (`requireRole`, hospital-scoped, any direction, `checked_in` only) first, falls back to the patient themselves (`getServerUser` + `patient_id` match, `checked_in` only, **`newPosition` must be greater than their current position** — never lets a patient jump ahead, only step back). `GET` returns `{ currentPosition, minPosition, maxPosition, estimatedWait, status }` (last two added `20260823`, for the patient app's live queue card — `status` lets the client distinguish `in_progress` (show "being seen now", no reorder UI) from `checked_in`) bounding the appointment's own urgency tier (emergency vs. everything else) — no other patient's identity is ever exposed. Status check loosened `20260823` from `checked_in`-only to `checked_in`/`in_progress` for `GET` (an in-progress patient's card still needs data; `POST`/the move itself still requires `checked_in`). `POST` body `{ newPosition }` → `{ success: true }`. CORS-enabled (called cross-origin by all three apps: web patient flow doesn't use it, but doctors/mobile front desk and mobile patient both do) |
| `GET /api/appointments/queue` | `getQueueForToday` | Today's physical queue (scheduled today OR checked in today) |
| `GET /api/appointments/stats?from&to` | `getRangeStats`, `getClinicRangeStats` | |
| `GET/PATCH /api/doctors/me` | `getDoctorAvgConsultDuration`, `setDoctorAvailability` | Doctor self-service, keyed on `caller.doctorId`. `GET` gained optional `?from&to&hospitalId` (added `20260821`, all backward-compatible no-ops when omitted) for the dashboard's date-range + hospital-affiliation filters — `hospitalId` is resolved against the caller's OWN `doctors` rows only (any `is_active` state, not just their currently-active one), never a client-trusted doctor id. Response gained `avgRatingOutOf10` (stored 1–5 `reviews.rating`, averaged over the range and doctor-row, then ×2 to 2dp — display-only rescale for this one dashboard stat, the underlying 1–5 star submission UI elsewhere is unchanged), `reviewCount`, `total`, `completed` |
| `GET /api/doctors/me/hospitals` | *(new)* | Added `20260821` for the dashboard's hospital-affiliation filter — every hospital the caller has EVER been linked to as a doctor, active or detached, unlike every other doctor-facing hospital list in the app (which filters to `is_active=true`). Returns `{ hospitals: [{ hospitalId, hospitalName, isActive }] }` |
| `GET /api/doctors/unassigned` | `getUnassignedDoctors` | |
| `GET/PATCH/DELETE /api/clinics/[clinicId]` | `getClinicDetail`, `getClinicDoctors`, `getClinicStaff`, `getClinicAppointments`, `getClinicRangeStats`, `getClinicHours`, `getHospitalHours`, `updateClinic`, `toggleClinicActive`, `setEmergencyClinic`/`clearEmergencyClinic`, `updateClinicHours`/`clearClinicHours`, `deleteClinic` | `DELETE` is `super_admin`/`hospital_admin` only — deliberately excludes `clinic_admin` (the original had no check at all); flagged for product confirmation. `GET`'s `stats` gained `avgWaitMinutes`/`avgConsultMinutes` (`20260823`) — computed from the SAME already-fetched, `orFilter`-scoped appointments list used for the `total`/`completed`/`cancelled` counts (added `waiting_time_secs` to that select; no new query), powering the clinic detail page's two new Overview stat cards. Unlike the vitals route above, `requireRole` here still isn't passed `req` — left as-is, this route has no real cross-origin caller (web dashboard only) |
| `POST /api/clinics/[clinicId]/doctors`, `DELETE .../doctors/[doctorId]` | `assignDoctorToClinic`, `createClinicDoctor`, `removeDoctorFromClinic` | |
| `GET/POST /api/hospitals/[id]/settings` | `getHospitalSettings`, `updateHospitalSettings`, `getHospitalHours`, `updateHospitalHours` | `super_admin`/`hospital_admin` only |
| `GET /api/hospitals/[id]/activity` | `getRecentActivity` | Dashboard notification bell |
| `POST /api/hospitals/[id]/specialties`, `DELETE .../specialties/[specialtyId]` | `addHospitalSpecialty`, `removeHospitalSpecialty` | |
| `GET/POST /api/services`, `PATCH/DELETE /api/services/[serviceId]` | `getHospitalServices`, `getRegisteredSpecialties`, `createService`, `updateService`, `toggleServiceActive`, `deleteService` | |
| `GET /api/schedule?weekStart&doctorId&clinicId` | `getWeekAppointments`, `getHospitalHours`, `getClinicHours` | A `doctor` caller is forced onto their own `doctorId` regardless of the query param |

`getAllSpecialties` was **not** given a route — `specialties` has a public RLS read
policy, so the pages that listed all specialties (doctor add form, services page)
fetch it via the caller's own anon-key client instead.

---

## Client-side gotcha: `Alert.alert` is a no-op on web *(found/fixed `20260821`)*

Not an API change, but worth recording next to the CORS notes above since it's the same
species of bug — something that silently does nothing in the browser with zero error
surfaced. `react-native-web`'s `Alert` polyfill (`node_modules/react-native-web/dist/
exports/Alert/index.js`) is `class Alert { static alert() {} }` — a complete no-op. Both
`mobile/` and `doctors/` are tested in-browser (Expo web), so every confirmation dialog
*and* every error/success message routed through `Alert.alert` (77 call sites across 25
files in both apps) silently did nothing on web: buttons whose only effect lived inside an
`onPress` nested in the never-rendered dialog (e.g. a "Withdraw booking" cancel flow, or a
referral's "Done" → `navigation.goBack()`) appeared completely broken, even though native
(iOS/Android) was unaffected. Fixed with a real replacement, not a native-only workaround:
`mobile/contexts/AlertContext.tsx` and `doctors/contexts/AlertContext.tsx` (identical,
theme-aware, `Modal`-based, supports the same `(title, message?, buttons?)` signature
including multi-button cases like a 1–5 star rating prompt), each mounted once via
`<AlertProvider>` at the app root inside `ThemeProvider`. Every file that imported `Alert`
from `'react-native'` now imports it from the local `contexts/AlertContext` module instead.

## Client-side gotcha: React Native's `Modal` breaks on web when more than one instance exists *(found/fixed `20260823`)*

Found while building the patient app's "ring" alert (`mobile/components/RingOverlay.tsx`,
triggered by the `ring` PATCH action above). Two distinct, confirmed-live symptoms from the
same root cause — `react-native-web`'s `<Modal>` doesn't cleanly support more than one
concurrent instance in the component tree:

1. **Buried, unclickable content.** `mobile/components/QueuePositionPicker.tsx`'s move
   confirmation used to call `Alert.alert(...)` for the "are you sure" step. Since
   `AlertContext`'s own `<Modal>` is mounted once at the app root (always present, just
   `visible={false}` when idle), and `QueuePositionPicker` is itself a second, on-demand
   `<Modal>`, the confirmation rendered *underneath* the picker's own overlay — invisible
   and unclickable, confirmed via a headless-browser click that silently hit the wrong
   element. Fixed by replacing the `Alert.alert` step with an inline confirmation view
   inside the same modal — no second `Modal` instance at all.
2. **Present in the DOM, invisible to text/accessibility extraction.** `RingOverlay`
   originally also used `<Modal>`. With `AlertContext`'s modal *and* this one both mounted,
   the overlay's content was confirmed present in the raw DOM (`aria-modal="true"`, correct
   text) and visually painted (React Native's `position:fixed` escapes a zero-size flow
   parent), but excluded from `document.body.innerText` and similar text-extraction —
   traced to a zero-height wrapper `<div>` react-native-web's `Modal` leaves in the tree
   under these conditions. Fixed by not using `<Modal>` at all: `RingOverlay` is a plain
   `View` with `position:'absolute', top/left/right/bottom: 0`, rendered directly inside
   `HomeScreen.tsx`'s root `<SafeAreaView>` (not inside `LiveQueueCard`, which is nested
   several levels deep — React Native's `position:'absolute'` is scoped to the nearest
   ancestor View, which is *every* View by RN's own default of `position:'relative'`, so an
   absolutely-positioned overlay mounted deep in a card only covers that card's box, not
   the screen; it has to be rendered near the screen root to actually cover the screen).

Net effect: any *second* concurrently-open `<Modal>` (including `AlertContext`'s
always-mounted-but-invisible one) is a known risk on web. Prefer a plain absolutely/fixed
positioned `View` rendered near the screen root for anything that must reliably overlay
the whole screen, and inline confirmation state over a nested `Alert.alert` for anything
opened from inside an already-open custom modal.

## Client-side gotcha: `supabase_realtime` publication was missing almost every table *(found/fixed `20260823`)*

Also found while building the ring alert — its realtime subscription never fired even
after every RLS/auth check passed. `ALTER PUBLICATION supabase_realtime ADD TABLE ...`
had only ever been run for `transport_patient_location`; every other
`.channel(...).on('postgres_changes', ...)` subscription in the codebase — 8 across
`appointments` alone (both doctor queue screens, front desk, staff appointments, three
web dashboard pages), plus one each for `virtual_sessions`, `transport_requests`, and
`ambulance_current_location` — had been silently inert since written: no error, the
subscription just never received an event, because Postgres was never publishing changes
on these tables at all (independent of and upstream of RLS). Fixed in
`supabase/migrations/20260823000003_realtime_publication_fix.sql`, adding all five missing
tables (plus `notifications` for the ring alert itself) to the publication. Confirmed via a
direct query against the live publication before writing the fix, not guessed — any new
`postgres_changes` subscription on a table not already in this list needs the same
migration pattern.

---

## Super Admin

### `GET /api/super-admin/analytics`
Returns aggregate platform analytics — no patient PHI. Per-hospital counts only.

| Field | Value |
|---|---|
| Auth | `requireRole(['super_admin'])` |

**Returns:**
```json
{
  "month": "2026-07",
  "hospitals": [
    {
      "id": "uuid",
      "name": "string",
      "city": "string",
      "state": "string",
      "type": "string | null",
      "is_verified": "boolean",
      "joined": "timestamptz",
      "monthly_bookings": 42,
      "total_completed": 310,
      "active_doctors": 5
    }
  ],
  "totals": {
    "hospitals": 12,
    "verified": 8,
    "monthly_bookings": 540,
    "total_completed": 4200,
    "active_doctors": 61
  }
}
```

---

## Error Response Format

All routes return errors in this shape:

```json
{ "error": "Human-readable message" }
```

Common status codes:

| Code | Meaning |
|---|---|
| 400 | Validation error or Supabase write error |
| 401 | Not authenticated |
| 403 | Authenticated but wrong role, or plan limit reached |
| 404 | Resource not found |
| 500 | Unexpected server error |

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

**Role resolution order:**
1. `users.is_super_admin = true` → `super_admin`
2. Row in `hospital_admins` → `hospital_admin`
3. Row in `clinic_admins` (by `user_id`) → `clinic_admin` or `front_desk`
4. Row in `doctors` (by `auth_user_id`) → `doctor`
5. Row in `clinic_admins` (by `auth_user_id` fallback) → `clinic_admin` or `front_desk`

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

---

### `POST /api/appointments/walkin`
Creates a walk-in appointment. Attempts to link to a registered patient by patient_number or phone. Enforces monthly booking cap (belt-and-suspenders above the DB trigger).

| Field | Value |
|---|---|
| Auth | `requireRole(['hospital_admin', 'clinic_admin', 'front_desk'])` |
| PHI note | `super_admin` excluded — walk-in intake creates patient records |

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

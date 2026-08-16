# Queue — Database Schema
**Updated:** July 2026 · Supabase / PostgreSQL · RLS enabled on all tables

---

## Core Tables

### `users`
Patient and staff profiles. One row per registered account. Most field edits go through
service-role API routes, but three onboarding flows (`/register`, `/staff/accept`, the
`doctors/` app's sign-up) do a direct client-side insert/upsert of their own row — so
`authenticated` keeps a narrow, explicit self-service `INSERT`/`UPDATE` column allowlist
(`full_name`, `phone`, `date_of_birth`, `gender`, `blood_group`, `address`, `city`,
`state`, `country`, `avatar_url`, `active_hospital_id`, plus `auth_id`/`email` — the latter
two pinned by RLS `WITH CHECK` to the caller's own session, never freely settable) rather
than the unrestricted table-level grant Supabase creates by default. `anon` has neither.
See migration `20260816000002`.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `auth_id` | uuid | yes | Supabase Auth UID — unique |
| `email` | text | no | |
| `full_name` | text | no | |
| `phone` | text | yes | |
| `patient_number` | text | yes | Auto-generated ref e.g. `QUE-00123` |
| `date_of_birth` | date | yes | |
| `gender` | text | yes | |
| `blood_group` | text | yes | |
| `address` | text | yes | |
| `city` | text | yes | |
| `state` | text | yes | |
| `country` | text | yes | |
| `avatar_url` | text | yes | |
| `is_verified` | boolean | yes | |
| `is_super_admin` | boolean | yes | Platform-wide admin flag |
| `active_hospital_id` | uuid | yes | FK → hospitals. Added Aug 2026. Disambiguates which of a doctor's linked `doctors` rows (see below) is "current" when they have more than one; ignored for patients. Self-service update is RLS-gated to hospitals the caller actually has an active `doctors` row at |
| `created_at` | timestamptz | yes | |
| `updated_at` | timestamptz | yes | |

---

### `hospitals`
One row per registered hospital or clinic group.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `name` | text | no | |
| `slug` | text | no | URL-safe identifier |
| `address` | text | no | |
| `city` | text | no | |
| `state` | text | no | |
| `country` | text | yes | |
| `phone` | text | yes | |
| `whatsapp` | text | yes | |
| `email` | text | yes | |
| `type` | text | yes | e.g. `General`, `Specialist`, `Teaching` |
| `description` | text | yes | |
| `registration_number` | text | yes | CAC / MDCN registration |
| `mdcn_accreditation` | text | yes | |
| `clinic_model` | text | yes | `single` or `multi` |
| `emr_system` | text | yes | |
| `lat` | float8 | yes | Legacy coordinates |
| `lng` | float8 | yes | Legacy coordinates |
| `latitude` | float8 | yes | GPS — added July 2026 |
| `longitude` | float8 | yes | GPS — added July 2026 |
| `logo_url` | text | yes | |
| `cover_url` | text | yes | |
| `accepts_virtual` | boolean | yes | |
| `emergency_hours` | boolean | yes | 24/7 emergency flag |
| `approval_mode` | text | yes | `auto` or `manual` |
| `requires_referral` | boolean | yes | |
| `daily_booking_limit` | integer | yes | null = unlimited; emergency exempt |
| `opd_fee` | integer | yes | In ₦ |
| `sms_reminder` | boolean | yes | |
| `email_reminder` | boolean | yes | |
| `avg_rating` | float8 | yes | Denormalised from reviews |
| `review_count` | integer | yes | |
| `total_bookings` | integer | yes | |
| `is_active` | boolean | yes | |
| `is_verified` | boolean | yes | |
| `created_at` | timestamptz | yes | |
| `updated_at` | timestamptz | yes | |

---

### `appointments`
Core booking record — one row per appointment.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `booking_ref` | text | no | e.g. `QUE-A12345`, `WLK-123456`, `DIR-A1B2C3D4` |
| `hospital_id` | uuid | **yes** | FK → hospitals. NULL for a direct (hospital-less) booking — see `doctor_user_id` below. Since `20260817000001` |
| `patient_id` | uuid | yes | FK → users; null = unregistered walk-in |
| `doctor_id` | uuid | yes | FK → doctors. NULL for a direct booking (mutually exclusive with `doctor_user_id` — see `appointments_booking_shape_check`) |
| `doctor_user_id` | uuid | yes | FK → users. Set only for a direct booking, where the doctor may have zero hospital-scoped `doctors` rows to reference (a fully independent doctor). Never set alongside `doctor_id`/`hospital_id`. Since `20260817000001` |
| `clinic_id` | uuid | yes | FK → hospital_clinics |
| `dependent_id` | uuid | yes | FK → dependents |
| `slot_id` | uuid | yes | FK → time_slots |
| `service_id` | uuid | yes | FK → services |
| `appointment_date` | date | no | |
| `start_time` | time | no | |
| `type` | text | no | `in-person`, `virtual`, or `home_visit` (direct bookings only, since `20260817000001`) |
| `status` | text | no | See status values below |
| `booking_mode` | text | yes | `doctor`, `hospital`, `walkin`, `referral`, `direct` (direct-to-doctor booking, since `20260817000001`) |
| `home_visit_address` | text | yes | Patient-provided address for a `type = 'home_visit'` direct booking. Since `20260817000001` |
| `approval_status` | text | yes | `pending_review`, `approved`, `auto_approved`, `rejected` |
| `urgency` | text | yes | `routine` or `emergency` |
| `reason` | text | yes | Patient-provided reason |
| `symptom_description` | text | yes | |
| `approval_note` | text | yes | Admin note on approve/reject |
| `diagnosis` | text | yes | Doctor-filled post-consult |
| `doctor_notes` | text | yes | |
| `prescription_url` | text | yes | |
| `queue_position` | integer | yes | Set only by `renumber_doctor_queue()` (trigger-driven, see below) — app code must not write this directly; it's recomputed for the whole doctor+day queue on every relevant change, not assigned per-row |
| `estimated_wait` | integer | yes | Minutes. Set alongside `queue_position` by the same trigger |
| `check_in_date` | date | yes | |
| `checked_in_at` | timestamptz | yes | Exact moment a row entered `checked_in`/`in_progress`, set once by the `set_checked_in_at` trigger (never overwritten on a later touch, e.g. `assign_doctor`). Queue order is `emergency DESC, checked_in_at ASC` — this is what actually determines queue position, not arrival order into the code path |
| `consult_started_at` | timestamptz | yes | |
| `consult_ended_at` | timestamptz | yes | |
| `consult_duration_secs` | integer | yes | **Generated column** (`round(extract(epoch from consult_ended_at - consult_started_at))`) — cannot be set directly; UPDATE errors with `428C9` if attempted. To close out a consult with an unknown/not-meaningfully-measurable duration, set `consult_ended_at` rather than trying to null this out. Feeds `renumber_doctor_queue()`'s live wait estimate and `GET /api/appointments/stats`'s "Avg Consultation Time" (hospital/clinic/per-doctor, date-range scoped) |
| `waiting_time_secs` | integer | yes | **Generated column**, same shape as `consult_duration_secs` (`round(extract(epoch from consult_started_at - checked_in_at))`) — check-in to being seen, not check-in to booked appointment time. NULL for any row from before `checked_in_at` existed (20260805000001) or that skipped check-in entirely. Feeds `GET /api/appointments/stats`'s "Avg Wait Time" (same scoping as above) |
| `vitals_weight_kg` | float8 | yes | |
| `vitals_height_cm` | float8 | yes | |
| `vitals_bp_systolic` | integer | yes | |
| `vitals_bp_diastolic` | integer | yes | |
| `vitals_blood_sugar` | float8 | yes | mg/dL |
| `vitals_bmi` | float8 | yes | Calculated on save |
| `vitals_recorded_at` | timestamptz | yes | |
| `walkin_patient_name` | text | yes | Unregistered walk-in only |
| `walkin_patient_phone` | text | yes | |
| `booked_by_staff_id` | uuid | yes | FK → **users** (confirmed live via a `PGRST201` ambiguous-embed error — this doc previously said clinic_admins, which is wrong; no migration in this repo creates this column or constraint, so it was added directly to prod outside tracked migrations). Any `appointments` query embedding `users(...)` without disambiguating (`users!appointments_patient_id_fkey(...)`) is rejected outright by PostgREST because of this second FK — check any new bare `users(...)` embed on this table for the same failure |
| `assigned_doctor_id` | uuid | yes | Staff-reassigned doctor |
| `referred_by_doctor_id` | uuid | yes | FK → doctors. Set when `booking_mode = 'referral'` — the doctor who referred this patient, at whatever hospital they belong to (not this appointment's `hospital_id`, which is the *receiving* hospital) |
| `referring_hospital_id` | uuid | yes | FK → hospitals. Denormalised from `referred_by_doctor_id`'s hospital at referral time, so the referring hospital's name still displays correctly even if that doctor later moves hospitals or is deactivated |
| `referring_clinic_id` | uuid | yes | FK → hospital_clinics. Denormalised from `referred_by_doctor_id`'s clinic at referral time — set for both same-hospital clinic-to-clinic transfers and cross-hospital referrals where the referring doctor belongs to a clinic |
| `referral_reason` | text | yes | Doctor-provided reason for the referral, shown to the receiving hospital separately from `reason`/`symptom_description` |
| `refund_pct` | integer | yes | 0, 50, or 100 |
| `cancellation_reason` | text | yes | |
| `cancelled_at` | timestamptz | yes | |
| `no_show_at` | timestamptz | yes | Set when status transitions to `no_show`, manually (staff) or automatically (`process_missed_appointments` cron, 2+ days past `appointment_date` with no completion) |
| `reschedule_deadline` | timestamptz | yes | Set alongside `no_show_at` — informational free-reschedule window (48h), shown to staff; not itself enforced anywhere. The actual reschedule cap is `reschedule_count` below |
| `rescheduled_from` | uuid | yes | Self-FK → appointments. Set on the *new* row created by a reschedule; the original row gets `status = 'cancelled'` (or is left as-is if it's already terminal, e.g. `no_show`) |
| `reschedule_count` | integer | no | 0 = original booking, 1 = this row is itself the result of one reschedule. `enforce_reschedule_limit` trigger rejects inserting a reschedule (`rescheduled_from` set) of a row where this is already ≥ 1 — one free reschedule per booking chain, enforced at INSERT time regardless of caller |
| `reminder_sent_24h` | boolean | yes | |
| `reminder_sent_1h` | boolean | yes | |
| `emr_record_id` | text | yes | |
| `emr_synced` | boolean | yes | |
| `created_at` | timestamptz | yes | |
| `updated_at` | timestamptz | yes | |

**Status values:** `pending` → `confirmed` → `checked_in` → `in_progress` → `completed` | `cancelled` | `no_show`

**`appointments_booking_shape_check`** (CHECK constraint, since `20260817000001`): exactly one of two shapes per row —
`(hospital_id, doctor_id) NOT NULL AND doctor_user_id NULL` (hospital-mediated) or
`(hospital_id, doctor_id) NULL AND doctor_user_id NOT NULL` (direct booking). Keeps every existing
`hospital_id`/`doctor_id`-keyed query correctly blind to direct bookings — they just don't match.

**DB Triggers:**
- `appointment_status_guard` — blocks status changes FROM `completed`, `cancelled`, or `no_show`
- `enforce_plan_booking_limit` — blocks INSERT if hospital has reached plan's `max_monthly_bookings`. No-ops for a direct booking (`hospital_id IS NULL` never matches a plan) — direct bookings are never subject to a hospital's monthly cap
- `enforce_no_duplicate_active_booking` — blocks INSERT of a second active (non-`emergency`) booking for the same patient/dependent at the same hospital (or same clinic, for `multi` clinic_model hospitals). For a direct booking (`hospital_id IS NULL`), dedupes on `doctor_user_id` instead, since `NULL = NULL` never matches in SQL and the hospital-keyed path would otherwise silently never catch a duplicate direct booking (since `20260817000001`)
- `enforce_reschedule_limit` — blocks INSERT of a reschedule (`rescheduled_from` set) whose original already has `reschedule_count >= 1`; otherwise sets `NEW.reschedule_count = original.reschedule_count + 1`
- `set_checked_in_at` (BEFORE INSERT OR UPDATE) — stamps `checked_in_at = now()` the first time status enters `checked_in`/`in_progress`; never overwrites an existing value
- `renumber_queue_after_change` (AFTER INSERT OR UPDATE OF `status`, `doctor_id`, `assigned_doctor_id`, `urgency`, `checked_in_at`) — calls `renumber_doctor_queue()` for every doctor+day a row's change could affect (its current doctor(s), and on UPDATE, whichever it previously belonged to if that changed). Deliberately scoped to those specific columns: `renumber_doctor_queue()`'s own UPDATE only touches `queue_position`/`estimated_wait`, which aren't in that list, so its writes don't re-fire this trigger — omitting that scoping would recurse.

`renumber_doctor_queue(hospital_id, doctor_id, check_in_date)` (function, `SECURITY DEFINER`) — takes `pg_advisory_xact_lock` on `(doctor_id, check_in_date)` first, so two concurrent callers for the same doctor+day serialize instead of both reading the same "0 others ahead" state (this is what previously let two check-ins both land on `queue_position = 1`). Then renumbers *every* `checked_in`/`in_progress` row for that doctor+day via `ROW_NUMBER() OVER (ORDER BY (urgency = 'emergency') DESC, checked_in_at ASC NULLS LAST, created_at, id)` and recomputes `estimated_wait` from each doctor's own average `consult_duration_secs`. Renumbering the whole set (not just assigning a slot to whoever just joined) also means a departure (complete/cancel/no-show) closes the gap for everyone behind them, not just arrivals getting a fresh count.

**pg_cron jobs:**
- `process-missed-appointments` (`process_missed_appointments()`, daily 03:00 UTC) — 1 day past `appointment_date` with no completion: in-app "want to reschedule?" notification (`type: 'reschedule_prompt'`). 2+ days past: auto-transitions `pending`/`confirmed`/`checked_in` → `no_show` and notifies (`type: 'no_show'`). In-app only — no `pg_net`/`http` extension is installed in this project, so it can't call the Expo push endpoint the way `notifyPatient()` (web) does. Also sweeps stale check-ins independent of `appointment_date`, keyed off `check_in_date` instead (check-in is a real-time event, so "still open past the calendar day it happened" needs no grace period): `checked_in` rows past that day with no `consult_started_at` → `no_show` + notified (they physically showed up but were never seen); `in_progress` rows past that day → `completed` with `consult_ended_at` set (no notification — a routine completion isn't actionable for the patient the way a no-show is). Added after a live incident where `checkInAppointment()` checking a future-dated booking in today (by design, so a walk-in for a different day still joins today's queue) left it invisible to every current-day queue view and blocking new bookings for that patient via `enforce_no_duplicate_active_booking`.

---

### `vitals_audit_log` *(added July 2026)*
Immutable record of every vitals save. One row per save event.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `appointment_id` | uuid | no | FK → appointments (CASCADE DELETE) |
| `recorded_by_auth_id` | uuid | yes | Supabase Auth UID of the staff member |
| `recorded_at` | timestamptz | no | Default: `now()` |
| `weight_kg` | float8 | yes | |
| `height_cm` | float8 | yes | |
| `bp_systolic` | integer | yes | |
| `bp_diastolic` | integer | yes | |
| `blood_sugar` | float8 | yes | mg/dL |
| `bmi` | float8 | yes | Calculated at write time |

**Index:** `(appointment_id, recorded_at DESC)`  
**RLS:** Enabled; writes are service-role only. Two SELECT policies (verified directly
against production 2026-07-26, applied outside the tracked migration history — see
`Queue-RLS-Policies.md`): the treating doctor, and front-desk staff scoped to their
hospital via `clinic_admins`.

---

### `counter_reconciliation_log` *(added July 2026)*
Logs `hospitals`/`doctors` denormalised counter values that were wrong, immediately
before `recompute_denormalised_counters()` (scheduled nightly at 02:00 UTC via
`pg_cron`) overwrites them — so drift is visible instead of silently self-healing.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `ran_at` | timestamptz | no | Default: `now()` |
| `entity_type` | text | no | `'hospital'` or `'doctor'` |
| `entity_id` | uuid | no | |
| `column_name` | text | no | e.g. `avg_rating`, `total_bookings` |
| `old_value` | text | yes | |
| `new_value` | text | yes | |

**RLS:** Enabled; readable by active platform admins only.

---

## Staff & Access Tables

### `hospital_admins`
Links users to hospitals with an admin role.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `user_id` | uuid | no | FK → users |
| `role` | text | yes | `admin`, `owner`, `specialist`, `front_desk` |
| `credentials` | jsonb | yes | Login credential metadata |
| `created_at` | timestamptz | yes | |

### `clinic_admins`
Links users to clinics with a scoped role (`clinic_admin` or `front_desk`).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `clinic_id` | uuid | no | FK → hospital_clinics |
| `hospital_id` | uuid | no | FK → hospitals |
| `user_id` | uuid | no | FK → users |
| `role` | text | yes | `clinic_admin` or `front_desk` |
| `is_active` | boolean | yes | Deactivate without deleting |
| `created_at` | timestamptz | yes | |

> Used to also have `auth_user_id` (a second identity path alongside `user_id`) — dropped
> after confirming zero production rows depended on it (`user_id` was already NOT NULL in
> practice). `requireRole()` and this table now have a single identity path.

### `hospital_clinics`
Individual clinics within a multi-clinic hospital.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `name` | text | no | |
| `description` | text | yes | |
| `is_active` | boolean | yes | |
| `sort_order` | integer | yes | |
| `created_at` | timestamptz | yes | |

---

## Clinical Tables

### `doctors`

> Since Aug 2026, a doctor's identity is their `users` row, not a `doctors` row — a doctor
> account is created hospital-agnostically (self-registered in the `doctors/` app, same
> shape as a patient signup) and then **linked** to one or more hospitals via
> `POST /api/doctors/link`, which inserts one `doctors` row per hospital affiliation, all
> sharing the same `user_id`. `hospital_id` stays `NOT NULL` on this table (schema
> unchanged), so a doctor with N hospitals has N rows here, not one hospital-agnostic row.
> `users.active_hospital_id` picks which row is "current" wherever a single doctor
> identity is needed (dashboard auth, mobile). All doctor-identity lookups across
> `web`/`mobile` fetch *all* matching `doctors` rows for a caller (not `.single()`), since
> more than one can now legitimately match.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `clinic_id` | uuid | yes | FK → hospital_clinics |
| `user_id` | uuid | yes | FK → users. Shared across every hospital a doctor is linked to — this is what makes the doctor's identity portable |
| `auth_user_id` | uuid | yes | Direct Supabase Auth UID. Legacy path from portal-created (not self-registered) doctor accounts; still resolved alongside `user_id` everywhere |
| `email` | text | yes | Portal login email |
| `full_name` | text | no | |
| `title` | text | yes | e.g. `Dr.` |
| `qualification` | text | yes | e.g. `MBBS, FWACS` |
| `specialty_id` | uuid | yes | FK → specialties |
| `mdcn_number` | text | yes | MDCN licence number |
| `years_experience` | integer | yes | |
| `consultation_fee` | integer | yes | In ₦ |
| `virtual_fee` | integer | yes | In ₦ |
| `accepts_virtual` | boolean | yes | |
| `bio` | text | yes | |
| `avatar_url` | text | yes | |
| `avg_rating` | float8 | yes | Denormalised from reviews |
| `review_count` | integer | yes | |
| `is_active` | boolean | yes | |
| `created_at` | timestamptz | yes | |
| `updated_at` | timestamptz | yes | |

### `doctor_profiles` *(added Aug 2026, migration `20260817000001`)*
A doctor's hospital-agnostic public profile and settings for **direct** (patient-initiated,
no-hospital) bookings — distinct from `doctors`, which stays per-hospital-affiliation and keeps
its own `consultation_fee`/`virtual_fee`/`bio`/etc. per link. One row per `users.id`, whether or
not that account has any `doctors` row at all.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `user_id` | uuid | no | Primary key, FK → users |
| `title` | text | yes | e.g. `Dr.` |
| `specialty_id` | uuid | yes | FK → specialties |
| `bio` | text | yes | |
| `qualification` | text | yes | Free text, e.g. `MBBS, FWACS` |
| `years_experience` | integer | yes | |
| `virtual_fee` | integer | yes | ₦. Only shown/used if `accepts_direct_virtual` |
| `home_visit_fee` | integer | yes | ₦. Only shown/used if `accepts_direct_home_visit` |
| `accepts_direct_virtual` | boolean | no | Default `false` |
| `accepts_direct_home_visit` | boolean | no | Default `false` |
| `show_phone_to_patients` | boolean | no | Default `false`. Gates whether `users.phone` is included in `GET /api/public/doctors/*` responses — redacted server-side, never left to the client |
| `created_at` / `updated_at` | timestamptz | no | |

RLS: doctor manages their own row only (`user_id` resolves to `auth.uid()` via `users.auth_id`).
No public SELECT policy — patient-facing reads go through `GET /api/public/doctors/search` and
`GET /api/public/doctors/[id]` (service-role, explicit safe-column projection + phone redaction),
matching this app's established pattern for cross-account public reads.

### `doctor_qualification_documents` *(added Aug 2026, migration `20260817000001`)*
Uploaded credential/certificate files for a doctor's independent profile (e.g. licence, degree
certificate) — patients can view these on a doctor's public profile before booking directly.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `user_id` | uuid | no | FK → users |
| `title` | text | no | Doctor-provided label, e.g. "MDCN Licence" |
| `file_path` | text | no | Object path within the `doctor-credentials` Storage bucket — not a public URL |
| `uploaded_at` | timestamptz | no | |

RLS: doctor manages their own rows only. The `doctor-credentials` Storage bucket is **private**
(not public) — every read, by the owning doctor or a browsing patient, goes through a
service-role-generated signed URL (5-minute TTL) from `GET /api/doctors/qualifications` or
`GET /api/public/doctors/[id]`, never a direct Storage URL. This is the first Supabase Storage
bucket used anywhere in this project; there was no prior pattern for Storage RLS to follow, so
`storage.objects` access is scoped to each doctor's own `{user_id}/...` path prefix.

### `specialties`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `name` | text | no | e.g. `Cardiology` |
| `slug` | text | no | |
| `icon` | text | yes | Emoji or icon key |
| `is_active` | boolean | yes | |
| `sort_order` | integer | yes | |

### `time_slots`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `doctor_id` | uuid | no | FK → doctors |
| `slot_date` | date | no | |
| `start_time` | time | no | |
| `end_time` | time | no | |
| `is_virtual` | boolean | yes | |
| `is_available` | boolean | yes | |
| `max_capacity` | integer | yes | |
| `booked_count` | integer | yes | |
| `created_at` | timestamptz | yes | |

### `availability_templates`
Recurring weekly availability per doctor.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `doctor_id` | uuid | no | FK → doctors |
| `day_of_week` | integer | no | 0=Sun … 6=Sat |
| `start_time` | time | no | |
| `end_time` | time | no | |
| `slot_duration` | integer | yes | Minutes |
| `max_concurrent` | integer | yes | |
| `is_virtual` | boolean | yes | |
| `is_active` | boolean | yes | |
| `created_at` | timestamptz | yes | |

### `slot_overrides`
One-off date overrides (blocked days, holiday closures).

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `doctor_id` | uuid | no | FK → doctors |
| `override_date` | date | no | |
| `is_blocked` | boolean | yes | |
| `reason` | text | yes | |
| `created_at` | timestamptz | yes | |

---

## Patient Tables

### `dependents`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `user_id` | uuid | no | FK → users (the account holder) |
| `full_name` | text | no | |
| `date_of_birth` | date | yes | |
| `gender` | text | yes | |
| `relationship` | text | yes | e.g. `Child`, `Spouse` |
| `created_at` | timestamptz | yes | |

### `user_insurance`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `user_id` | uuid | no | FK → users |
| `provider` | text | yes | HMO / insurer name |
| `plan_name` | text | yes | |
| `policy_number` | text | yes | |
| `created_at` | timestamptz | yes | |

---

## Billing & Payments

### `subscription_plans`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `name` | text | no | `starter`, `pro`, `growth`, `enterprise` |
| `display_name` | text | no | Human-readable |
| `price_monthly` | integer | no | In ₦ |
| `price_annual` | integer | yes | In ₦ |
| `max_doctors` | integer | yes | null = unlimited |
| `max_monthly_bookings` | integer | yes | null = unlimited; enforced by DB trigger |
| `features` | jsonb | yes | Feature flag map |
| `is_active` | boolean | yes | |
| `sort_order` | integer | yes | |
| `created_at` | timestamptz | yes | |

### `hospital_subscriptions`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals (unique — one plan per hospital) |
| `plan_id` | uuid | no | FK → subscription_plans |
| `status` | text | no | `active`, `trialing`, `past_due`, `cancelled` |
| `billing_cycle` | text | yes | `monthly` or `annual` |
| `current_period_start` | timestamptz | yes | |
| `current_period_end` | timestamptz | yes | |
| `trial_ends_at` | timestamptz | yes | |
| `paystack_customer_id` | text | yes | Paystack (not yet live) |
| `paystack_sub_code` | text | yes | |
| `created_at` | timestamptz | yes | |
| `updated_at` | timestamptz | yes | |

### `payments`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `appointment_id` | uuid | yes | FK → appointments |
| `patient_id` | uuid | no | FK → users |
| `hospital_id` | uuid | no | FK → hospitals |
| `amount` | integer | no | In kobo (₦ × 100) |
| `currency` | text | no | Default `NGN` |
| `platform_fee` | integer | no | Queue's cut |
| `hospital_payout` | integer | yes | Hospital's net |
| `status` | text | no | `pending`, `success`, `failed`, `refunded` |
| `method` | text | yes | `card`, `bank_transfer` |
| `paystack_ref` | text | yes | |
| `paystack_access_code` | text | yes | |
| `paid_at` | timestamptz | yes | |
| `refund_reason` | text | yes | |
| `refunded_at` | timestamptz | yes | |
| `metadata` | jsonb | yes | |
| `created_at` | timestamptz | yes | |

### `payouts`
Batch hospital payouts.

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `amount` | integer | no | In ₦ |
| `status` | text | no | `pending`, `paid` |
| `period_start` | date | no | |
| `period_end` | date | no | |
| `booking_count` | integer | yes | |
| `bank_account` | text | yes | |
| `transfer_ref` | text | yes | |
| `paid_at` | timestamptz | yes | |
| `created_at` | timestamptz | yes | |

---

## Content & Media

### `reviews`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `appointment_id` | uuid | no | FK → appointments (unique — one review per appointment) |
| `patient_id` | uuid | no | FK → users |
| `doctor_id` | uuid | no | FK → doctors |
| `hospital_id` | uuid | no | FK → hospitals |
| `rating` | integer | no | 1–5 |
| `body` | text | yes | |
| `hospital_reply` | text | yes | |
| `replied_at` | timestamptz | yes | |
| `is_visible` | boolean | yes | |
| `created_at` | timestamptz | yes | |

### `notifications`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `user_id` | uuid | no | FK → users |
| `type` | text | no | `booking_confirmed`, `reminder`, etc. |
| `title` | text | no | |
| `body` | text | no | |
| `data` | jsonb | yes | Deep-link payload |
| `is_read` | boolean | yes | |
| `sent_via` | text[] | yes | `['push', 'sms', 'email']` |
| `sent_at` | timestamptz | yes | |
| `created_at` | timestamptz | yes | |

### `appointment_documents`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `appointment_id` | uuid | no | FK → appointments (CASCADE DELETE) |
| `uploaded_by` | uuid | no | FK → users |
| `url` | text | no | Storage URL |
| `file_name` | text | yes | |
| `mime_type` | text | yes | |
| `file_size` | integer | yes | Bytes |
| `doc_type` | text | yes | `referral`, `result`, `prescription` |
| `created_at` | timestamptz | yes | |

### `hospital_images`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `url` | text | no | |
| `caption` | text | yes | |
| `sort_order` | integer | yes | |
| `created_at` | timestamptz | yes | |

---

## Reference Tables

### `services`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `specialty_id` | uuid | yes | FK → specialties |
| `name` | text | no | |
| `description` | text | yes | |
| `base_price` | integer | yes | In ₦ |
| `virtual_price` | integer | yes | In ₦ |
| `duration_mins` | integer | yes | |
| `is_active` | boolean | yes | |
| `created_at` | timestamptz | yes | |

### `hospital_operating_hours`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `day_of_week` | integer | no | 0=Sun … 6=Sat; unique per hospital |
| `open_time` | time | no | |
| `close_time` | time | no | |
| `is_closed` | boolean | yes | |

### `virtual_sessions`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `appointment_id` | uuid | no | FK → appointments (unique; CASCADE DELETE) |
| `status` | text | no | `waiting`, `active`, `ended` |
| `room_name` | text | yes | |
| `room_url` | text | yes | |
| `host_token` | text | yes | Doctor token |
| `guest_token` | text | yes | Patient token |
| `started_at` | timestamptz | yes | |
| `ended_at` | timestamptz | yes | |
| `duration_secs` | integer | yes | |
| `recording_url` | text | yes | |
| `created_at` | timestamptz | yes | |

### `emr_integrations`

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals (unique) |
| `system_name` | text | no | |
| `fhir_base_url` | text | yes | |
| `auth_type` | text | yes | |
| `credentials` | jsonb | yes | Encrypted at rest |
| `sync_status` | text | yes | |
| `last_sync_at` | timestamptz | yes | |
| `error_message` | text | yes | |
| `is_active` | boolean | yes | |
| `created_at` | timestamptz | yes | |
| `updated_at` | timestamptz | yes | |

---

## Junction Tables

| Table | Columns | Purpose |
|---|---|---|
| `doctor_specialties` | `doctor_id` → doctors, `specialty_id` → specialties | Many-to-many doctor ↔ specialty |
| `hospital_specialties` | `hospital_id` → hospitals, `specialty_id` → specialties | Many-to-many hospital ↔ specialty |

---

## DB Triggers (July 2026)

| Trigger | Table | Event | Purpose |
|---|---|---|---|
| `appointment_status_guard` | `appointments` | BEFORE UPDATE OF status | Blocks changes FROM `completed`, `cancelled`, `no_show` |
| `enforce_plan_booking_limit` | `appointments` | BEFORE INSERT | Rejects insert if hospital has hit `max_monthly_bookings` for their plan |

---

## Applied Migrations

| File | What it does |
|---|---|
| `20260531115800` | Patient booking RLS + time_slots RLS |
| `20260531115900` | Fix hospital_admins role constraint |
| `20260531120000` | Add `credentials` JSONB to hospital_admins |
| `20260531120100` | Add unique constraint on `users.auth_id` |
| `20260531120200` | Create `user_insurance` table + RLS |
| `20260531130000` | users RLS |
| `20260531140000` | dependents RLS |
| `20260531150000` | RLS on specialties, doctors, services, operating_hours, notifications, appointment_documents, hospitals |
| `20260531160000` | doctor_specialties RLS |
| `20260601000000` | reviews RLS |
| `20260601010000` | Unique constraint on operating_hours (hospital_id, day_of_week) |
| `20260601020000` | Tighten time_slots UPDATE policy |
| `20260601030000` | RLS on hospital_admins, hospital_subscriptions, payments, payouts, virtual_sessions, emr_integrations |
| `20260601040000` | reviews policy + one-review-per-appointment constraint |
| `20260601050000` | RLS on subscription_plans, availability_templates, slot_overrides, hospital_images |
| `20260601060000` | CASCADE deletes on appointment_documents + virtual_sessions; performance indexes |
| `20260714000000` | Add `latitude`, `longitude` (double precision) to hospitals |
| `20260719000000` | Create `vitals_audit_log` table + RLS |
| `20260719000001` | `guard_appointment_status` trigger + `enforce_plan_booking_limit` trigger |
| … | *(`20260719000002` through `20260724000004` predate this list and aren't documented here — pre-existing gap, not introduced this session)* |
| `20260726000001` | `get_doctor_queue`: add caller authorisation check, revoke `anon` grant |
| `20260726000002` | `increment_slot_booking`: revoke `anon`/`authenticated`, grant `service_role` only |
| `20260726000003` | *(superseded, kept for history)* first attempt at column-level privacy on `doctors`/`hospitals` — a no-op, see `000004` |
| `20260726000004` | Column-privacy fix for `doctors`/`hospitals`: revoke `anon`'s table-level SELECT, grant an explicit column allowlist (closes a direct-PostgREST leak of `doctors.email`/`auth_user_id`/`mdcn_number` and `hospitals.email`/`registration_number`/`mdcn_accreditation`) |
| `20260726000005` | `clinic_admins` identity collapse, prep: fix `vitals_audit_log`'s front-desk policy and `get_doctor_queue` to key on `user_id` instead of the dead `auth_user_id`; `user_id` set NOT NULL |
| `20260726000006` | `clinic_admins`: drop `auth_user_id` column |
| `20260726000007` | Add `counter_reconciliation_log` table + `recompute_denormalised_counters()` + nightly `pg_cron` schedule |
| … | *(`20260727000001` through `20260801000001` predate this list and aren't documented here — pre-existing gap, not introduced this session)* |
| `20260803000001` | Doctor referrals: add `referred_by_doctor_id`, `referring_hospital_id`, `referral_reason` to `appointments` |
| `20260803000002` | `get_doctor_queue`: return the new referral columns |
| `20260804000001` | `Doctors can read own appointments` RLS policy: also match doctors linked via `user_id` (previously `auth_user_id` only) |
| `20260804000002` | Add `reschedule_count` to `appointments` + `enforce_reschedule_limit` trigger (cap at 1 free reschedule per booking chain) |
| `20260804000003` | `process_missed_appointments()` + daily pg_cron job: auto no-show (2+ days) and reschedule-prompt notification (1 day) |
| `20260805000001` | Add `checked_in_at`; `renumber_doctor_queue()` + `set_checked_in_at`/`renumber_queue_after_change` triggers — queue position now ordered by actual check-in time and assigned atomically (fixes duplicate `queue_position` values from the old read-then-write JS computation) |
| `20260806000001` | Add `waiting_time_secs` generated column (check-in to consultation start), same shape as `consult_duration_secs` |
| `20260807000001` | Add `referring_clinic_id` to `appointments` — supports same-hospital clinic-to-clinic referrals, not just cross-hospital ones |
| `20260808000001` | `get_doctor_queue`: return `referring_clinic_name` alongside the existing referral columns |
| `20260809000001` | `process_missed_appointments()`: also sweep stale `checked_in`/`in_progress` rows by `check_in_date` (independent of `appointment_date`) — `checked_in` past that day with no consult started → `no_show`; `in_progress` past that day → `completed` |
| `20260816000001` | Independent, multi-hospital doctor accounts: add `users.active_hospital_id` (FK → hospitals) + index; RLS policy letting a doctor set it themselves, but only to a hospital where they have an active `doctors` row |
| `20260816000002` | **Security fix:** `users`' insert/update RLS policies (from `20260531130000`) had no `WITH CHECK` on column values, so any signed-in user could set their own `is_super_admin`/`is_verified`/`patient_number`, or hijack another (not-yet-registered) identity's `auth_id`, via a raw PostgREST call — revokes the table-level `INSERT`/`UPDATE` grants and re-grants an explicit safe-column allowlist (mirrors the `doctors`/`hospitals` column-privacy pattern from `20260726000004`); `auth_id`/`email` stay in the allowlist (three onboarding flows need to write them) but are pinned by `WITH CHECK` to the caller's own `auth.uid()`/JWT email; folds in and drops `20260816000001`'s standalone active-hospital policy to avoid a multiple-permissive-policy OR-bypass |

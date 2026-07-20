# Queue — Database Schema
**Updated:** July 2026 · Supabase / PostgreSQL · RLS enabled on all tables

---

## Core Tables

### `users`
Patient and staff profiles. One row per registered account.

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
| `booking_ref` | text | no | e.g. `QUE-A12345` or `WLK-123456` |
| `hospital_id` | uuid | no | FK → hospitals |
| `patient_id` | uuid | yes | FK → users; null = unregistered walk-in |
| `doctor_id` | uuid | no | FK → doctors |
| `clinic_id` | uuid | yes | FK → hospital_clinics |
| `dependent_id` | uuid | yes | FK → dependents |
| `slot_id` | uuid | yes | FK → time_slots |
| `service_id` | uuid | yes | FK → services |
| `appointment_date` | date | no | |
| `start_time` | time | no | |
| `type` | text | no | `in-person` or `virtual` |
| `status` | text | no | See status values below |
| `booking_mode` | text | yes | `doctor`, `walkin`, `emergency` |
| `approval_status` | text | yes | `pending_review`, `approved`, `auto_approved`, `rejected` |
| `urgency` | text | yes | `routine` or `emergency` |
| `reason` | text | yes | Patient-provided reason |
| `symptom_description` | text | yes | |
| `approval_note` | text | yes | Admin note on approve/reject |
| `diagnosis` | text | yes | Doctor-filled post-consult |
| `doctor_notes` | text | yes | |
| `prescription_url` | text | yes | |
| `queue_position` | integer | yes | |
| `estimated_wait` | integer | yes | Minutes |
| `check_in_date` | date | yes | |
| `consult_started_at` | timestamptz | yes | |
| `consult_ended_at` | timestamptz | yes | |
| `consult_duration_secs` | integer | yes | |
| `vitals_weight_kg` | float8 | yes | |
| `vitals_height_cm` | float8 | yes | |
| `vitals_bp_systolic` | integer | yes | |
| `vitals_bp_diastolic` | integer | yes | |
| `vitals_blood_sugar` | float8 | yes | mg/dL |
| `vitals_bmi` | float8 | yes | Calculated on save |
| `vitals_recorded_at` | timestamptz | yes | |
| `walkin_patient_name` | text | yes | Unregistered walk-in only |
| `walkin_patient_phone` | text | yes | |
| `booked_by_staff_id` | uuid | yes | FK → clinic_admins |
| `assigned_doctor_id` | uuid | yes | Staff-reassigned doctor |
| `refund_pct` | integer | yes | 0, 50, or 100 |
| `cancellation_reason` | text | yes | |
| `cancelled_at` | timestamptz | yes | |
| `reminder_sent_24h` | boolean | yes | |
| `reminder_sent_1h` | boolean | yes | |
| `emr_record_id` | text | yes | |
| `emr_synced` | boolean | yes | |
| `created_at` | timestamptz | yes | |
| `updated_at` | timestamptz | yes | |

**Status values:** `pending` → `confirmed` → `checked_in` → `in_progress` → `completed` | `cancelled` | `no_show`

**DB Triggers:**
- `appointment_status_guard` — blocks status changes FROM `completed`, `cancelled`, or `no_show`
- `enforce_plan_booking_limit` — blocks INSERT if hospital has reached plan's `max_monthly_bookings`

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
**RLS:** Enabled; service-role writes only. No SELECT policies yet.

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
| `auth_user_id` | uuid | yes | Direct Supabase Auth UID (fallback path) |
| `role` | text | yes | `clinic_admin` or `front_desk` |
| `is_active` | boolean | yes | Deactivate without deleting |
| `created_at` | timestamptz | yes | |

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

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `id` | uuid | no | Primary key |
| `hospital_id` | uuid | no | FK → hospitals |
| `clinic_id` | uuid | yes | FK → hospital_clinics |
| `user_id` | uuid | yes | FK → users (their portal account) |
| `auth_user_id` | uuid | yes | Direct Supabase Auth UID |
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

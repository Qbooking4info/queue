# Queue — Row Level Security Policies
**Updated:** July 2026 · All tables have RLS enabled · Service-role (admin) always bypasses RLS

Web API routes use `createAdminClient()` (service role key) and are **not affected by these policies**. Policies protect direct anon-key access — primarily from the mobile app and any unauthenticated requests.

---

## `users`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own profile | SELECT | `auth_id = auth.uid()` |
| Users can insert own profile | INSERT | `auth_id = auth.uid()` |
| Users can update own profile | UPDATE | `auth_id = auth.uid()` |

---

## `dependents`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own dependents | SELECT | `user_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Users can insert own dependents | INSERT | same |
| Users can update own dependents | UPDATE | same |
| Users can delete own dependents | DELETE | same |

---

## `user_insurance`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own insurance | SELECT | `user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Users can insert own insurance | INSERT | same |
| Users can update own insurance | UPDATE | same |
| Users can delete own insurance | DELETE | same |

---

## `hospitals`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active hospitals | SELECT | `true` (all rows readable) |

---

## `specialties`
| Policy | Operation | Rule |
|---|---|---|
| Public can read specialties | SELECT | `true` |

---

## `hospital_specialties`
| Policy | Operation | Rule |
|---|---|---|
| Public can read hospital specialties | SELECT | `true` |

---

## `doctors`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active doctors | SELECT | `true` |

---

## `services`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active services | SELECT | `true` |

---

## `hospital_operating_hours`
| Policy | Operation | Rule |
|---|---|---|
| Public can read operating hours | SELECT | `true` |

---

## `doctor_specialties`
| Policy | Operation | Rule |
|---|---|---|
| Public can read doctor specialties | SELECT | `true` |

---

## `time_slots`
| Policy | Operation | Rule |
|---|---|---|
| Public can read available slots | SELECT | `is_available = true` |
| Hospital admins manage slots | ALL | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |
| Patients can update own booked slot count | UPDATE | `is_available = true AND id IN (SELECT slot_id FROM appointments WHERE patient_id = ... AND status = 'pending')` |

> The slot UPDATE policy was tightened (migration `20260601020000`) so patients can only increment `booked_count` on a slot they hold a pending appointment for.

---

## `appointments`
*Re-checked against production 2026-10-13 (pg_policies). Patient writes are additionally constrained by guard triggers — see below.*

| Policy | Operation | Rule |
|---|---|---|
| appointments_patient_insert / patients_insert_own | INSERT | `patient_id IN (SELECT current_patient_ids())` |
| appointments_patient_select / patients_select_own | SELECT | `patient_id IN (SELECT current_patient_ids())` |
| appointments_patient_update | UPDATE | patient's own row in `pending`/`confirmed`; WITH CHECK allows the new row to be `cancelled` (20261013200001) |
| appointments_hospital_select / appointments_hospital_update | SELECT / UPDATE | active, non-crew `hospital_admins` of the row's hospital (20261013000009) |
| Front desk can manage clinic appointments | ALL | `clinic_admins` of the row's hospital |
| Doctors can read own appointments / own direct appointments | SELECT | `current_doctor_ids()` on `doctor_id`/`assigned_doctor_id`; `doctor_user_id` = caller |

**DB Triggers on this table (not RLS but enforced at DB level):**
- `appointment_status_guard` — BEFORE UPDATE; blocks status changes FROM `completed`, `cancelled`, `no_show`
- `enforce_plan_booking_limit` — BEFORE INSERT; rejects insert if hospital's active plan `max_monthly_bookings` is reached
- `guard_patient_appointment_insert` — BEFORE INSERT (20261013100002); for a patient-side PostgREST caller (not staff/doctor/service role): approval comes from `hospitals.approval_mode`, status forced to pending/confirmed, queue/consult/clinical fields nulled, `refund_pct` = 100
- `guard_patient_appointment_update` — BEFORE UPDATE (20261013100002, 20261013300001); a patient may only cancel; `refund_pct` is computed server-side on every patient cancel (>24h before the Lagos start → 100, else 50) and cannot be edited otherwise
- `a00_lock_patient_booking_slot` — BEFORE INSERT; advisory lock per (hospital or doctor, patient) so `enforce_no_duplicate_active_booking` can't be raced
- `end_virtual_session_on_terminal_appointment` — AFTER UPDATE OF status (20261013100001); completed/cancelled/no_show ends the call session

---
## `patient_medical_history`
| Policy | Operation | Rule |
|---|---|---|
| patients manage their own medical history | ALL | `patient_id IN (SELECT id FROM users WHERE auth_id = auth.uid())` |

> Table predates the migration history (no `CREATE TABLE` in `supabase/migrations/`), so this policy was applied directly against the project rather than via a tracked migration. Verified current as of 2026-07-26. The web dashboard reads/writes this table through the service-role client, which bypasses RLS regardless.

---

## `vitals_audit_log`
| Policy | Operation | Rule |
|---|---|---|
| Doctors can read appointment vitals | SELECT | `appointment_id IN (SELECT id FROM appointments WHERE doctor_id IN (SELECT id FROM doctors WHERE auth_user_id = auth.uid()) OR assigned_doctor_id IN (...))` |
| Front desk can read clinic vitals | SELECT | `appointment_id IN (SELECT id FROM appointments WHERE hospital_id IN (SELECT hospital_id FROM clinic_admins WHERE auth_user_id = auth.uid() AND is_active = true))` |

> RLS enabled, writes remain service-role only (append-only audit log). Policies applied directly against the project rather than via a tracked migration; verified current as of 2026-07-26.

---

## `reviews`
| Policy | Operation | Rule |
|---|---|---|
| Patients can read own reviews | SELECT | `patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Patients can create reviews | INSERT | patient must own the appointment AND appointment status must be `completed` |
| Hospital admins can read their hospital reviews | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |
| Hospital admins can reply to reviews | UPDATE | hospital admin of that hospital; WITH CHECK locks all fields except `hospital_reply` and `replied_at` |

> One-review-per-appointment enforced by UNIQUE constraint `reviews_appointment_id_patient_id_key`.

---

## `notifications`
| Policy | Operation | Rule |
|---|---|---|
| Users can read own notifications | SELECT | `user_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Users can mark own notifications read | UPDATE | same |
| notifications_insert_own | INSERT | authenticated only, `user_id = (SELECT id FROM users WHERE auth_id = auth.uid())` — replaced the `WITH CHECK (true)` anon/authenticated policy (20261013000008); server code writes with the service role |

---

## `appointment_documents`
| Policy | Operation | Rule |
|---|---|---|
| Patients can read own appointment documents | SELECT | `appointment_id IN (SELECT id FROM appointments WHERE patient_id = ...)` |
| Hospital staff can upload appointment documents | INSERT | `appointment_id IN (SELECT id FROM appointments WHERE hospital_id IN (...hospital_admins...))` |
| Hospital staff can update appointment documents | UPDATE | same |
| Hospital staff can delete appointment documents | DELETE | same |

---

## `hospital_admins`
| Policy | Operation | Rule |
|---|---|---|
| Hospital members can read own hospital admins | SELECT | caller's `hospital_id` matches any of their own admin records |
| Users can read own admin record | SELECT | `user_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |

---

## `hospital_subscriptions`
| Policy | Operation | Rule |
|---|---|---|
| Hospital admins can read own subscription | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |

---

## `payments`
| Policy | Operation | Rule |
|---|---|---|
| Patients can read own payments | SELECT | `patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())` |
| Hospital admins can read hospital payments | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |

---

## `payouts`
| Policy | Operation | Rule |
|---|---|---|
| Hospital admins can read own payouts | SELECT | `hospital_id IN (SELECT hospital_id FROM hospital_admins WHERE user_id = ...)` |

---

## `virtual_sessions`
*Since 20261013100001 (applied 2026-10-13).*

| Policy | Operation | Rule |
|---|---|---|
| Patients can read own virtual sessions / virtual_sessions_select | SELECT | `appointment_id IN (SELECT id FROM appointments WHERE patient_id = ...)` |

- No staff policies: "Hospital staff can read hospital virtual sessions" and the production-only `virtual_sessions_hospital_select/insert/update` were dropped — they exposed Agora tokens and let admins overwrite or end sessions. Staff surfaces read through the service role (`/api/virtual`).
- Column privileges: `authenticated` may SELECT only `id, appointment_id, status, room_name, guest_token, started_at, ended_at, duration_secs, created_at` — **not `host_token`** (which is no longer stored). No client INSERT/UPDATE/DELETE. Realtime delivery to the patient was verified under these grants.

---

## `transport_requests`
*Since 20261013100001 (applied 2026-10-13). Not previously documented here.*

| Policy | Operation | Rule |
|---|---|---|
| Users can read own transport requests | SELECT | `requester_id` = caller |
| Crew can read active assigned job | SELECT | caller is on the current shift of `assigned_unit_id` and the job is active |
| Hospital staff can read inbound transports | SELECT | `destination_hospital_id` is the caller's hospital (non-crew `hospital_admins`, or `clinic_admins`) |

- No client INSERT/UPDATE/DELETE (privileges revoked): requests are created by `POST /api/transport/request` (service role) and cancelled through `cancel_my_transport()`.
- `unit_matches_status` allows cancelled statuses with or without a unit; `one_live_emergency_per_requester` (partial unique index) prevents two live SOS requests per requester.
- Dispatch/location functions (`record_unit_location`, `accept_dispatch_offer`, `get_request_pickup_latlng`, `rank_destination_hospitals`, sweepers) are service_role only (20261013000007).

---

## `emr_integrations`
| Policy | Operation | Rule |
|---|---|---|
| Hospital admins can read own EMR integration | SELECT | hospital admin with role `admin` or `owner` only |

---

## `subscription_plans`
| Policy | Operation | Rule |
|---|---|---|
| Public can read active subscription plans | SELECT | `is_active = true` |

---

## `availability_templates`
| Policy | Operation | Rule |
|---|---|---|
| Public can read availability templates | SELECT | `true` |
| Hospital admins manage availability templates | ALL | `doctor_id IN (SELECT id FROM doctors WHERE hospital_id IN (...hospital_admins...))` |

---

## `slot_overrides`
| Policy | Operation | Rule |
|---|---|---|
| Public can read slot overrides | SELECT | `true` |
| Hospital admins manage slot overrides | ALL | `doctor_id IN (SELECT id FROM doctors WHERE hospital_id IN (...hospital_admins...))` |

---

## `hospital_images`
| Policy | Operation | Rule |
|---|---|---|
| Public can read hospital images | SELECT | `true` |
| Hospital admins manage hospital images | ALL | hospital admin with role `admin` or `owner` only |

---

## Performance Indexes (added alongside RLS)

| Index | Table | Columns | Purpose |
|---|---|---|---|
| `idx_hospital_admins_user_hospital` | `hospital_admins` | `(user_id, hospital_id)` | Every admin RLS subquery |
| `idx_hospital_admins_hospital` | `hospital_admins` | `(hospital_id)` | Hospital-scoped lookups |
| `idx_hospitals_lat_lng` | `hospitals` | `(latitude, longitude)` WHERE both NOT NULL | Bounding-box spatial queries |
| `vitals_audit_log_appointment_idx` | `vitals_audit_log` | `(appointment_id, recorded_at DESC)` | Vitals history lookups |

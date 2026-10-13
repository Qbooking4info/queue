# Defect register

IDs are stable (`REP-NNN`). Statuses: `open`, `investigating`, `in_progress`,
`fixed_pending_verification`, `verified_fixed`, `blocked`, `deferred_with_reason`.

**Verification caveat for this campaign:** this machine has no Docker (no local Supabase)
and the session is not permitted to read or write the production database, which is the
only database (no staging). Every SQL finding below is derived from `supabase/migrations/`
(latest definition wins). Production may differ where changes were applied out-of-band
(this has happened before — see `AUDIT-FINDINGS.md`). SQL fixes stay
`fixed_pending_verification` until the migration is applied and checked with the queries
listed in STATUS.md.

---

## Virtual consultation

### REP-001 · P0 · Agora call tokens readable by all hospital staff and by the patient (host token)
- **Where:** `web/src/app/api/virtual/token/route.ts` (stored `host_token` + `guest_token`); `supabase/migrations/20260601030000_sensitive_tables_rls.sql:79-89` (policy "Hospital staff can read hospital virtual sessions" — any `hospital_admins` role incl. front_desk, specialist, ambulance_crew).
- **Reproduce:** sign in as any staff user at the hospital → `supabase.from('virtual_sessions').select('host_token,guest_token')` → tokens for every consult; join Agora as uid 1/2 (same uid evicts the real party). A patient can likewise read `host_token` and join as the doctor.
- **Expected:** only the doctor gets the host token (from the API response); only the patient gets the guest token for their own appointment.
- **Root cause:** tokens handed out through table RLS rather than per-request authorization.
- **Fix:** route no longer persists `host_token` (null on upsert). Migration `20261013100001` drops the staff policy, replaces table SELECT with a column grant that excludes `host_token`, nulls stored host tokens. Dashboard live refresh now follows `appointments` only (`web/src/app/dashboard/virtual/page.tsx`).
- **Verification:** `web/src/app/api/virtual/token/route.test.ts` "stores only the guest token" — PASS (fails on the old route). Migration NOT applied.
- **Production (read 2026-10-13):** 14 rows hold a host_token, and prod has three extra policies not in any repo migration — `virtual_sessions_hospital_select/insert/update` (`is_hospital_admin(...)`) — so admins can also INSERT/UPDATE sessions (overwrite a guest_token, end a live consult). `100001` now drops them too.
- **Dry run against prod (BEGIN…ROLLBACK, synthetic fixtures):** 11/11 PASS — patient reads own guest_token; patient host_token → 42501; front desk sees 0 sessions and cannot update (42501); completing the appointment ends the session (REP-004); no host tokens left. Production verified unchanged afterwards.
- **Realtime verified 2026-10-13 16:25** with the e2e TEST patient: session-start event delivered with `guest_token` and without `host_token`; the app's own select works; `ended` delivered. → `verified_fixed` at DB level; the web route change (stop writing host_token) ships with the next deploy.
- **APPLIED 2026-10-13 ~16:05 WAT; verified 16:07:** staff policies gone, `host_token` not selectable, 0 stored tokens, staff session sees 0 rows / cannot update. Still to do: web deploy (deployed token route still writes host_token, now unreadable) and the device Realtime check.
- **Remaining (original note):** after applying, confirm (a) a staff session gets 0 rows, (b) patient `select('host_token')` errors, (c) patient app still receives `guest_token` via Realtime when the doctor starts (Realtime must honour column grants — verify on a device). Longer term, replace stored guest tokens with a `POST /api/virtual/join` endpoint.
- **Status:** `fixed_pending_verification`

### REP-002 · P1 · Patient leaving (or the crash fallback) marks the consult completed; rejoin impossible
- **Where:** `web/src/app/api/virtual/end/route.ts`; callers `apps/client/screens/VideoCallScreen.{native,web}.tsx`, `CallErrorBoundary`.
- **Reproduce:** doctor starts call, patient taps End (or the screen crashes and they tap Leave) → appointment `completed` → doctor's Start returns "status 'completed' does not permit a virtual session". Also any `in_progress` in-person appointment could be completed by its patient via this route (no `type` check).
- **Fix:** patient call is acknowledged without changing state; only the doctor ends (sets `consult_ended_at`, idempotent via `ended_at is null`); non-virtual appointments → 400.
- **Verification:** `web/src/app/api/virtual/end/route.test.ts` (5 tests) — PASS; 4 fail on the old route.
- **Note (product decision):** this reverses a deliberate earlier change ("either party can end"). A stuck `in_progress` consult is still closed by the doctor's End or auto-closed when the doctor starts their next consult (`admin-api.ts` startConsultation).
- **Status:** `fixed_pending_verification` (route-level verified; not deployed)

### REP-003 · P2 · Call screens never notice the other party leaving
- **Where:** `apps/client/screens/VideoCallScreen.native.tsx`, `apps/doctor/screens/specialist/DoctorVideoCallScreen.native.tsx` — `onUserOffline` compared against a `remoteUid` captured as `null`; patient had no subscription once the session was found.
- **Fix:** functional `setRemoteUid(cur => cur === uid ? null : cur)` in both; patient subscribes to `virtual_sessions` UPDATE and shows "Consultation ended" when status becomes `ended`.
- **Verification:** `tsc --noEmit` PASS (client, doctor). No component test harness for Agora; NOT device-tested.
- **Status:** `fixed_pending_verification`

### REP-004 · P2 · Cancel / reschedule / no-show / admin completion leave the call session active and joinable
- **Fix:** trigger `end_virtual_session_on_terminal_appointment` (migration `20261013100001`).
- **Status:** `fixed_pending_verification` (migration not applied)

### REP-005 · P3 · Call timing inaccuracies
- Fixed: `/end` now sets `consult_ended_at` and no longer re-computes duration on a second call.
- Open: restarting while `in_progress` resets `started_at` and re-rings; no date/time-window check on starting a call.
- **Status:** `in_progress`

### REP-006 · P3 · Patient screens init Agora with `EXPO_PUBLIC_AGORA_APP_ID`, not the server's signing App ID — SUSPECTED, values match today. `open`
### REP-007 · P2 · Agora project mode unverified — if "App ID only" (no certificate) is enabled, any App ID + appointment UUID joins without a token. Needs Agora console check. `blocked` (no console access)
### REP-008 · P2 · `saveAppointmentNotes` checks `role !== 'doctor'` but `hospital_admins.role` has no 'doctor' — SUSPECTED (`web/src/app/dashboard/specialist/actions.ts`). `open`

---

## Ambulance / emergency

### REP-010 · P0 · Patients can INSERT `transport_requests` directly (bypass dispatch and state machine) — CONFIRMED LIVE in prod; dry run PASS (patient insert → 42501)
- **Where:** policy "Users can create own transport requests" (`20260729000001_ambulance_core.sql:500`); `enforce_transport_transition` only fires on UPDATE.
- **Impact:** a raw insert with `status='matched'` + any `assigned_unit_id` sends a real crew to an attacker-chosen pickup and later breaks `one_active_job_per_unit` for real patients; or many `searching` rows with far-future deadlines.
- **Fix:** migration `20261013100001` drops the policy and revokes INSERT/UPDATE/DELETE from anon/authenticated. No client code inserts (only `POST /api/transport/request`, service role).
- **Status:** `verified_fixed` (applied + verified in prod 2026-10-13 16:07)

### REP-011 · P0 · `record_unit_location` executable by anyone (location spoofing / keep a dead unit "fresh")
### REP-012 · P0 · `accept_dispatch_offer(p_offer_id, p_auth_id)` executable by anyone; trusts caller-supplied auth id
### REP-015 · P2 · `get_request_pickup_latlng`, `rank_destination_hospitals` executable by anyone (patient pickup location); P3 hygiene: `expire_stale_offers`, `expire_overdue_searches`, `flag_stale_tracking`
- **Root cause:** no migration revoked the default PUBLIC EXECUTE on these SECURITY DEFINER functions (the project did this for `get_doctor_queue` and `increment_slot_booking`, not here).
- **Fix:** covered by `20261013000007_lock_down_internal_definer_functions.sql` + pgTAP `function_privileges.test.sql`, committed (d7f65fd, branch `fix/audit-2026-10-13`) by a **concurrent session** while this one was writing the same revokes; the duplicate section was removed from `20261013100001`. All TS callers use the service role.
- **Verified in production 2026-10-13 ~16:00 WAT** (read-only `has_function_privilege`): anon=false, authenticated=false for all seven. **Status:** `verified_fixed`

### REP-013 · P1 · Patient cannot cancel while dispatch is still searching — CONFIRMED LIVE (constraint unchanged in prod); dry run PASS (`cancel_my_transport` on a searching row → cancelled_by_requester)
- **Where:** `unit_matches_status` check puts `cancelled_by_requester` in the "unit required" branch → `cancel_my_transport` on a `requested`/`searching` row raises a check violation; app shows raw Postgres text and dispatch keeps offering.
- **Fix:** constraint allows cancelled statuses with or without a unit (migration `20261013100001`).
- **Status:** `fixed_pending_verification`

### REP-014 · P2 · Hospital-fleet crew (`hospital_admins.role='ambulance_crew'`) can read every inbound request's patient details
- **Fix:** policy recreated with `ha.role <> 'ambulance_crew'` (migration `20261013100001`). **Status:** `fixed_pending_verification`

### REP-016 · P2 · Two concurrent SOS submissions create two live requests
- **Fix:** partial unique index `one_live_emergency_per_requester`; route returns the existing request on 23505 (`web/src/app/api/transport/request/route.ts`).
- **Verification:** `web/src/app/api/transport/request/route.test.ts` (4 tests) PASS. Index NOT applied; migration aborts if prod already has a requester with two live emergency requests.
- **Status:** `fixed_pending_verification`

### REP-017 · P1 · No-unit / deadline dispatcher alerts likely seen by nobody — SUSPECTED — **being worked by the concurrent session** (uncommitted `dispatcher-alerts.ts`, migration `20261013200002`) at 16:15; don't duplicate
Emergency requests have no `destination_hospital_id` until a crew sets one, but both alert readers filter on it (`api/ambulances/alerts/route.ts:53`, `dashboard/ambulances/alerts/page.tsx:34`); `expire_overdue_searches()` only inserts rows; relay needs `DISPATCH_ALERT_*` env vars. Needs a product decision on who the dispatcher is. `open`

### REP-018 · P1 · Re-dispatch after a decline ran as a floating promise (Vercel may freeze it)
- **Fix:** wrapped in `after()` (`offers/respond/route.ts`). Open part: `/api/transport/sweep` has no schedule ("Nothing calls this on a schedule yet").
- **Status:** `in_progress`

### REP-019 · P2 · Deleting a shift (or a shift ending) mid-job strands the job — crew can no longer advance/complete it. `open`
### REP-020 · P2 · No crew cancel/hand-back path; `escalateNoSupply` says "assign manually" but no manual-assign API exists. Product gap. `open`

### REP-021 · P2 · Patient copy claimed dispatch before any crew accepted
- `SosTriageScreen` ("Help is already being arranged"), `AmbulanceHomeScreen` ("…while the crew is on the way"), `EmergencyBookingScreen` ("will be dispatched … immediately"). Reworded to describe the search. Tracking screen was already accurate.
- **Status:** `verified_fixed` (copy only; client `tsc` PASS)

### REP-022 · P3 · `triageLevel`, `requiredTier`, `requiredCapabilities` client-supplied and unchecked in `transport/request`. `open`
### REP-023 · P3 · Patient notified "Ambulance on the way" at `matched`, before en route. `open`
### REP-024 · P3 · An in-flight round can insert offers after the deadline flipped the request to `no_unit_available` (accept safely returns false; stray crew alert). `open`

---

## Appointments and queue

### REP-030 · P1 (borderline P0) · Patients can update ANY column of their own appointment
- **Where:** policy `patients_update_own` (`20260827000001_dependent_account_linking.sql:176`) has no status/column limit; OR'd with the stricter `appointments_patient_update`, so the stricter one does nothing.
- **Impact:** `status='checked_in'` + `queue_rank_override` jumps the queue (renumber trigger puts them first); `approval_status='approved'` skips manual approval; `refund_pct`, `hospital_id`, `doctor_id`, `diagnosis`, `doctor_notes`, `consult_*` all writable.
- **Fix:** migration `20261013100002`: BEFORE UPDATE guard — a patient-side PostgREST caller may only cancel (status/cancellation_reason/cancelled_at/refund_pct/updated_at), and `refund_pct` is recomputed server-side (>24h before start in Africa/Lagos → 100, else 50; also closes REP-032). Staff, doctors, service role and RPCs are exempt. Chosen over column GRANTs because installed apps send `refund_pct` on cancel.
- **Applied to production 2026-10-13 by the concurrent session** (commit c10c18b, together with its `20261013200001`; it notes prod never had `patients_update_own` — prod's gap was `appointments_patient_update` with no WITH CHECK plus full column UPDATE grants).
- **Independent verification (this session, rolled back, synthetic fixtures):** forged insert normalised; queue-jump update → 42501; hospital move → 42501; cancel >24h → 100; service role unaffected — PASS. pgTAP `patient_appointment_writes.test.sql` runs green.
- **Status:** `verified_fixed` (see REP-032 for the refund gap)

### REP-031 · P1 · Patients choose their own approval/status on INSERT
- `packages/shared/lib/api.ts:435` derives `approval_status` from a client-supplied `approvalMode`; INSERT policy checks only `patient_id`.
- **Fix:** BEFORE INSERT guard in `20261013100002` derives approval from `hospitals.approval_mode`, forces status into pending/confirmed, nulls queue/consult/clinical fields. **Status:** `fixed_pending_verification`

### REP-032 · P2 · Refund percentage computed on the device (`cancelAppointment`)
- REP-030's guard only recomputed `refund_pct` when the client CHANGED it; bookings insert at 100, so a late cancel resending 100 **kept 100** — reproduced against prod (rolled back).
- **Fix:** `20261013300001_repair_refund_on_patient_cancel.sql` — recompute on every patient cancel; refund edits outside a cancel are ignored. Dry run with the fix: 7/7 PASS (late cancel → 50). NOT applied.
- **Status:** `fixed_pending_verification`

### REP-033 · P2 · Duplicate-active-booking check races (two parallel bookings both succeed)
- **Fix:** `a00_lock_patient_booking_slot` advisory-lock trigger sorts before `enforce_no_duplicate_active_booking`. **Status:** `fixed_pending_verification`

### REP-034 · P2 · Any doctor could act on any appointment in their hospital (`PATCH /api/appointments/[id]`)
- Doctor A could `start_consultation` on doctor B's patient (force-completing B's current consult), approve/reject/reassign/set_status anything.
- **Fix:** doctor callers must be the appointment's doctor and are limited to start/end consultation, notes, ring, no-show.
- **Verification:** `appointments/[id]/route.test.ts` (4) PASS; 2 fail on the original route. **Status:** `verified_fixed` (route level; not deployed)

### REP-035 · P3 · `set_status` / `start_consultation` bypass check-in (`check_in_date` stays null; row never joins the queue; auto-end misses it). `open`
### REP-036 · P3 · Walk-in: `booked_by_staff_id` taken from request body; monthly cap uses server (UTC) month; `urgency`/`type` sent by the hospital app are ignored. `open`
### REP-037 · P3 · `checkInAppointment` accepts `pending` (unapproved) bookings. `open`
### REP-038 · P3 · Doctor's appointment list misses rows assigned via `assigned_doctor_id`. `open`

---

## Accounts, staff and access control

### REP-040 · P0 · Any hospital admin could reset ANY user's password and was shown the new one
- **Where:** `web/src/app/dashboard/staff/actions.ts` `resetStaffPassword` — no check that `user_id` is staff at the caller's hospital. Anyone can become an owner via `/api/onboarding`, so effectively any account (other hospitals' owners, patients, super admins) was takeover-able.
- **Fix:** target must be a `specialist`/`front_desk`/`ambulance_crew` member of the caller's hospital AND a portal-generated login (`@portal.queueapp.co`); real-email accounts are told to use "Forgot password".
- **Behaviour change:** specialists invited with their own email can no longer have their password reset from the dashboard (that was the takeover vector).
- **Verification:** `dashboard/staff/actions.test.ts` (5) PASS; 3 fail on the original. **Status:** `verified_fixed` (not deployed)

### REP-041 · P0 · Account takeover via dependent linking (6-char Patient ID, no consent)
- **Where:** `api/dependents/link` created an active link from a code alone; `api/dependents/switch` then mints a magic-link session for the linked account. GET lookup returned name + DOB with no rate limit; codes exist on every user incl. staff and super admins.
- **Fix (interim, no schema change):** caretaker-initiated links only for minors (<18 on the Lagos calendar; unknown DOB = adult); adults link themselves (`as=dependent`, already supported in the app); staff/doctor/platform-admin accounts can never be linked or switched into; lookup rate-limited (30/h) and no longer returns DOB; POST rate-limit counts failed guesses. New `web/src/lib/dependent-linking.ts`.
- **Verification:** `dependents/link/route.test.ts` (5) + `lib/dependent-linking.test.ts` (4) PASS; 3 fail on the original.
- **Production (reviewed without PII, 16:30):** 2 active links — a `child` link (2026-08-27, dependent is a minor: OK) and a `sibling` link (2026-08-31) to an **adult**, both real non-staff accounts; who initiated it is not recorded. Needs a human decision (contact them / unlink) — not changed by the agent.
- **Remaining:** (1) a stranger who learns a *child's* code can still link it — needs a real consent step (pending link accepted by the account or verified guardian) = product decision + client UI; (2) links created before this fix are not re-validated — run the audit query in STATUS.md and review adult links where the caretaker initiated.
- **Status:** `in_progress`

### REP-042 · P1 · Any `hospital_admins` row (crew, specialist, deactivated) could edit the hospital's public contact details and change appointment state
- **Fix:** `getHospitalContext` requires `is_active`; `updateHospitalProfile`/`upsertOperatingHours` admin/owner only; `updateAppointmentStatus`/approve/reject admin/owner/front_desk only.
- **Verification:** `dashboard/appointments/actions.test.ts` (6) PASS. **Status:** `verified_fixed` (not deployed)

### REP-043 · P2 · Clinic admin could reset passwords of staff in another clinic of the same hospital (`clinic-staff/reset-password`)
- **Fix + test:** clinic check added; `reset-password/route.test.ts` (3) PASS. **Status:** `verified_fixed` (not deployed)

### REP-044 · P2 · One booking can be paid twice (card + wallet, or two checkouts); no unique success per appointment, no refund path. `open` (needs migration + webhook change)
### REP-045 · P2 · Any non-owner hospital admin can swap the payout bank account (`payments/subaccount`). `open` (needs owner role in `CallerInfo`)
### REP-046 · P3 · `removeStaff` let an admin remove the owner — fixed (owner-only). `fixed_pending_verification` (no test)
### REP-047 · P3 · Onboarding accepts any `planId` with a 90-day trial; `GET /api/clear-session` is cross-site triggerable; several routes return raw DB/Paystack error text. `open`
### REP-048 · P2 · SUSPECTED: doctor linking by code without consent (`doctors/link`); self-declared `doctor_profiles`; `getUserRole` maps unknown roles to `hospital_admin`. `open`

---

## Mobile app wiring

### REP-050 · P1 · Hospital app "Invite staff" always failed (sent `{email, role, hospitalId}` to a route that needs clinic, name and temp password; offered a role the route rejects)
- **Fix:** button now explains and opens Clinics, where the working "+ Add Staff Member" form lives; dead modal removed. `apps/hospital/screens/staff/StaffManagementScreen.tsx`. hospital `tsc` PASS. **Status:** `fixed_pending_verification` (not device-tested)

### REP-051 · P2 · Hospital/ambulance apps read `hospitals` directly; the only SELECT policy requires `is_verified`, so unverified hospitals lose the Clinics menu, clinic filter and hospital names. Needs an RPC (`get_my_hospital`). `open`
### REP-052 · P2 · Care-plan ticks between 00:00–01:00 WAT saved against yesterday (DB `current_date` is UTC) — fixed: client sends `done_on: today`. `fixed_pending_verification`
### REP-053 · P2 · Booking "notifications" never saved (anon client insert, error ignored)
- Concurrent session commit 688540e: `notifications_insert_own` policy (`20261013000008`) + `addNotification` now uses the authenticated client. Old installed builds still write nothing. **Status:** `fixed_pending_verification` (not this session's change)
### REP-054 · P3 · Rating a doctor always said "Thank you" even on failure — fixed. `fixed_pending_verification`
### REP-055 · P3 · UTC `toISOString().slice(0,10)` "today" in client Home and hospital clinic stats / care-plan grid — fixed with `todayLocalDate`/`fmtLocalDate`. Remaining in web: `api/dashboard/summary/route.ts:25`, `api/patients/route.ts:42`. `in_progress`
### REP-056 · P3 · Crew app said "Another crew accepted" for expired/cancelled offers — fixed (branches on `reason`). `fixed_pending_verification`
### REP-057 · P3 · Hospital onboarding navigates to unregistered `MainTabs` (likely unreachable). `open`

---

## Platform / hygiene

### REP-090 · P3 · `web` eslint baseline: 329 errors, 22 warnings (mostly `react-hooks/set-state-in-effect`, `no-explicit-any`). Not touched — not hiding, not a functional defect. `deferred_with_reason`
### REP-091 · P3 · `README.md` still documents the removed `mobile/` layout. `open`

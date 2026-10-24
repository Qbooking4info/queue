# Repair changelog

## Batch 1 — discovery and baseline (2026-10-13)
- Added `docs/repair/` (ARCHITECTURE, STATUS, PROGRESS.json, ISSUES, TEST_MATRIX, CHANGELOG).
- No code changes. Pre-existing working-tree change left untouched: `supabase/.temp/cli-latest` (Supabase CLI cache).

## Batch 2 — critical security + safety (2026-10-13) — NOT committed, NOT deployed, migrations NOT applied

> **Concurrent work:** while this batch was in progress another Claude session committed to the same
> checkout (d7f65fd, 688540e, f7a5179 on branch `fix/audit-2026-10-13`, switched from `main`). Those commits
> are not part of this batch. This batch's changes are uncommitted in the working tree.

| File | Change | Issues |
|---|---|---|
| `web/src/app/api/virtual/token/route.ts` | Stop persisting `host_token`; reset `ended_at` on (re)start | REP-001 |
| `web/src/app/api/virtual/end/route.ts` | Patient leave no longer completes the appointment; `type='virtual'` required; doctor end sets `consult_ended_at`, idempotent | REP-002, REP-005 |
| `web/src/app/dashboard/virtual/page.tsx` | Live refresh follows `appointments` only (staff can no longer read `virtual_sessions`) | REP-001 |
| `apps/client/screens/VideoCallScreen.native.tsx` | Fix stale `remoteUid` closure; leave on `virtual_sessions.status='ended'` | REP-003 |
| `apps/doctor/screens/specialist/DoctorVideoCallScreen.native.tsx` | Fix stale `remoteUid` closure | REP-003 |
| `web/src/app/api/transport/request/route.ts` | Racing duplicate SOS (23505) returns the existing request | REP-016 |
| `web/src/app/api/transport/offers/respond/route.ts` | Post-decline re-dispatch inside `after()` | REP-018 |
| `apps/client/screens/{SosTriage,AmbulanceHome,EmergencyBooking}Screen.tsx` | Copy no longer claims dispatch before a crew accepts | REP-021 |
| `supabase/migrations/20261013100001_repair_b2_security_hardening.sql` | **New migration** — see below | REP-001/004/010–016 |
| Tests added | `virtual/end/route.test.ts`, `transport/request/route.test.ts`, new case in `virtual/token/route.test.ts` | |

### Migration `20261013100001` (production-affecting — apply only with approval)
- `virtual_sessions`: drop staff SELECT policy; column-level SELECT for `authenticated` excluding `host_token`; revoke writes from anon/authenticated; **data change:** `host_token` set to NULL on existing rows (tokens are 2-hour Agora tokens; nothing reads them).
- `appointments`: new AFTER UPDATE trigger ending the virtual session on completed/cancelled/no_show.
- `transport_requests`: drop patient INSERT policy; revoke INSERT/UPDATE/DELETE from anon/authenticated; relax `unit_matches_status` for cancelled statuses; recreate inbound-read policy excluding `ambulance_crew`; new partial unique index `one_live_emergency_per_requester` (**fails the whole migration** if duplicates already exist).
- (Function EXECUTE revokes were removed from this file: the concurrent session's `20261013000007` covers them.)
- Rollback: re-create the dropped policies from `20260601030000` / `20260729000001`, `grant select on virtual_sessions to authenticated`, `grant execute … to anon, authenticated`, drop the trigger/index, restore the original constraint. Nulled host tokens cannot be restored (not needed).

### Release implications
- Web changes need a Vercel deploy (last known blocker: `vercel login` for the queue-web owner).
- Client/doctor screen changes need new app builds (EAS/gradle) or an OTA update.
- Old installed patient apps keep working with the migration: they select only `guest_token, room_name, status`.

### Batch 2 — later additions (same day)
| File | Change | Issues |
|---|---|---|
| `web/src/app/dashboard/staff/actions.ts` | Password reset only for own-hospital portal logins; owner can't be removed by an admin | REP-040, REP-046 |
| `web/src/lib/dependent-linking.ts` (new), `api/dependents/{link,switch}/route.ts` | Consent rules (minors only by code, adults self-link, never staff), lookup rate limit, no DOB | REP-041 |
| `web/src/app/api/appointments/[id]/route.ts` | Doctors limited to own patients + consult actions | REP-034 |
| `web/src/lib/getHospitalContext.ts`, `dashboard/{appointments,settings}/actions.ts` | `is_active` + role gates | REP-042 |
| `web/src/app/api/clinic-staff/reset-password/route.ts` | Clinic scope | REP-043 |
| `supabase/migrations/20261013100002_repair_b2_appointment_patient_guard.sql` | **New migration**: patient UPDATE/INSERT guard triggers, server refund_pct, booking advisory lock | REP-030–033 |
| `apps/hospital/screens/staff/StaffManagementScreen.tsx` | Broken invite → route to clinic staff form | REP-050 |
| `apps/client/screens/{CarePlans,AppointmentDetail,Home}Screen.tsx`, `apps/hospital/screens/staff/{HospitalCarePlans,HospitalClinicDetail}Screen.tsx` | Local dates; rating error handling | REP-052, 054, 055 |
| `apps/ambulance/screens/crew/CrewHomeScreen.tsx` | Expired vs taken offer message | REP-056 |
| Tests added | `appointments/[id]`, `clinic-staff/reset-password`, `dependents/link`, `lib/dependent-linking`, `dashboard/{staff,appointments}/actions` | |

Migration `20261013100002` rollback: `drop trigger guard_patient_appointment_update, guard_patient_appointment_insert, a00_lock_patient_booking_slot on appointments;` then drop the four functions. No data is changed by it.

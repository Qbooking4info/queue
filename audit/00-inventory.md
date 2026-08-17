# Pass 0 — Repository Inventory

**Branch:** audit/2026-08-11 · **Base:** a8e1ca5
**Generated:** 2026-08-10 23:05 UTC

## Web API routes (all use the service-role admin client unless noted)

| route | methods | auth guard used |
|---|---|---|
| `/account` | DELETE  | getServerUser(  |
| `/ambulances/alerts` | PATCH  | createAdminClient( requireRole(  |
| `/ambulances/fleet/crew` | GET  | createAdminClient( requireRole(  |
| `/ambulances/fleet` | GET POST  | createAdminClient( requireRole(  |
| `/ambulances/fleet/shifts/[shiftId]/crew` | POST DELETE  | createAdminClient( requireRole(  |
| `/ambulances/fleet/shifts/[shiftId]` | DELETE  | createAdminClient( requireRole(  |
| `/ambulances/fleet/shifts` | POST  | createAdminClient( requireRole(  |
| `/ambulances/fleet/units/[unitId]/duty` | POST  | createAdminClient( requireRole(  |
| `/ambulances/fleet/units/[unitId]` | DELETE  | createAdminClient( requireRole(  |
| `/ambulances/fleet/units` | POST  | createAdminClient( requireRole(  |
| `/appointments/[id]` | PATCH  | createAdminClient( requireRole(  |
| `/appointments/[id]/vitals` | POST  | createAdminClient( requireRole(  |
| `/appointments/notify-staff` | POST  | createAdminClient(  |
| `/appointments/queue` | GET  | createAdminClient( requireRole(  |
| `/appointments/refer` | POST  | createAdminClient( requireRole(  |
| `/appointments` | GET  | createAdminClient( requireRole(  |
| `/appointments/stats` | GET  | createAdminClient( requireRole(  |
| `/appointments/walkin` | GET POST  | createAdminClient( requireRole(  |
| `/auth/signout` | POST  | NONE |
| `/clear-session` | GET  | NONE |
| `/clinic-staff/reset-password` | POST  | createAdminClient( requireRole(  |
| `/clinic-staff` | POST PATCH DELETE  | createAdminClient( requireRole(  |
| `/clinics/[clinicId]/doctors/[doctorId]` | DELETE  | createAdminClient( requireRole(  |
| `/clinics/[clinicId]/doctors` | POST  | createAdminClient( requireRole(  |
| `/clinics/[clinicId]/hours` | GET  | createAdminClient( getServerUser(  |
| `/clinics/[clinicId]` | GET PATCH DELETE  | createAdminClient( requireRole(  |
| `/clinics` | GET POST  | createAdminClient( getServerUser( requireRole(  |
| `/dashboard/bootstrap` | GET  | createAdminClient( requireRole(  |
| `/doctors/[id]/reset-password` | POST  | createAdminClient( requireRole(  |
| `/doctors/[id]` | PATCH  | createAdminClient( requireRole(  |
| `/doctors/create` | POST  | createAdminClient(  |
| `/doctors/me` | GET PATCH  | createAdminClient( requireRole(  |
| `/doctors` | POST  | createAdminClient( requireRole(  |
| `/doctors/schedule/clear` | POST  | createAdminClient(  |
| `/doctors/schedule` | POST GET  | createAdminClient(  |
| `/doctors/unassigned` | GET  | createAdminClient( requireRole(  |
| `/emergency-directory` | GET POST PATCH DELETE  | createAdminClient( requireRole(  |
| `/geocode` | GET  | createAdminClient( getServerUser(  |
| `/hospitals/[id]/activity` | GET  | createAdminClient( requireRole(  |
| `/hospitals/[id]/bed-space` | PATCH  | createAdminClient( requireRole(  |
| `/hospitals/[id]/settings` | GET PATCH  | createAdminClient( requireRole(  |
| `/hospitals/[id]/specialties/[specialtyId]` | DELETE  | createAdminClient( requireRole(  |
| `/hospitals/[id]/specialties` | POST  | createAdminClient( requireRole(  |
| `/me/role` | GET  | createAdminClient(  |
| `/onboarding` | POST  | createAdminClient( getServerUser(  |
| `/patients/[id]` | GET  | createAdminClient( requireRole(  |
| `/payments/initialize` | POST  | createAdminClient( getServerUser(  |
| `/payments/subaccount` | GET POST DELETE  | createAdminClient( requireRole(  |
| `/payments/verify` | POST  | createAdminClient( getServerUser(  |
| `/payments/webhook` | GET POST  | createAdminClient(  |
| `/public/hospitals/[id]/hours` | GET  | createAdminClient(  |
| `/public/hospitals/[id]` | GET  | createAdminClient(  |
| `/public/hospitals` | GET  | createAdminClient(  |
| `/schedule` | GET  | createAdminClient( requireRole(  |
| `/services/[serviceId]` | PATCH DELETE  | createAdminClient( requireRole(  |
| `/services` | GET POST  | createAdminClient( requireRole(  |
| `/super-admin/analytics` | GET  | createAdminClient( requireRole(  |
| `/transport/dispatch` | POST  | createAdminClient( requireRole(  |
| `/transport/location` | POST  | createAdminClient( db.auth.getUser(  |
| `/transport/offers/respond` | POST  | createAdminClient( db.auth.getUser(  |
| `/transport/request` | POST  | createAdminClient( db.auth.getUser(  |
| `/transport/sweep` | GET POST  | createAdminClient(  |
| `/virtual/end` | POST  | createAdminClient( getServerUser(  |
| `/virtual/token` | POST  | createAdminClient( getServerUser(  |

## Web dashboard pages

- `/`
- `/dashboard`
- `/dashboard/ambulances`
- `/dashboard/ambulances/alerts`
- `/dashboard/ambulances/coverage`
- `/dashboard/ambulances/fleet`
- `/dashboard/analytics`
- `/dashboard/appointments`
- `/dashboard/clinics`
- `/dashboard/clinics/[clinicId]`
- `/dashboard/directory`
- `/dashboard/doctors`
- `/dashboard/doctors/[id]/schedule`
- `/dashboard/doctors/add`
- `/dashboard/frontdesk`
- `/dashboard/hospitals`
- `/dashboard/queue`
- `/dashboard/schedule`
- `/dashboard/services`
- `/dashboard/settings`
- `/dashboard/specialist`
- `/dashboard/specialist/[id]`
- `/dashboard/staff`
- `/dashboard/staff/add`
- `/login`
- `/onboarding`
- `/register`
- `/reset-password`
- `/staff/accept`
- `/staff/register`

## Mobile screens

- AmbulanceTrackingScreen
- AppointmentDetailScreen
- AppointmentsScreen
- BookingFlowScreen
- ConfirmationScreen
- DependentsScreen
- EmergencyBookingScreen
- EmergencyConfirmationScreen
- HomeScreen
- HospitalAuthScreen
- HospitalProfileScreen
- HospitalRegisterScreen
- InsuranceScreen
- LoginScreen
- MedicalHistoryScreen
- NotificationsScreen
- PrescriptionsScreen
- PrivacySecurityScreen
- ProfileScreen
- RegisterScreen
- RoleSelectScreen
- SearchScreen
- SplashScreen
- SupportScreen
- VideoCallScreen.native
- VideoCallScreen.web
- admin/AdminDashboardScreen
- crew/CrewHomeScreen
- crew/CrewProfileScreen
- frontdesk/FrontDeskProfileScreen
- frontdesk/FrontDeskQueueScreen
- onboarding/HospitalOnboardingScreen
- specialist/DoctorVideoCallScreen.native
- specialist/DoctorVideoCallScreen.web
- specialist/PatientConsultScreen
- specialist/ReferPatientScreen
- specialist/SpecialistProfileScreen
- specialist/SpecialistQueueScreen
- staff/HospitalSettingsScreen
- staff/StaffAnalyticsScreen
- staff/StaffAppointmentsScreen
- staff/StaffManagementScreen
- staff/StaffMoreScreen
- staff/WalkInBookingScreen

## Mobile lib modules

- adapters.ts
- admin-api.ts
- ambulance-api.ts
- api.ts
- crew-api.ts
- emergency-directory.ts
- fees.ts
- format.ts
- haptics.ts
- location-task.ts
- payments.ts
- supabase.ts
- theme.ts

## Web lib modules

- admin-api.ts
- ambulance-fleet.ts
- api-error.ts
- appointment-checkin.ts
- clinic-services.ts
- dashboard-utils.ts
- dispatch/engine.ts
- dispatch/matching.ts
- dispatch/routing.ts
- fees.ts
- getHospitalContext.ts
- notify-patient.ts
- notify-staff.ts
- operating-hours.ts
- paystack.ts
- public-hospital-select.ts
- rate-limit.ts
- supabase/admin-client.ts
- supabase/admin.ts
- supabase/auth-server.ts
- supabase/client.ts
- supabase/public-key.ts
- supabase/server.ts
- typography.ts
- useEmergencyAccess.ts

## Database tables

Row counts via service role. `anon` column distinguishes **DATA** (rows returned to the
publishable key, i.e. exposed) from `empty` (RLS filters to zero rows — correct) and
`denied` (no grant at all).

| table | rows | anon result |
|---|---|---|
| `admin_audit_log` | 0 | empty (RLS ok) |
| `ambulance_crew` | 1 | empty (RLS ok) |
| `ambulance_current_location` | 1 | empty (RLS ok) |
| `ambulance_locations` | 1 | empty (RLS ok) |
| `ambulance_providers` | 3 | denied |
| `ambulance_shift_crew` | 3 | empty (RLS ok) |
| `ambulance_shifts` | 3 | empty (RLS ok) |
| `ambulances` | 3 | empty (RLS ok) |
| `app_config` | 2 | denied |
| `appointment_documents` | 0 | denied |
| `appointments` | 28 | denied |
| `availability_templates` | 0 | empty (RLS ok) |
| `clinic_admins` | 5 | empty (RLS ok) |
| `clinics` | 13 | denied |
| `counter_reconciliation_log` | 23 | empty (RLS ok) |
| `dependents` | 0 | empty (RLS ok) |
| `dispatch_attempts` | 19 | denied |
| `dispatch_offers` | 0 | empty (RLS ok) |
| `dispatcher_alerts` | 8 | empty (RLS ok) |
| `doctor_specialties` | 0 | empty (RLS ok) |
| `doctors` | 16 | denied |
| `emergency_directory` | 0 | denied |
| `emr_integrations` | 0 | empty (RLS ok) |
| `hospital_admins` | 5 | empty (RLS ok) |
| `hospital_clinic_hours` | 14 | **DATA EXPOSED** |
| `hospital_clinics` | 9 | **DATA EXPOSED** |
| `hospital_images` | 0 | empty (RLS ok) |
| `hospital_operating_hours` | 14 | **DATA EXPOSED** |
| `hospital_specialties` | 19 | **DATA EXPOSED** |
| `hospital_subscriptions` | 2 | empty (RLS ok) |
| `hospitals` | 2 | denied |
| `notifications` | 73 | empty (RLS ok) |
| `patient_medical_history` | 2 | empty (RLS ok) |
| `payments` | 0 | denied |
| `payouts` | 0 | empty (RLS ok) |
| `platform_admins` | 1 | empty (RLS ok) |
| `rate_limit_counters` | 11 | empty (RLS ok) |
| `reviews` | 0 | denied |
| `services` | 0 | empty (RLS ok) |
| `slot_overrides` | 0 | empty (RLS ok) |
| `spatial_ref_sys` | 8500 | **DATA EXPOSED** |
| `specialties` | 27 | **DATA EXPOSED** |
| `subscription_plans` | 3 | **DATA EXPOSED** |
| `support_tickets` | 0 | empty (RLS ok) |
| `time_slots` | 0 | empty (RLS ok) |
| `transport_events` | 16 | empty (RLS ok) |
| `transport_invoices` | 0 | empty (RLS ok) |
| `transport_rate_cards` | 0 | empty (RLS ok) |
| `transport_requests` | 8 | empty (RLS ok) |
| `user_insurance` | 2 | empty (RLS ok) |
| `users` | 21 | empty (RLS ok) |
| `virtual_sessions` | 0 | denied |
| `vitals_audit_log` | 3 | denied |

### Note on `hospitals` and `doctors`

Both show `denied` for `select=*` but are readable by column. This is deliberate —
column-level grants from `20260726000004_column_privacy_doctors_hospitals_v2.sql`.
Verified:
```
GET hospitals?select=id,name&limit=1
  -> [{"id":"be074fb6-8664-4ff8-a39f-405c3fa3035a","name":"Queue 
GET hospitals?select=email&limit=1
  -> {"code":"42501","details":null,"hint":"Grant the required pr
GET doctors?select=id,full_name&limit=1
  -> [{"id":"f6a04a6c-6bcc-4f46-97d1-5c17e2668f08","full_name":"O
GET doctors?select=mdcn_number&limit=1
  -> {"code":"42501","details":null,"hint":"Grant the required pr
```

## Migrations

Total: 85 files, 20260531 → 20260810

## Scheduled jobs (pg_cron)

- expire-offers,  */10 * * * * *
- stale-tracking, */30 * * * * *
- expire-offers,  10 seconds
- stale-tracking, 30 seconds
- expire-overdue-searches, 10 seconds
- invoke-transport-sweep, 30 seconds

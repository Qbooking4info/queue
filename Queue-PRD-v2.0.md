# Queue — Product Requirements Document
**Version:** 2.2  
**Updated:** September 2026  
**Market:** Nigeria (₦ / WAT)  
**Status:** Live

---

## 01 · Product Overview

Queue is a two-sided healthcare booking platform designed for the Nigerian market. It connects patients with hospitals and clinics through a mobile app, while giving healthcare providers a full-featured management dashboard on the web — and, increasingly, on mobile too.

The platform handles the complete appointment lifecycle — from search and booking on the patient side, through queue management and vitals capture at the front desk, to analytics and revenue tracking for hospital administrators.

| Surface | Description |
|---|---|
| Web Dashboard | Next.js 16 (App Router) — multi-role hospital management: super-admin, hospital admin, clinic staff, doctors, front desk |
| Queue (patient app) | React Native / Expo SDK 56 — patient-facing: search, book, track, maps, notifications |
| Queue Hospital (staff app) | React Native / Expo SDK 56 — hospital admin / clinic admin / front desk: dashboard, queue, walk-in, appointments, staff & doctor management, clinics, services, schedule, settings, analytics, ambulance operations. Near-parity with the web dashboard's per-hospital modules (see §04b) |
| Queue Doctor (doctor app) | React Native / Expo SDK 56 — a doctor's own day: live queue, appointments, consultation (incl. telehealth video), refer-patient, hospital links, settings |
| Queue Ambulance (crew app) | React Native / Expo SDK 56 — ambulance crew: on/off duty, assigned job, patient location map |
| Backend | Supabase — PostgreSQL, Auth, Row-Level Security, real-time subscriptions |
| Deployment | Web → Vercel · Mobile → Expo EAS (Android APK + App Bundle), four separate apps sharing one `packages/shared` |

---

## 02 · User Roles

Access is enforced at the database level via Supabase Row-Level Security. Each role maps to a distinct set of views and API permissions — the same role now drives what's shown on the web dashboard and, for hospital roles, in the Queue Hospital app.

| Role | Scope | Surface | Description |
|---|---|---|---|
| `super_admin` | Platform-wide | Web only | All hospitals, global analytics, onboarding oversight |
| `hospital_admin` | Hospital | Web + Queue Hospital | Full control — doctors, staff, settings, analytics, billing |
| `clinic_admin` | Clinic | Web + Queue Hospital | Scoped to one clinic within a multi-clinic hospital |
| `front_desk` | Clinic | Web + Queue Hospital | Walk-in registration, queue management, check-in, vitals |
| `doctor` | Self | Web + Queue Doctor | Own appointments, availability toggle, consultation, referrals |
| `ambulance_crew` | Self | Queue Ambulance | On/off duty, assigned job, patient location |
| `patient` | Self | Queue (patient app) | Search, book, manage appointments, dependents, medical history |

---

## 03 · Web Dashboard Modules

### Overview
| Feature | Detail |
|---|---|
| Stat cards | Today's bookings, completions, active doctors, average rating, total revenue |
| Appointment feed | Chronological list with doctor avatar, patient name, type, status badge |
| Doctor availability | Live status: On Duty / On Break / Off Duty — togglable per doctor |
| Date filter | 14 ranges: Today, Tomorrow, This/Next Week, This/Next Month, Last 3/6 Months, This/Last Year, All Time, Custom |

### Appointments
| Feature | Detail |
|---|---|
| Full list view | Filterable by date range, status, doctor, type (virtual / in-person) |
| Walk-in creation | Front desk registers unbooked patients; creates record and assigns doctor |
| Approval flow | Manual-review: approve or reject; auto-approve mode skips this step |
| Vitals capture | Blood pressure, temperature, weight, height, notes at check-in |
| Patient view modal | Full patient info, booking history, medical notes per appointment |

### Front Desk
| Feature | Detail |
|---|---|
| Live queue | Auto-refreshes every 30 seconds — server component with force-dynamic |
| Queue actions | Call next, mark seen, mark no-show, move patient |
| Walk-in intake | Quick form: patient name, phone, reason, assign doctor |

### Doctors
| Feature | Detail |
|---|---|
| Roster | List per hospital/clinic; specialty, availability, rating, bookings |
| Add doctor | Link an existing self-registered doctor account by its short Doctor ID; assign to a clinic |
| Activate / deactivate | Per-hospital lever — a deactivated doctor drops out of that hospital's booking and queue flows until reactivated; nothing is deleted. Available on web and in the Queue Hospital app |
| Schedule | Per-doctor calendar with slot availability; daily/weekly view; bulk slot generator |

### Clinics (multi-clinic model)
| Feature | Detail |
|---|---|
| Multi-clinic | Hospitals operate one or many clinics; each has scoped admins, front desk, doctors |
| Per-clinic stats | Bookings, completions, revenue isolated per location |
| Staff scoping | clinic_admin and front_desk bound to a specific clinic; hospital_admin sees all |

### Staff Management
| Feature | Detail |
|---|---|
| Invite flow | Send invite by email; invited user joins with assigned role |
| Roles assignable | clinic_admin, front_desk — scoped to clinic at time of invite |
| Active/inactive | Deactivate without deleting; access revoked immediately via RLS |

### Settings
| Feature | Detail |
|---|---|
| Hospital profile | Read-only: name, type, registration number, contact email, phone, city/state, clinic model, verification |
| Booking policies | Virtual consultations, 24/7 emergency, approval mode (auto/manual), requires-referral |
| Operating hours | Per-day open/close times; drives schedule grid and booking slots |
| Volume & fees | Daily booking limit (blank = unlimited), OPD consultation fee in ₦ |
| Hospital location | Address search via Nominatim, lat/lng inputs, OpenStreetMap iframe preview, Google Maps verify |
| Patient reminders | SMS 24h before, email 1h before — toggleable per hospital |

### Analytics
| Feature | Detail |
|---|---|
| Booking trends | Total bookings, completion rate, cancellation rate — by date range |
| Revenue | OPD fee × completed appointments; specialist fees tracked separately |
| Doctor metrics | Per-doctor booking count, completion rate, avg consultation duration, rating |

---

## 04 · Queue — Patient App Modules

### Auth
- Email + password registration
- Login with session persistence
- Animated splash screen
- Password reset flow

### Home
- Nearby / featured hospitals
- Quick-filter by specialty
- Upcoming appointment card
- Emergency quick-access button

### Search / Find Care
- Filter chips: All, Virtual, Open Now, Emergency *(HMO Accepted is specified but not implemented)*
- List view sorted by GPS distance (nearest first)
- Map view with green pin markers and callouts
- Toggle between list and map view

### Hospital Profile
- Info: address, specialties, doctors, rating, wait time
- Embedded map preview (180px)
- Get Directions → Google Maps deeplink
- HMO / insurance details
- Booking entry point

### Booking Flow
- Select specialty → doctor → date → time slot → confirm
- OPD (general) or specialist booking
- Virtual consultation option
- Book for self or dependent
- Booking confirmation screen

### Emergency Booking
- Separate fast-track flow
- Only hospitals flagged as 24/7 emergency shown
- No slot selection — walk-in intent
- Emergency confirmation screen

### Appointments
- Upcoming and past tabs
- Detail: doctor, time, location, status
- Reschedule appointment
- Cancel at any time (nothing is charged at booking — see §06)

### Profile
- Medical history
- Prescriptions
- Dependents management
- Insurance / HMO card
- Privacy & security
- Support & help

### Notifications
- Push via Expo Notifications
- Booking confirmation, reminder, status updates
- Hospital-specific notification channel
- Notification history screen

---

## 04b · Queue Hospital — Staff App Modules

The staff app (`apps/hospital`, package `com.qbooking.hospital`) serves `hospital_admin`,
`clinic_admin`, and `front_desk` from one navigation stack — role differences are enforced
inside each screen, not by separate stacks. It targets the web dashboard's **per-hospital**
modules (not the platform-wide super-admin views). Reads go through the same Next.js API
routes and `SECURITY DEFINER` RPCs the web app uses; nothing queries RLS-protected tables
directly.

### Dashboard
| Feature | Detail |
|---|---|
| Today at a glance | Stat cards, doctors on duty (with on-duty/on-break toggle), today's queue |

### Queue & Front Desk
| Feature | Detail |
|---|---|
| Live queue | Today / all; auto-refresh + realtime. Check-in, approve/reject pending bookings, ring patient, record vitals, move queue position |
| Walk-in intake | Register an unbooked patient and assign a doctor |

### Appointments
| Feature | Detail |
|---|---|
| Filtered list | Pending / today / upcoming / past; approve or reject; status badges from the shared status palette |

### Staff Management
| Feature | Detail |
|---|---|
| Roster | Staff (sub-admins, front desk) and linked doctors |
| Invite staff | `hospital_admin` only — email invite with assigned role |
| Link doctor | Enter a doctor's short Doctor ID to link them to the hospital (`hospital_admin` / `clinic_admin`) |
| Doctor activate / deactivate | `hospital_admin` / `clinic_admin` — deactivate confirms first; a `clinic_admin` may only toggle doctors in their own clinic (enforced by `PATCH /api/doctors/[id]`) |

### Clinics (multi-clinic model)
| Feature | Detail |
|---|---|
| Clinic list | Create, activate, delete; assign a sub-admin per clinic |
| Clinic detail | Five sections mirroring web's tabs: overview & hours, doctors (assign / unassign / Set Active), **staff** (add / edit / reset password / remove — temp password shown once), **appointments** (today/week/month + pending-approval banner), **analytics** (KPIs, top specialties, visit-type split) |

### Services
| Feature | Detail |
|---|---|
| Services & specialties | CRUD hospital services (price, active) and the specialty tag list |

### Schedule
| Feature | Detail |
|---|---|
| Weekly view | Per-day slot grid, doctor/clinic filters; bulk slot generator (working days + hours → generate / clear) |

### Settings
| Feature | Detail |
|---|---|
| Booking policies | Approval mode, referral requirement, virtual consultations, 24/7 emergency, patient reminders |
| Operating hours | Per-day open/close |
| Hospital location | Address geocode + lat/lng |
| Volume & fees | Daily booking limit, OPD fee |
| Ambulance service | Enable + search radius |
| Payout account | Paystack subaccount — bank + account number, account-name resolved before save |

### Analytics
| Feature | Detail |
|---|---|
| KPIs | Total / completed / cancelled / show-up %, avg wait time, avg consultation time |
| Breakdowns | Top specialties, visit-type split, monthly bookings YTD bar chart |
| Per-doctor | Wait and consultation time averaged per doctor |

### Ambulance Operations
| Feature | Detail |
|---|---|
| Requests inbox | Inbound transport requests — status, triage, ETA, assigned unit; realtime + poll fallback |
| Dispatcher alerts | Dispatch-failure / critical alerts; acknowledge |
| Fleet | Fleet setup, add units (with geocoded home base), crew shift scheduling and assignment, on/off-duty toggle |
| Coverage | 30-day dispatch-attempt analysis — coverage vs adoption vs capacity gap (see migrations `20260828000002` / `20260828000004`) |

---

## 05 · GPS & Maps

| Feature | Detail |
|---|---|
| Location permission | expo-location — foreground permission; stored in LocationContext |
| Distance calculation | Haversine formula; outputs "350 m" or "2.3 km"; list sorted nearest-first. **Inert in production — no hospital has coordinates, so the card falls back to showing the city name** |
| Map view (Search) | react-native-maps; green pins; Callout with name, specialty, tap-to-view; Lagos fallback (6.5244, 3.3792) |
| Map preview (Profile) | 180px embedded MapView on Info tab; scroll/zoom disabled; single marker |
| Get Directions | Coords → `maps/dir/?destination=LAT,LNG`; address fallback → `maps/search/?query=ADDRESS` |
| Web location picker | Settings: Nominatim geocoding, lat/lng fields, OSM iframe preview, Google Maps verify link |
| Database | `hospitals.latitude` and `hospitals.longitude` — double precision; partial index on non-null rows |

---

## 06 · Booking Policies & Payments

| Policy | Detail |
|---|---|
| Approval modes | Auto-approve (instant) or Manual review (admin approves/rejects; patient notified) |
| Referral requirement | Optional per hospital — patients attach referral or describe symptoms |
| Daily booking limit | Configurable; patients prompted to book next available day when reached. Blank = unlimited |
| OPD / walk-in fee | Set in ₦ per hospital; ₦0 for free OPD. Specialist fees set per doctor separately |
| **Payment collection** | **Queue does not process payments.** Fees shown in the app are the amount payable *to the hospital, at the hospital*. The `payments` table exists but nothing writes to it and no processor is integrated |
| **Refunds** | **Not applicable while Queue takes no money.** `appointments.refund_pct` is still computed and stored for when payment is integrated, but no refund can be issued and the app no longer promises one |
| No-show | Patient has 48 hours to reschedule at no extra charge |
| Cancellation | Free at any time — nothing has been charged |

---

## 06b · Ambulance & Emergency Transport

Not present in v2.0 of this document despite being the largest subsystem added
since. 13 tables, a dispatch engine, a crew app, an operator console and four
pg_cron jobs.

| Area | Detail |
|---|---|
| Promise | "We find you an ambulance, and if we can't, we tell you instantly and hand you the numbers that will" |
| Supply model | Two supplier types — hospital fleets and independent certified operators. Both are organisations; there is no gig supply |
| Duty state | `set_unit_duty()` puts a unit on duty by writing an `ambulance_shifts` row and setting `status='available'`. On duty ≠ dispatchable: a recent-enough GPS fix is also required (freshness gate reworked in `20260828000001`, made clock-skew-tolerant in `20260828000004`) |
| Matching | Pure scoring in `web/src/lib/dispatch/matching.ts` — effective tier is `least(vehicle, crew)`, plus capability fit, shift headroom, road ETA |
| 60s deadline | Three independent layers: pure-SQL pg_cron (no HTTP dependency), the `/api/transport/sweep` endpoint driven by pg_net, and a client-side timer in the app |
| Fallback directory | `emergency_directory` with enforced verification and a 90-day decay window. **Currently empty — patients see no numbers on failure** |
| Instrumentation | `dispatch_attempts` records nearest-unit distance even when nothing was dispatchable, which distinguishes a coverage gap from an adoption gap from a capacity gap |
| Hospital operator console | On web (`/dashboard/ambulances/*`) **and in the Queue Hospital app** (§04b · Ambulance Operations): requests inbox, dispatcher alerts, fleet setup + shift scheduling, 30-day coverage analysis |
| Status | Dispatch works end-to-end. **No real ambulance is on duty**, so there is no supply to dispatch — this is an adoption gap (no rota), not an engine bug (see `20260828000002`) |

---

## 07 · Subscription Plans

| Plan | Description |
|---|---|
| Starter | Limited doctor seats, capped monthly bookings, single-clinic only |
| PRO | Up to 25 doctors, unlimited bookings, EMR integration, virtual consultations. Current trial plan. |
| Growth | Multi-clinic model unlocked, higher doctor seat count |
| Enterprise | Unlimited doctors, unlimited bookings, priority support, custom integrations |
| Billing | Priced in ₦; monthly and annual options |

---

## 08 · Technical Stack

| Layer | Technology | Notes |
|---|---|---|
| Web Frontend | Next.js 16.2 | App Router · Turbopack · TypeScript · Inline styles |
| Mobile Frontend | React Native (Expo SDK 56) | TypeScript · StyleSheet |
| Backend / DB | Supabase | PostgreSQL · Auth · RLS · Realtime |
| Web Deployment | Vercel | Auto-deploy on push to main |
| Mobile Deployment | Expo EAS | Android APK (preview) · App Bundle (production) |
| Maps (Mobile) | react-native-maps 1.20.1 | MapView · Marker · Callout |
| Maps (Web) | Nominatim + OpenStreetMap | Free geocoding, no API key |
| GPS (Mobile) | expo-location 18.1.6 | Foreground permission · Haversine distance |
| Push Notifications | expo-notifications | Channel: queue-notifications |

---

## 09 · Auth & Security

| Feature | Detail |
|---|---|
| Authentication | Supabase Auth — email/password; sessions in cookies (web) and localStorage (mobile) |
| Role detection | `GET /api/me/role` server-side route — reads session cookie, queries DB with service role key (never exposed to browser) |
| Row-Level Security | RLS on all tables — data access enforced at DB level regardless of API config |
| Access guard | No-role accounts signed out and redirected to `/login` via `window.location.href` |
| Sign-out | Clears Supabase auth cookies; hard redirect to /login |

---

## 10 · Build Status & Roadmap

### Shipped ✓
- Multi-role hospital dashboard (admin, clinic, doctor, front desk)
- Patient mobile app — search, book, appointments, profile
- Emergency booking flow
- Live queue management with 30s auto-refresh
- GPS distance sorting + map view in Search
- Hospital profile embedded map + Get Directions
- Web settings location picker (Nominatim geocoding)
- Push notifications (Expo)
- Dependents, medical history, prescriptions *(prescriptions are derived from completed appointments; there is no `prescriptions` table)*
- Date filter with 14 ranges including future dates
- Subscription plan selection during onboarding
- Server-side role API (RLS-safe login on Vercel)

### In Progress ⚙
- HMO / insurance verification flow *(the Search filter chip described in §04 is not built)*
- In-app payment integration (₦) — **nothing is collected today; see §06**
- EMR integration (Growth+ plans)
- Hospital coordinate population — **0 of 2 live hospitals have lat/lng**, which
  silently degrades distance sorting, map pins and ambulance dispatch ranking

### Planned ○
- ~~Telemedicine / video consultation~~ — **built** (Agora token route, 4 video
  screens, `virtual_sessions`); unused in production so far
- Patient review & rating system — `reviews` table exists, 0 rows
- Lab results upload & sharing
- Repeat prescription reminders
- iOS app (currently Android-only)
- Super admin analytics dashboard

---

*Queue · Product Requirements Document · v2.2 · September 2026*  
*Confidential — Internal Use Only*

# Queue — Product Requirements Document
**Version:** 2.0  
**Updated:** July 2026  
**Market:** Nigeria (₦ / WAT)  
**Status:** Live

---

## 01 · Product Overview

Queue is a two-sided healthcare booking platform designed for the Nigerian market. It connects patients with hospitals and clinics through a mobile app, while giving healthcare providers a full-featured management dashboard on the web.

The platform handles the complete appointment lifecycle — from search and booking on the patient side, through queue management and vitals capture at the front desk, to analytics and revenue tracking for hospital administrators.

| Surface | Description |
|---|---|
| Web Dashboard | Next.js 16 (App Router) — multi-role hospital management: admins, clinic staff, doctors, front desk |
| Mobile App | React Native / Expo SDK 56 — patient-facing: search, book, track, maps, notifications |
| Backend | Supabase — PostgreSQL, Auth, Row-Level Security, real-time subscriptions |
| Deployment | Web → Vercel · Mobile → Expo EAS (Android APK + App Bundle) |

---

## 02 · User Roles

Access is enforced at the database level via Supabase Row-Level Security. Each role maps to a distinct set of dashboard views and API permissions.

| Role | Scope | Description |
|---|---|---|
| `super_admin` | Platform-wide | All hospitals, global analytics, onboarding oversight |
| `hospital_admin` | Hospital | Full control — doctors, staff, settings, analytics, billing |
| `clinic_admin` | Clinic | Scoped to one clinic within a multi-clinic hospital |
| `front_desk` | Clinic | Walk-in registration, queue management, check-in, vitals |
| `doctor` | Self | Own appointments, availability toggle, consultation duration |
| `patient` (mobile) | Self | Search, book, manage appointments, dependents, medical history |

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
| Add doctor | Name, specialty, MDCN licence number, years of experience, login credentials, clinic assignment |
| Schedule | Per-doctor calendar with slot availability; daily/weekly view |

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

## 04 · Mobile App Modules

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
- Filter chips: All, Virtual, Open Now, HMO Accepted, Emergency
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
- Cancel with refund policy shown

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

## 05 · GPS & Maps

| Feature | Detail |
|---|---|
| Location permission | expo-location — foreground permission; stored in LocationContext |
| Distance calculation | Haversine formula; outputs "350 m" or "2.3 km"; list sorted nearest-first |
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
| Cancellation > 24 hrs | 100% refund |
| Cancellation ≤ 24 hrs | 50% refund |
| No-show | Patient has 48 hours to reschedule at no extra charge |
| Rejected booking | 100% refund always |

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
- Dependents, medical history, prescriptions
- Date filter with 14 ranges including future dates
- Subscription plan selection during onboarding
- Server-side role API (RLS-safe login on Vercel)

### In Progress ⚙
- HMO / insurance verification flow
- In-app payment integration (₦)
- EMR integration (Growth+ plans)
- Hospital coordinate population (admins setting lat/lng)

### Planned ○
- Telemedicine / video consultation
- Patient review & rating system
- Lab results upload & sharing
- Repeat prescription reminders
- iOS app (currently Android-only)
- Super admin analytics dashboard

---

*Queue · Product Requirements Document · v2.0 · July 2026*  
*Confidential — Internal Use Only*

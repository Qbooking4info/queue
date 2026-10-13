# Queue v3.1 · Build handoff for Claude Code

Queue v3.1 · handoff 1 · 11 Oct 2026. PRD v3.1 (Queue-PRD-v3.1.docx) wins every conflict. Earlier Forest & Clinical prototype superseded; its screens are restyled here.

## How to use
1. Save this file as `docs/handoff/QUEUE_V3_1_HANDOFF.md` in the Queue repo.
2. Keep `docs/Queue-PRD-v3.1.docx` (or its text) beside it.
3. Work phase by phase. For each screen: find the existing screen in mobile/ or web/, restyle and extend it, then meet every acceptance criterion.

## Conventions
- Repo layout: mobile/ (Expo / React Native, four apps sharing packages/shared), web/ (Next.js App Router + API routes), supabase/migrations/. No Supabase Edge Functions: server logic lives in Next.js API routes using the service role admin client.
- Routes below are suggestions in Expo Router / App Router form. Before creating files, map each screen to the existing navigator and folder names in mobile/ and web/. Reuse existing screens where they exist and restyle them.
- Data: one users table for patients and staff; role link tables hospital_admins, clinic_admins, doctors. RLS maps auth.uid() through users.auth_id. Every new table ships with RLS in the same migration.
- No PostGIS. hospitals.latitude / longitude are float8; distance is Haversine in SQL or JS; fall back to area name when coordinates are null.
- Never trust a role or amount sent by the client. Role from GET /api/me/role or SECURITY DEFINER RPC; Paystack amounts and webhook signatures verified server side before an appointment is confirmed.
- Secrets only through process.env and EXPO_PUBLIC_ variables (public keys only). Paystack secret key and Supabase service role stay server side.
- Design tokens from the Handoff tab go into packages/shared/theme (mobile) and a CSS variables file in web/. No hard coded colours in screens.
- Every screen needs loading (skeleton), empty and error states with one next action. Touch targets 48 px (64 px in the crew app). Labels on every icon button.
- A hospital feature is not done until it ships on web and Queue Hospital together using the same API route (PRD §07).

## Build order
- **Phase 0 · Foundation:** Tokens and shared components in packages/shared; web CSS variables; header, tab bar, buttons, list rows, badges; dark mode switch.
- **Phase 1 · Entry:** Splash, phone/email sign in, role selection, 2FA for staff, permissions; role routing to the right app.
- **Phase 2 · Patient core:** Home, search by care need, results list/map, provider details, 3 step booking, Paystack payment, confirmation, Queue Pass, call in ring, rating.
- **Phase 3 · Virtual care:** Virtual Care hub, video/audio via Agora, chat consults, doctor online queue.
- **Phase 4 · Ambulance:** SOS hold, triage while searching, tracking, no unit fallback, scheduled transport; crew duty, offer, active job, scheduled jobs; hospital ambulance desk.
- **Phase 5 · My Care & messages:** My Care hub, records tabs, prescriptions & refills, care plans, health profile, conversations, notifications centre, family.
- **Phase 6 · Staff apps & web parity:** Hospital today, live queue, walk in, menu; doctor today, queue, consultation, e-prescription; web dashboard KPIs and all 9 modules on one API.

## Conflicts resolved (old prototype → v3.1)
| Topic | Old prototype | v3.1 decision |
|---|---|---|
| Theme | Forest dark + Clinical blue, Manrope | v3.1 teal palette, Plus Jakarta Sans; dark mode uses the teal dark tokens |
| Booking | 5 steps: type, hospital, details, schedule, confirm | 3 steps: what, when, pay & confirm |
| Payment | Pay at hospital only, nothing charged in app | Paystack in app; pay at hospital only where the hospital allows it |
| Patient tabs | Home, Search, Bookings, Dependents, Profile | Home, Appointments, Messages, Profile; family under Profile; Virtual Care and My Care from Home tiles |
| Emergency | Triage first, then choose ambulance or arrival time | Hold to confirm SOS dispatches first; triage asked while searching; self transport from Ambulance → Request |
| Queue position | Separate live position screen | Queue Pass with position, rail and QR |
| Hospital names | Lagoon Hospital, Dr. Tunde Bakare | Sample data only; use seed data, never hard code |

## Data model
Tags: [exists] in the PRD or repo notes · [new] added by v3.1 · [verify] confirm the real name in supabase/migrations first.

| Table | Status | Notes |
|---|---|---|
| users | [exists] | Patients and staff; auth_id, phone, name, dob, sex, patient_id (QP-xxxx) |
| hospitals / clinics | [exists] | latitude, longitude float8; policies (approval mode, referral, pay at hospital, fees) |
| doctors, hospital_admins, clinic_admins | [exists] | Role link tables; doctor availability and online flag |
| appointments | [exists] | status state machine, booking_mode ('emergency' etc.), urgency, position via renumber_doctor_queue(), refund_pct; add mode in_person | video | audio | chat [new] |
| payments | [exists] | Paystack reference, amount, method (card, transfer, ussd, apple_pay, google_pay, wallet [new]), status |
| payment_authorizations | [new] [verify] | Saved Paystack authorisation codes per user; never card numbers |
| wallet_transactions | [new] | Queue Wallet ledger (top up, spend, refund); balance = sum; open decision on licensing |
| virtual_sessions | [exists] | Agora channel, token, mode; add chat sessions [new] |
| conversations, messages | [new] | Patient ↔ doctor / hospital / support; assigned_to; attachments in Storage; RLS by participant |
| prescriptions | [exists in v3.0 build] | Drug, dose, frequency, duration, status (active, ready_for_pickup, completed) |
| medical_records | [new] [verify] | type lab | imaging | document; file in Storage; shared_with |
| health_profiles | [new] | allergies, conditions, family_history, blood group, genotype |
| care_plans, care_plan_tasks | [new] | plan template, doctor, weeks, tasks with schedule and completion |
| ratings / reviews | [exists] | stars, chips, comment, hospital reply |
| family links | [exists] [verify] | caretaker ↔ member with approval status; one active caretaker |
| transport requests, units, crews | [exists] [verify] | dispatch engine; add kind emergency | scheduled, scheduled_for, destination, notes [new] |
| dispatch_attempts, transport_invoices | [exists] | nearest unit distance; post trip invoice |
| emergency_directory | [exists] [verify] | verified numbers with 90 day decay |
| notifications | [exists] [verify] | type, channel (push, whatsapp, sms, email), deep link |

Appointment lifecycle: pending → confirmed → checked_in → in_progress → completed; cancelled and no_show are terminal. Payment happens before pending (or pay at hospital). Rejection and cancellation refund through Paystack using refund_pct. Rating prompt 30 min after completed.

## Design tokens
```json
{
  "color": {
    "primary": "#0F766E",
    "primaryDeep": "#134E4A",
    "tealLight": "#14B8A6",
    "tint": "#E6F4F2",
    "blue": "#2563EB",
    "success": "#16A34A",
    "successText": "#15803D",
    "warning": "#F59E0B",
    "warningText": "#B45309",
    "danger": "#EF4444",
    "dangerText": "#B91C1C",
    "neutral": "#6B7280",
    "background": "#F8FAFC",
    "surface": "#FFFFFF",
    "ink": "#0B1B1E",
    "line": "#E3ECEB"
  },
  "dark": {
    "primary": "#2DD4BF",
    "background": "#081416",
    "surface": "#0F2326",
    "ink": "#E8F1F0",
    "muted": "#94A3A6",
    "blue": "#60A5FA",
    "danger": "#F87171",
    "success": "#4ADE80",
    "warning": "#FBBF24"
  },
  "status": {
    "pending": "warning",
    "confirmed": "primary",
    "checked_in": "blue",
    "in_progress": "primaryDeep",
    "completed": "success",
    "cancelled": "neutral",
    "no_show": "neutral"
  },
  "type": {
    "family": "Plus Jakarta Sans",
    "weights": [
      400,
      500,
      600,
      700,
      800
    ],
    "body": 16,
    "small": 13,
    "caption": 11,
    "title": 18,
    "hero": 22,
    "numerals": "tabular"
  },
  "shape": {
    "radiusCard": 14,
    "radiusTile": 12,
    "radiusInput": 12,
    "radiusButton": 13,
    "buttonHeight": 48,
    "crewButtonHeight": 64,
    "spacing": 4
  },
  "motion": {
    "duration": 200,
    "easing": "ease-out",
    "reduceMotion": "stop all loops"
  }
}
```

## Shared components
| Component | Behaviour | Used in |
|---|---|---|
| Header | Teal gradient header with back, title, optional subtitle and right slot; status bar safe area | every standard screen |
| TabBar | Bottom tabs per app; unread dot | patient, doctor, hospital, crew |
| Button | primary / ghost / danger / small; 48 px; loading state | all |
| HoldButton | Press and hold 2 s with progress ring; keyboard and screen reader fallback | SOS, crew status |
| SegmentedControl | Pill segments; danger variant | Results, Appointments, Request ambulance, Messages |
| UnderlineTabs | Text tabs with teal underline | Provider details, Records, Consultation |
| ListRow | Icon tile or avatar, title, subtitle, trailing chevron/badge/action | everywhere |
| ServiceTile | Large tile with icon, label and live sublabel | Home |
| StatusBadge | Status palette chip, always icon or word, never colour alone | appointments, queue, fleet |
| Field | Input with leading icon and trailing action; error text | forms |
| OtpInput | 6 boxes, Android autofill, resend timer | 2FA, phone sign in |
| Avatar | Photo with initials fallback | people |
| KpiCard | Label, value, trend | hospital today, web dashboard |
| MapView | react-native-maps; teal pins, coral selected; Lagos fallback centre | results, tracking, crew |
| Toast | Short confirmation; announces to screen readers | all |
| QueuePassCard | Position, wait, 5 step rail, QR, Patient ID; works offline | Queue Pass |

## Screens

### Patient App · Splash / Welcome (`p-splash`)

- **Route:** `patient: app/index.tsx`
- **PRD:** §04

**Components**
- Logo
- Button

**Data**
- none

**API / services**
- none

**States and edge cases**
- Show only on first launch; returning users go to biometric unlock or Home

**Acceptance criteria**
- Get Started opens sign in
- Restart safe: a user who left mid onboarding resumes at the same step

---

### Patient App · Login / Sign Up (`p-login`)

- **Route:** `patient: app/(auth)/sign-in.tsx · web: app/(auth)/sign-in/page.tsx`
- **PRD:** §04, §16

**Components**
- Field
- Button
- OtpInput (next)

**Data**
- users [exists]

**API / services**
- Supabase Auth phone OTP + email/password [exists]

**States and edge cases**
- Invalid number
- Wrong password
- Rate limited
- Offline

**Acceptance criteria**
- Phone + OTP is the default for patients; email/password available
- Forgot password sends a reset link
- Create account goes to role selection

---

### Patient App · Role Selection (`p-role`)

- **Route:** `all apps: app/(auth)/role.tsx`
- **PRD:** §04 (v3.1)

**Components**
- ListRow (selectable)
- Button

**Data**
- users [exists]
- hospital_admins / clinic_admins / doctors [exists]

**API / services**
- GET /api/me/role [exists]

**States and edge cases**
- Staff without an invite see “Ask your hospital for an invite”

**Acceptance criteria**
- Patient continues in the patient app
- Doctor, Hospital staff and Ambulance staff open the right app (or Play Store page) and require an accepted invite before access
- Chosen role is a hint only; server role decides

---

### Patient App · Two-Factor Authentication (`p-2fa`)

- **Route:** `all apps: app/(auth)/verify.tsx`
- **PRD:** §04, §16 (v3.1)

**Components**
- OtpInput
- Button

**Data**
- auth sessions

**API / services**
- Supabase Auth OTP verify [exists]
- device trust record [new] [verify]

**States and edge cases**
- Wrong code (3 tries)
- Expired code
- Resend after 30 s, WhatsApp fallback

**Acceptance criteria**
- Required for doctors and staff at sign in, on new devices, and before payout or payment changes
- After verify, route by server role: patient → Home, doctor → Doctor Today, hospital → Hospital Today, crew → Duty

---

### Patient App · Permissions (`p-perms`)

- **Route:** `patient: app/(auth)/permissions.tsx`
- **PRD:** §04

**Components**
- ListRow + Switch

**Data**
- notification preferences [verify]

**API / services**
- expo-location, expo-notifications, local auth

**States and edge cases**
- Permission denied: explain and continue

**Acceptance criteria**
- Each permission shows a one line reason before the system prompt
- Continue never blocks if a permission is refused

---

### Patient App · Home (Patient View) (`p-home`)

- **Route:** `patient: app/(tabs)/home.tsx`
- **PRD:** §06 Home

**Components**
- Header
- ServiceTile ×4
- ListRow
- TabBar

**Data**
- appointments (next 2) [exists]
- doctors online count [exists]
- hospitals near user [exists]

**API / services**
- Supabase select with RLS
- Haversine sort

**States and edge cases**
- No upcoming visit: show Book tile prominently
- Loading skeleton

**Acceptance criteria**
- Next visit card shows live action (Queue position, Join call in N min)
- Four tiles open Search, Virtual Care, Ambulance, My Care
- SOS chip and bell always visible
- Family switcher shows “Managing for …” when active

---

### Patient App · Discovery (`p-search`)

- **Route:** `patient: app/(tabs)/home/search.tsx`
- **PRD:** §06 Search (v3.1)

**Components**
- Field
- ServiceTile ×4
- Chips

**Data**
- hospitals, doctors, specialties [exists]
- care needs → specialty map [new]

**API / services**
- search RPC or /api/search [verify]

**States and edge cases**
- No results: suggest Virtual Care

**Acceptance criteria**
- By hospital / doctor / specialty / care need open Results on the matching tab
- Care need chips map to specialties

---

### Patient App · Search Results (`p-results`)

- **Route:** `patient: app/search/results.tsx`
- **PRD:** §06 Search

**Components**
- SegmentedControl
- ListRow
- MapView

**Data**
- hospitals (lat/long), doctors, specialties [exists]

**API / services**
- Haversine sort
- filters: open now, online, 24/7, HMO, under ₦5,000, 4+

**States and edge cases**
- Hospital without coordinates shows area name
- Empty with filter reset

**Acceptance criteria**
- Tabs Hospitals / Doctors / Specialties
- List / Map toggle; teal pins, coral selected pin
- Each card shows rating, distance, open state

---

### Patient App · Provider Details (`p-provider`)

- **Route:** `patient: app/provider/[id].tsx`
- **PRD:** §06 (v3.1)

**Components**
- Avatar
- Chips
- Button
- UnderlineTabs

**Data**
- doctors, hospitals, reviews, slots [exists]

**API / services**
- select with RLS

**States and edge cases**
- Doctor unavailable: show next date
- No virtual: hide toggle

**Acceptance criteria**
- In person / Virtual toggle sets booking mode
- Book Appointment opens step 2 with doctor and mode prefilled
- Tabs About / Availability / Reviews

---

### Patient App · Pick a Time (`p-when`)

- **Route:** `patient: app/book/when.tsx`
- **PRD:** §06 Booking

**Components**
- Date strip
- Slot grid
- Button

**Data**
- slots / schedule [exists]
- daily limit [exists]

**API / services**
- slots query; duplicate and eligibility checks before payment

**States and edge cases**
- Day full: offer next free day
- Slot taken during selection

**Acceptance criteria**
- 14 day strip, slots grouped Morning / Afternoon / Evening
- Earliest slot highlighted
- Step indicator 2 of 3

---

### Patient App · Payment Methods (`p-paymethod`)

- **Route:** `patient: app/book/pay.tsx`
- **PRD:** §12 (v3.1)

**Components**
- ListRow (selectable)
- Button

**Data**
- payment_authorizations [new]
- wallet_transactions [new]

**API / services**
- POST /api/paystack/initialize [new] [verify]

**States and edge cases**
- Apple Pay / Google Pay hidden where Paystack does not support them
- Wallet balance too low

**Acceptance criteria**
- Card, Apple Pay, Google Pay, Wallet, Add new card; transfer and USSD through Paystack
- Pay at hospital shown only when the hospital allows it

---

### Patient App · Add Card (`p-addcard`)

- **Route:** `patient: app/payments/add-card.tsx`
- **PRD:** §12

**Components**
- Card preview
- Field
- Button

**Data**
- payment_authorizations [new]

**API / services**
- Paystack inline / charge authorization; store authorization_code only

**States and edge cases**
- Declined card
- 3DS / OTP step from Paystack

**Acceptance criteria**
- Card number never stored by Queue
- Saved card appears in Payment methods

---

### Patient App · Payment Summary (`p-paysum`)

- **Route:** `patient: app/book/summary.tsx`
- **PRD:** §06 step 3, §12

**Components**
- Summary card
- ListRow
- Button

**Data**
- appointments (draft) [exists]
- payments [exists]

**API / services**
- POST /api/appointments [verify]
- POST /api/paystack/initialize
- POST /api/paystack/webhook [verify]

**States and edge cases**
- Payment failed: keep slot 10 min
- Webhook delay: verifying spinner

**Acceptance criteria**
- Itemised fees and total before Pay
- Booking confirmed only after server verifies signature and amount
- Status becomes pending or confirmed by hospital approval mode

---

### Patient App · Booking Confirmed (`p-booked`)

- **Route:** `patient: app/book/confirmed.tsx`
- **PRD:** §06 Confirmation

**Components**
- Success state
- ListRow
- Button

**Data**
- appointments [exists]

**API / services**
- WhatsApp receipt via Business API [exists]

**States and edge cases**
- Awaiting approval variant

**Acceptance criteria**
- Add to calendar, directions, share with family
- View Queue Pass

---

### Patient App · Queue Pass (`p-pass`)

- **Route:** `patient: app/visits/[id]/pass.tsx`
- **PRD:** §06 Queue Pass

**Components**
- QueuePassCard
- Button

**Data**
- appointments.position, status [exists]

**API / services**
- Supabase Realtime on appointments row; polling fallback

**States and edge cases**
- Offline: cached pass and QR still show
- Position unknown before check in

**Acceptance criteria**
- Position rolls when it changes
- Android ongoing notification “#3 · about 12 min”
- “I've arrived” within ~300 m when hospital has coordinates

---

### Patient App · It's Your Turn (`p-turn`)

- **Route:** `patient: global modal`
- **PRD:** §06 Called in

**Components**
- Full screen modal

**Data**
- appointments.status → in_progress [exists]

**API / services**
- push + Realtime

**States and edge cases**
- App closed: push with ring

**Acceptance criteria**
- Shows on any tab with doctor and room
- I'm coming acknowledges to the doctor

---

### Patient App · Rate Your Visit (`p-rate`)

- **Route:** `patient: app/visits/[id]/rate.tsx`
- **PRD:** §06 Ratings

**Components**
- Stars
- Chips
- Field
- Button

**Data**
- ratings / reviews [exists]

**API / services**
- insert with RLS

**States and edge cases**
- Already rated

**Acceptance criteria**
- Prompt 30 min after completed, one reminder at most
- Shows on hospital and doctor profiles

---

### Patient App · Virtual Care (`p-virtual`)

- **Route:** `patient: app/virtual/index.tsx`
- **PRD:** §06 Virtual (v3.1)

**Components**
- Illustration
- SegmentedControl
- Button
- ListRow

**Data**
- virtual_sessions [exists]
- doctors online [exists]
- appointments.mode [new]

**API / services**
- see a doctor now queue [verify]

**States and edge cases**
- No doctors online: offer scheduled visit

**Acceptance criteria**
- Video, Audio or Chat chosen before start
- Paid before joining the waiting room
- My virtual visits list

---

### Patient App · Video Consultation (`p-video`)

- **Route:** `patient: app/virtual/[id]/call.tsx`
- **PRD:** §06 In call

**Components**
- Video view
- Call controls

**Data**
- virtual_sessions [exists]

**API / services**
- Agora token route [exists]

**States and edge cases**
- Weak network: offer audio only
- Doctor left: rejoin from Visits

**Acceptance criteria**
- Mute, camera, end; audio only fallback
- End leads to rating and notes

---

### Patient App · Conversation (`p-chat`)

- **Route:** `patient: app/messages/[id].tsx`
- **PRD:** §06 Messages (v3.1)

**Components**
- Bubbles
- Composer
- Banner

**Data**
- conversations, messages [new]

**API / services**
- Supabase Realtime on messages; attachments in Storage (signed URLs)

**States and edge cases**
- Reply window passed
- Offline: queued send

**Acceptance criteria**
- Urgent symptom banner links to SOS
- Doctor can upgrade chat to a call
- Push previews never show message text

---

### Patient App · Ambulance Services (`p-amb`)

- **Route:** `patient: app/ambulance/index.tsx`
- **PRD:** §06 Ambulance (v3.1)

**Components**
- ListRow ×2
- Banner

**Data**
- none

**API / services**
- none


**Acceptance criteria**
- Emergency opens SOS
- Scheduled opens Request on the Scheduled tab
- 112 and 767 always visible

---

### Patient App · Request Ambulance (`p-amb-req`)

- **Route:** `patient: app/ambulance/request.tsx`
- **PRD:** §06, §13 (v3.1)

**Components**
- SegmentedControl
- Field
- Button

**Data**
- transport requests (kind, scheduled_for, destination, notes) [new columns]

**API / services**
- POST /api/transport/request [verify]
- POST /api/transport/schedule [new]

**States and edge cases**
- Location off
- No units for that time

**Acceptance criteria**
- Emergency path routes to SOS
- Scheduled trips are quoted and paid before the trip and never compete with live SOS jobs

---

### Patient App · SOS (Hold to Confirm) (`p-sos`)

- **Route:** `patient: app/ambulance/sos.tsx (also app shortcut)`
- **PRD:** §06 SOS

**Components**
- HoldButton
- Chips
- Button

**Data**
- transport requests [exists]

**API / services**
- POST /api/transport/request on hold complete [verify]

**States and edge cases**
- Location unavailable: manual address
- Hold released early: nothing sent

**Acceptance criteria**
- 2 second hold creates the request and captures location
- Who needs help: me, family member, someone else
- Call 112 and Lagos 767 visible

---

### Patient App · Emergency Questions (`p-triage`)

- **Route:** `patient: app/ambulance/searching.tsx`
- **PRD:** §06 Dispatch first

**Components**
- Chips
- Button

**Data**
- transport request triage answers [verify]

**API / services**
- PATCH request with answers; matching continues in background

**States and edge cases**
- Answers optional

**Acceptance criteria**
- Three tap only questions while searching
- Triage level and vehicle tier derived, never chosen
- Moves to tracking when a crew accepts

---

### Patient App · Live Tracking (`p-track`)

- **Route:** `patient: app/ambulance/[id]/track.tsx`
- **PRD:** §06 Tracking

**Components**
- MapView
- Status rail
- ListRow
- Button

**Data**
- unit position, status [exists]

**API / services**
- Realtime on unit location
- share live location link [exists]

**States and edge cases**
- GPS stale: show last known time

**Acceptance criteria**
- ETA, 4 step rail, crew card with call
- Share live location on WhatsApp

---

### Patient App · No Ambulance Available (`p-nounit`)

- **Route:** `patient: app/ambulance/no-unit.tsx`
- **PRD:** §06 No unit

**Components**
- Button
- ListRow

**Data**
- emergency_directory [exists] [verify]
- 24/7 hospitals [exists]

**API / services**
- dispatcher alert [exists]

**States and edge cases**
- Directory empty is a launch blocker (PRD §18)

**Acceptance criteria**
- Shown within 60 s of no match
- 112, state line, verified numbers with age, nearest 24/7 hospitals, Keep searching

---

### Patient App · My Care Hub (`p-mycare`)

- **Route:** `patient: app/my-care/index.tsx`
- **PRD:** §06 My Care (v3.1)

**Components**
- ListRow ×5

**Data**
- counts from appointments, prescriptions, care_plans

**API / services**
- select with RLS


**Acceptance criteria**
- Five entries open their screens
- Respects the active family member

---

### Patient App · Appointments (`p-appts`)

- **Route:** `patient: app/(tabs)/appointments.tsx`
- **PRD:** §06 Visits

**Components**
- SegmentedControl
- Card
- StatusBadge

**Data**
- appointments [exists]

**API / services**
- select with RLS

**States and edge cases**
- Empty upcoming: Book a visit

**Acceptance criteria**
- Upcoming / Past
- View details opens Queue Pass; past visits offer rating and Book again
- Reschedule carries payment; cancel shows refund first

---

### Patient App · Medical Records (`p-records`)

- **Route:** `patient: app/my-care/records.tsx`
- **PRD:** §06 My Care

**Components**
- UnderlineTabs
- ListRow

**Data**
- medical_records [new] [verify]

**API / services**
- Storage signed URLs

**States and edge cases**
- Empty per tab

**Acceptance criteria**
- Lab Results / Imaging / Documents
- View, download and share with a doctor
- New results badge

---

### Patient App · Prescriptions (`p-rx`)

- **Route:** `patient: app/my-care/prescriptions.tsx`
- **PRD:** §06 Health

**Components**
- ListRow
- StatusBadge
- Button

**Data**
- prescriptions [exists]

**API / services**
- refill request [new]


**Acceptance criteria**
- Active, ready for pickup, completed
- Reminders on push / WhatsApp
- Refill request goes to the hospital pharmacy

---

### Patient App · Care Plan (`p-careplan`)

- **Route:** `patient: app/my-care/care-plans.tsx`
- **PRD:** §06 My Care (v3.1)

**Components**
- Progress
- Checklist rows

**Data**
- care_plans, care_plan_tasks [new]

**API / services**
- update task completion with RLS

**States and edge cases**
- No plan: explain who creates plans

**Acceptance criteria**
- Progress by week, today's tasks, next check in
- Ticking a task records time

---

### Patient App · Health Profile (`p-healthprofile`)

- **Route:** `patient: app/my-care/health-profile.tsx`
- **PRD:** §06 My Care (v3.1)

**Components**
- ListRow + Edit

**Data**
- health_profiles [new]

**API / services**
- upsert with RLS


**Acceptance criteria**
- Allergies, conditions, family history, blood group
- Shown on the doctor's consultation summary

---

### Patient App · Notifications (`p-notifs`)

- **Route:** `patient: app/notifications.tsx`
- **PRD:** §17

**Components**
- ListRow

**Data**
- notifications [verify]

**API / services**
- expo-notifications; WhatsApp deep links

**States and edge cases**
- Empty

**Acceptance criteria**
- Grouped centre; each item deep links
- Includes Lab results available and Prescription ready

---

### Patient App · Messages (`p-messages`)

- **Route:** `patient: app/(tabs)/messages.tsx`
- **PRD:** §06 Messages (v3.1)

**Components**
- SegmentedControl
- ListRow
- Unread badge

**Data**
- conversations, messages [new]

**API / services**
- Realtime

**States and edge cases**
- Empty: start from a past visit

**Acceptance criteria**
- All / Providers / Hospital
- Queue Support always available

---

### Patient App · Profile (`p-profile`)

- **Route:** `patient: app/(tabs)/profile.tsx`
- **PRD:** §06 Me

**Components**
- ListRow

**Data**
- users [exists]

**API / services**
- sign out clears session


**Acceptance criteria**
- Payment methods, family, health profile, channels, appearance, privacy, help, sign out

---

### Patient App · Family (`p-family`)

- **Route:** `patient: app/profile/family.tsx`
- **PRD:** §06 Family

**Components**
- ListRow
- Field
- Button

**Data**
- family links [exists] [verify]

**API / services**
- link request + approval via WhatsApp/push

**States and edge cases**
- Pending approval
- Wrong Patient ID

**Acceptance criteria**
- Add by Patient ID or by scanning a Queue Pass QR
- Member must approve; one active caretaker
- Manage switches the header to “Managing for …”

---

### Patient App · Home (Dark Mode) (`p-home-dark`)

- **Route:** `theme`
- **PRD:** §03, §17

**Components**
- all components in dark tokens

**Data**
- user theme preference [verify]

**API / services**
- none


**Acceptance criteria**
- Light, Dark, System on every app and the web
- Contrast AA in both themes

---

### Hospital App · Today (`h-today`)

- **Route:** `hospital: app/(tabs)/today.tsx · web: app/dashboard/page.tsx`
- **PRD:** §07, §05 Today

**Components**
- KpiCard ×4
- Alert cards
- TabBar

**Data**
- appointments, payments, transport requests, messages [exists/new]

**API / services**
- shared API with web dashboard

**States and edge cases**
- Clinic admin and front desk locked to their clinic

**Acceptance criteria**
- KPIs with trend vs last period
- Inbound ambulance, approvals and unread messages as actionable cards
- Clinic switcher for hospital admins

---

### Hospital App · Live Queue (`h-queue`)

- **Route:** `hospital: app/(tabs)/queue.tsx`
- **PRD:** §07 Front desk

**Components**
- SegmentedControl
- ListRow + actions
- Button

**Data**
- appointments.position [exists]

**API / services**
- Realtime; renumber_doctor_queue() [exists]

**States and edge cases**
- Offline: actions queue and sync

**Acceptance criteria**
- Scan QR to check in; vitals sheet opens
- Emergencies pinned on top
- Call next, ring, mark seen, no show, move

---

### Hospital App · Walk-in Intake (`h-walkin`)

- **Route:** `hospital: app/walk-in.tsx · web: modal`
- **PRD:** §05 Walk-in, §07

**Components**
- Field
- Chips
- SegmentedControl
- ListRow

**Data**
- users (lookup by phone) [exists]
- appointments [exists]
- payments [exists]

**API / services**
- POST /api/walk-ins [verify]

**States and edge cases**
- New patient: create minimal profile

**Acceptance criteria**
- Phone number finds existing patients
- Emergency urgency enters the queue on top
- Payment: Paystack link by WhatsApp, POS, cash or later

---

### Hospital App · Ambulance Desk (`h-amb`)

- **Route:** `hospital: app/ambulance.tsx · web: app/ambulance/page.tsx`
- **PRD:** §13 Operator console

**Components**
- Alert card
- ListRow
- StatusBadge

**Data**
- transport requests, units, crews [exists] [verify]

**API / services**
- Realtime; assign unit / doctor

**States and edge cases**
- No units on duty

**Acceptance criteria**
- Inbound patient with ETA and triage; assign doctor
- Scheduled trips with unit assignment
- Fleet status with GPS freshness

---

### Hospital App · All Modules (`h-menu`)

- **Route:** `hospital: app/(tabs)/menu.tsx`
- **PRD:** §07 parity

**Components**
- Grid of modules

**Data**
- role scope

**API / services**
- same routes as web

**States and edge cases**
- Hide modules the role cannot use

**Acceptance criteria**
- Every web module reachable; tablets show a sidebar

---

### Doctor App · Today (`d-today`)

- **Route:** `doctor: app/(tabs)/today.tsx`
- **PRD:** §08

**Components**
- KpiCard
- SegmentedControl
- Next patient card

**Data**
- doctors.availability [exists]
- appointments [exists]

**API / services**
- update availability

**States and edge cases**
- Break / off: Call in disabled

**Acceptance criteria**
- On duty / Break / Off plus Available online
- Next patient shows vitals and allergies
- Call in rings the patient

---

### Doctor App · My Queue (`d-queue`)

- **Route:** `doctor: app/(tabs)/queue.tsx`
- **PRD:** §08 Queue

**Components**
- SegmentedControl
- ListRow

**Data**
- appointments [exists]

**API / services**
- Realtime

**States and edge cases**
- Empty queue

**Acceptance criteria**
- In person and online queues
- Emergencies on top; vitals flag

---

### Doctor App · Consultation (`d-consult`)

- **Route:** `doctor: app/consult/[id].tsx`
- **PRD:** §08 Consultation

**Components**
- Summary strip
- UnderlineTabs
- Field
- Button

**Data**
- appointments, vitals, notes [exists]

**API / services**
- status → completed; notes visibility

**States and edge cases**
- Autosave notes

**Acceptance criteria**
- Notes · History · Prescribe · Refer
- End and call next completes and rings the next patient

---

### Doctor App · E-prescription (`d-rx`)

- **Route:** `doctor: app/consult/[id]/prescribe.tsx`
- **PRD:** §08 Prescribe

**Components**
- ListRow
- Allergy check card
- Button

**Data**
- prescriptions [exists]
- health_profiles.allergies [new]

**API / services**
- insert prescriptions; WhatsApp to patient

**States and edge cases**
- Allergy conflict blocks send until acknowledged

**Acceptance criteria**
- Drug, dose, frequency, duration
- Sent to patient's My Care and WhatsApp

---

### Doctor App · Messages & Online Queue (`d-messages`)

- **Route:** `doctor: app/(tabs)/messages.tsx`
- **PRD:** §08 (v3.1)

**Components**
- SegmentedControl
- ListRow

**Data**
- conversations, virtual_sessions [new/exists]

**API / services**
- Realtime


**Acceptance criteria**
- Online queue: start call or reply
- Chats assigned to the doctor

---

### Doctor App · Profile & Earnings (`d-me`)

- **Route:** `doctor: app/(tabs)/me.tsx`
- **PRD:** §08 Me

**Components**
- KpiCard
- ListRow

**Data**
- payments (earnings), ratings [exists]

**API / services**
- select with RLS


**Acceptance criteria**
- Doctor ID and QR for linking
- Earnings via Paystack, rating, linked hospitals

---

### Ambulance App · Duty (`c-duty`)

- **Route:** `crew: app/(tabs)/duty.tsx`
- **PRD:** §09

**Components**
- Large toggle
- Chips
- ListRow

**Data**
- crew shifts, unit GPS [exists]

**API / services**
- background location; freshness check

**States and edge cases**
- Stale GPS: coral chip, unit not dispatchable

**Acceptance criteria**
- 64 px targets
- On duty requires a recent GPS fix

---

### Ambulance App · Incoming Offer (60 s) (`c-offer`)

- **Route:** `crew: global full screen modal`
- **PRD:** §09 Offer

**Components**
- Countdown ring
- Button

**Data**
- dispatch_attempts [exists]

**API / services**
- accept / decline; 60 s deadline via pg_cron + /api/transport/sweep [exists]

**States and edge cases**
- Already covered
- Timed out

**Acceptance criteria**
- Rings on lock screen
- Decline asks one tap reason

---

### Ambulance App · Active Job (`c-active`)

- **Route:** `crew: app/job/[id].tsx`
- **PRD:** §09 Active job

**Components**
- MapView
- HoldButton

**Data**
- transport request status [exists]

**API / services**
- status updates with 1 s hold

**States and edge cases**
- Navigation app missing

**Acceptance criteria**
- Arrived → Start transport → Arrived at hospital → Complete
- Receiving hospital sees live ETA

---

### Ambulance App · Scheduled Jobs (`c-scheduled`)

- **Route:** `crew: app/(tabs)/jobs.tsx`
- **PRD:** §09 (v3.1)

**Components**
- Card list
- Button

**Data**
- transport requests kind = scheduled [new]

**API / services**
- accept scheduled job

**States and edge cases**
- None today

**Acceptance criteria**
- Booked trips by time with pickup, destination, notes
- Accept in advance; same status flow on the day

---

### Ambulance App · Crew Profile (`c-me`)

- **Route:** `crew: app/(tabs)/me.tsx`
- **PRD:** §09 Me

**Components**
- ListRow

**Data**
- crews, certifications [verify]



**Acceptance criteria**
- Certifications, shift history, earnings for operator crews, sign out

---

### Web Dashboard · Hospital Dashboard (`w-dash`)

- **Route:** `web: app/(dashboard)/[module]/page.tsx`
- **PRD:** §05 (v3.1 sidebar)

**Components**
- Sidebar
- Top bar
- KpiCard ×4
- Line chart
- Activity list
- Data tables

**Data**
- all hospital tables via service role with role checks

**API / services**
- web/app/api/* shared with Queue Hospital

**States and edge cases**
- Skeleton tables
- Empty states with next action

**Acceptance criteria**
- Sidebar: Dashboard, Appointments, Patients, Virtual Care, Ambulance, Care Plans, Messages, Reports, Settings
- Ctrl/⌘K command bar, + Walk in, inbound ambulance banner
- CSV/PDF export on every table
- Super admin views stay web only

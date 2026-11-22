# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Four Expo (SDK 56 / RN 0.85) apps shipping to both iOS and Android from one shared
component library. The design language is deliberately shared across the two OSes
rather than forked, but per-OS affordances (system back gesture, status-bar
treatment, safe areas, control idioms, haptics) are respected on each.

## Users

Four distinct users, each in their own app, all inside one hospital visit:

- **Patient** (`apps/client`, "Queue") — a Nigerian outpatient booking a hospital or
  specialist visit, paying for it, physically waiting in or travelling to a
  hospital, or taking a video consultation. Often booking on behalf of a dependent.
  In an emergency, requesting an ambulance.
- **Doctor / specialist** (`apps/doctor`, "Queue Doctor") — working a clinic session:
  seeing who is next, calling the next patient, running the consultation (in person
  or video), writing prescriptions and care plans. On their feet, between patients.
- **Hospital front desk and admin** (`apps/hospital`, "Queue Hospital") — checking
  patients in, assigning doctors, ordering the live queue, handling walk-ins and
  overrides. The busiest, most interrupted user of the four.
- **Ambulance crew / dispatcher** (`apps/ambulance`, "Queue Ambulance") — accepting
  or declining a dispatch, navigating to a patient, updating transport status. In a
  moving vehicle, one-handed, under time pressure.

Staff roles are authoritative in the data model as `doctor`, `front_desk`,
`hospital_admin`, `super_admin`; patients are not staff.

## Product Purpose

Queue replaces the Nigerian hospital waiting room as the unit of care coordination.
A patient books and pays before arriving, holds a real position in a real queue they
can see, and is called when it is actually their turn. Staff see one ordered live
queue instead of a corridor of people. Success is a patient who knows where they
stand without asking anyone, and a front desk that never has to arbitrate who
arrived first.

## Positioning

The queue is a shared, authoritative, numbered object — not a notification and not
an estimate. Patients and staff look at the same ordering, derived from one rule
(emergency tier, then numbered / arrived / not-yet-here bands). A patient may move
themselves **later** in the queue and never earlier; only staff may move someone
earlier. Wait times are presented as honest bands with a staleness stamp rather than
false precision. A competing booking app can copy appointments; it cannot copy a
queue both sides trust.

## Operating Context

- Four conditions confirmed by the user as all applying simultaneously:
  **low-end Android** (2–4GB RAM, small low-DPI screens) is the common device;
  **outdoors in bright daylight** — hospital forecourts, ambulance cabs;
  **one-handed and in a hurry** — staff on their feet, patients standing in a queue;
  **poor or metered network** — intermittent 3G, where heavy imagery and webfonts
  cost the user real money and the offline state is a first-class screen.
- Money is Nigerian naira (₦). Payments run through Paystack, including a wallet,
  refunds and reconciliation.
- Video consultations run on Agora.
- The web app (Next.js) hosts every API route the four apps call plus a hospital
  dashboard; Supabase Postgres is the source of truth, with row-level security.
- A visit has real-world states the UI must carry: booked, paid, checked in,
  numbered, called, in progress, left the queue for a lab and returned, completed,
  no-show, cancelled.

## Capabilities and Constraints

- Booking (hospital, specialist, direct, emergency), payment and wallet, live queue
  position, video and in-person consultation, prescriptions, care plans, medical
  history, dependents, insurance, messaging, ambulance request and tracking.
- 88 app screens across the four apps plus shared screens — any system change must
  be economical to apply at that scale.
- Offline and stale states already exist as real conditions (`useIsOffline`,
  `OfflineBanner`, wait-time staleness) and are design surface, not edge cases.
- Accessibility and motion: `useReducedMotion` is already honoured and must stay so.
- One production database; no staging.
- Undecided product facts: SMS fallback for critical notifications is wired but has
  no provider configured; `lab_return_credit_minutes` is unset.

## Brand Commitments

- The name **Queue**, and the per-app names Queue Doctor / Queue Hospital /
  Queue Ambulance.
- **Teal is binding.** The user confirmed teal is the established brand colour and
  must survive the redesign. Typography, layout, components, density and the rest of
  the palette are explicitly open to replacement.
- Nothing else in the current "v3.1" look is a commitment: Plus Jakarta Sans, the
  teal gradient header, Ionicons, the white rounded-card language and the pill badge
  vocabulary are all replaceable.
- One design system across all four apps, expressed in **two registers**: the patient
  app warmer and calmer, the three staff apps denser and more instrument-like
  (user's decision).

## Evidence on Hand

- Incumbent implementation as visual evidence: `packages/shared/contexts/ThemeContext.tsx`
  (two palettes, `clinical` light default and `forest` dark, teal `#0F766E` / `#2DD4BF`,
  structural scale), `packages/shared/components/ui/` (Typography, v3, Button,
  StatusBadge, QueueMark, Skeleton and others), `packages/shared/components/ui/v3.tsx`
  (gradient Header, tiles, rows).
- Real ordering logic to design against: `packages/shared/lib/queueOrder.ts`,
  `packages/shared/lib/waitTime.ts`, `packages/shared/lib/statusColors.ts`.
- Repair and audit history in `docs/repair/` and `reports/`.
- No DESIGN.md exists; no committed visual-regression goldens or screenshot fixtures
  exist. There are no brand guidelines, no logo spec and no app-store screenshots on
  hand; none must be invented.

## Product Principles

1. **The queue is the product.** Where a patient stands, and who is next, outrank
   every other thing on any screen that shows them.
2. **Say what is true, including when it is unknown.** Honest bands, staleness
   stamps, named blocking reasons; never a precise number the system cannot support.
3. **Built for the worst device in bright sun, not the demo phone.** Legibility,
   target size and speed on low-end Android are the floor, not a late adaptation.
4. **One hand, in a hurry.** The primary action is reachable by a thumb and hard to
   miss; staff screens assume interruption and return the user to where they were.
5. **The offline, empty and error states are the product too.** They are designed at
   the same fidelity as the happy path.

## Accessibility & Inclusion

- High contrast is a product requirement, not a preference: confirmed outdoor daylight
  use on low-DPI screens.
- Tap targets sized for hurried one-handed use.
- Reduced-motion is already honoured (`useReducedMotion`) and must remain honoured.
- Data-conscious: the design must not depend on heavy imagery or large webfont
  payloads, because users pay per megabyte.

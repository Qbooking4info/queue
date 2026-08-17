# Queue — End-to-End Audit

**Date:** 2026-08-10
**Scope:** web dashboard, mobile app, database schema, live production data
**Reference:** `Queue-PRD-v2.0.md`, `Queue-Database-Schema.md`

Findings are ordered by consequence, not by effort. Everything below was verified
against the live production project (`qzodmkgyzguzzyovjpfx`), not inferred from
code alone.

---

## P0 — The product does not currently do what it tells users it does

### P0.1 · The app charges money it never collects

The booking flow shows a fee breakdown in ₦, a total, and a button labelled
**"Confirm & Pay"**. It writes `payment_method: 'card'` on every appointment.

Production reality:

| | |
|---|---|
| `appointments` | 28 rows, **all** with `payment_method = 'card'` |
| `payments` | **0 rows** |
| Code writing to `payments` | **0 files** |
| Payment provider SDK (Paystack/Flutterwave/Stripe) | **none integrated** |

No money has ever moved. The PRD lists "In-app payment integration (₦)" under
*In Progress*, but the user-facing surface is already presenting itself as a
completed transaction.

The refund policy compounds this. `Queue-PRD-v2.0.md` §06 promises 100% refund
above 24 hours, 50% within 24 hours, 100% on rejection. `cancelAppointment()`
faithfully computes `refund_pct` and stores it — against a payment that does not
exist. The one cancelled appointment in production has `refund_pct` set and
nothing to refund.

**Why this is P0:** a patient in Nigeria taps "Confirm & Pay" for ₦20,500 and is
told a refund policy. Nothing is charged and nothing can be refunded. That is a
consumer-protection exposure, not a missing feature — and it is the kind of thing
that reads very badly in hindsight.

**Fix:** either integrate a real processor, or relabel the flow honestly
("Confirm booking — pay at the hospital") and remove refund-percentage language
until money actually moves. The second option is a copy change and can ship today.

### P0.2 · No hospital has coordinates, which silently breaks every location feature

Both hospitals in production have `latitude = NULL`, `longitude = NULL`.

Downstream consequences, all currently degraded:

- **Distance sorting** (`SearchScreen`) uses a real Haversine implementation, but
  falls back to `distance: h.city` in `adapters.ts` — so the card shows *"Lagos"*
  where a distance should be, and "nearest first" is a no-op.
- **Map pins** cannot be placed.
- **Ambulance dispatch** ranks candidates by distance to the destination
  hospital. With no destination coordinate, that input is absent.

The PRD lists "Hospital coordinate population" under *In Progress*, so this is
known — but it is worth stating that it is not one feature waiting, it is three
features quietly returning wrong answers.

**Fix:** onboarding now captures lat/lng (shipped today). The two existing rows
need a human — their addresses geocode to the wrong part of Lagos or not at all,
and a wrong hospital coordinate sends ambulances to the wrong place.

### P0.3 · The emergency fallback directory is empty

`emergency_directory` has **0 rows**. The patient-facing fallback panel therefore
renders its empty state: *"No verified emergency numbers are listed for your
area yet."*

The entire second half of the ambulance promise — "if we can't find you one, we
hand you the numbers that will" — is currently inert. The 60-second deadline
fires correctly and then offers nothing.

**Fix:** someone dials the national and Lagos state emergency lines and enters
them at `/dashboard/directory`. Not delegable to tooling; the schema deliberately
refuses to store an entry without naming who verified it.

### P0.4 · No ambulance is on duty, so dispatch has nothing to dispatch

Three units exist. `TEST-UNIT-1` is hand-seeded to `available`; the two real
units sit at `offline`. Dispatch now works end-to-end (verified), but supply is
zero.

---

## P1 — Security and privacy

### P1.1 · `ambulance_providers` is world-readable, including commission rates

Probed with the publishable key (shipped in the APK, therefore public):

```
GET /rest/v1/ambulance_providers  →  200
  name, provider_type, contact_phone, contact_email,
  commission_rate: 0.15,  reliability_score: 0.8,  is_verified
```

Anyone with the mobile app can enumerate every ambulance provider on the
platform, their direct contact details, and **your commission arrangement with
each of them**. This is the same class of finding as the
`get_daily_booking_count` leak already recorded in `AUDIT-FINDINGS.md`:
commercially sensitive data exposed to `anon` because a table was made readable
for one legitimate purpose without column scoping.

**Fix:** revoke `anon` select on the table and expose only what the app needs
(name, tier) through a view, exactly as `emergency_directory_public` does.

### P1.2 · Orphaned `clinics` table with live-looking data

| table | rows | code references |
|---|---|---|
| `clinics` | **13** | **0** |
| `hospital_clinics` | 9 | 13 files |

`clinics` is dead — nothing reads or writes it — but it still holds 13 rows and
is **readable by anon**. It is a trap for the next person who greps for "clinic",
and stale data that will eventually be mistaken for real.

**Fix:** confirm it is truly unused, then drop it. Do not simply leave it.

### P1.3 · Repository governance is still open

- GitHub **secret scanning and push protection are off**. This is the control
  that would have caught the service_role key committed on 2026-07-26.
- `main` has **no branch protection**; 15 commits went straight to the production
  branch today with no review gate.

Both need repo-admin rights (my token returns 403).

---

## P2 — Built but not connected

### P2.1 · The doctor scheduling system has no effect on patient booking

A complete slot system exists: `time_slots` table, `/api/doctors/schedule`
generator, a clear endpoint, and `getAvailableSlots()` in the mobile API layer.

```
time_slots rows                  0
getAvailableSlots() call sites   0
BookingFlowScreen slot source    ALL_OPD_SLOTS  (hardcoded 08:00–17:00)
```

An administrator configures a doctor's schedule and **nothing changes** for
patients — the app offers the same hardcoded ten slots regardless. The two
systems were built independently and never joined.

This is the single largest piece of built-and-unused functionality in the
codebase.

### P2.2 · The ambulance subsystem is absent from the PRD

13 tables, a dispatch engine, crew app, operator console, and three pg_cron jobs
— none of it appears in `Queue-PRD-v2.0.md`. The PRD's roadmap does not mention
ambulances at any status.

Anyone using the PRD as the source of truth for scope has an incomplete picture
of what they are running.

### P2.3 · PRD status drift

| Feature | PRD says | Reality |
|---|---|---|
| Telemedicine / video consultation | *Planned* | **Built** — 4 video screens, Agora token route, `virtual_sessions` table |
| Prescriptions | *Shipped* | No `prescriptions` table exists; the screen derives from completed appointments |
| HMO filter chip | *Shipped* (§04 Search) | Not present in code |
| Patient reviews & ratings | *Planned* | `reviews` table exists, 0 rows, 2 code references |

### P2.4 · Features shipped with no data

`dependents` (0), `reviews` (0), `virtual_sessions` (0), `time_slots` (0),
`transport_invoices` (0). Not defects individually, but collectively they mean
much of the app has never been exercised against real usage.

---

## P3 — Hygiene

- **`PROJECT_SOURCE.md` remains in git history** with the (now-dead) service_role
  key. Scrubbing requires a force-push to a repo Ikenna has cloned — coordinate
  first. This is hygiene now, not containment.
- **Stale Vercel environment variables** point at a *different* Supabase project
  (`hsgynvkclwjllvscacjm`). Provably unused, documented in `Queue-Env-Config.md`,
  but they nearly caused a wrong-database misconfiguration during the August key
  rotation.
- **`Queue-PRD-v2.0.md` is dated July 2026** and predates the ambulance work, the
  key rotation, and the dispatch scheduler.

---

## What is genuinely healthy

Worth stating, because the list above is one-sided:

- The dispatch matching engine is domain-correct — effective tier as
  `least(vehicle, crew)`, shift-headroom filtering so a crew cannot time out
  mid-transport, capability matching.
- RLS is doing its job. 52 tables probed as `anon`; patient data
  (`users`, `appointments`, `patient_medical_history`) returns nothing.
- The 60-second emergency deadline is enforced in three independent layers, one
  of which has no HTTP dependency at all.
- Auth role resolution correctly handles the dual identity paths (portal-created
  vs self-registered doctors, third-party vs hospital-fleet crew).

---

## Suggested order

1. **P0.1** — relabel the payment UI honestly (hours), or integrate a processor (weeks)
2. **P0.3** — dial and enter the emergency numbers (one afternoon)
3. **P1.1** — lock down `ambulance_providers` (one migration)
4. **P1.3** — enable secret scanning + branch protection (five minutes, repo admin)
5. **P0.2** — set coordinates for the two hospitals (needs someone who knows where they are)
6. **P2.1** — join the slot system to booking, or delete it and stop maintaining both
7. **P1.2** — drop the orphaned `clinics` table
8. **P2.2 / P2.3** — bring the PRD back in line with what exists

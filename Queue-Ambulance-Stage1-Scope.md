# Queue — Ambulance Stage One Scope

**Status:** steps 1-2 shipped; step 3 next
**Date:** 2026-08-10

## The promise

> We find you an ambulance, and if we can't, we tell you instantly and hand you the
> numbers that will.

Stage one delivers that promise **honestly at zero supply**, and makes dispatch work
the moment a real operator comes online. It is not "Uber for ambulances" — see
*Deliberately not in scope*.

## Why the current build can't deliver it

Three findings from the audit, in order of severity:

1. **Supply is structurally invisible.** `find_candidate_units` requires
   `ambulances.status = 'available'` *and* a position fresher than two minutes.
   Nothing in the codebase ever sets a unit to `available` — the column defaults to
   `offline` and has no writer. And location pings are sent only from
   `CrewHomeScreen` inside `if (!activeJob) return`, so an idle unit never reports
   its position. A unit cannot become dispatchable, and if it could, it would have
   no location. The candidate set is always empty unless rows are hand-seeded.

2. **Nothing bounds the search.** `expire_stale_offers()` marks offers expired and
   stops. Only a *decline* advances a round. A crew that ignores the push leaves the
   request in `searching` forever, with no failure, no alert, and no fallback.

3. **The failure path is unreachable.** `exhaustSearch()` already emits a
   notification carrying `show_emergency_fallback: true`. The design instinct is
   there. It has simply never been able to run.

The matching engine itself (`web/src/lib/dispatch/matching.ts`) is sound — tier /
capability fit, `effectiveTier = least(vehicle, crew)`, shift headroom so a crew
can't time out mid-transport. Stage one keeps it and feeds it real supply.

---

## 1. Tables

### New: `emergency_directory`

The fallback numbers. Must be readable by `anon` (this has to work before login and
on a cold install) and cached on-device for offline use.

| column | notes |
|---|---|
| `id` | pk |
| `name` | "Lagos State Ambulance Service" |
| `kind` | `national` \| `state` \| `hospital_ae` \| `private_fleet` |
| `phone`, `alt_phone` | E.164 |
| `state`, `city` | coarse coverage for v1 |
| `latitude`, `longitude` | nullable — proximity ranking comes later |
| `priority` | manual ordering within a coverage area |
| `is_active` | |
| `last_verified_at`, `verified_by`, `verification_note` | **not optional** |

**Decay is a hard requirement.** Entries unverified beyond a threshold are demoted,
then hidden. A dead number in an emergency is the single worst thing this product
can do — worse than showing nothing. Serve through a view that filters on
`last_verified_at`, never the raw table.

Every entry must be dialled by a human before launch and on a schedule after.
**This cannot be generated, scraped, or inferred.**

### New: `dispatch_attempts`

The instrumentation that becomes the supply-acquisition dataset.

| column | notes |
|---|---|
| `request_id`, `round`, `radius_m` | |
| `candidates_found` | rows returned by `find_candidate_units` |
| `candidates_after_filter` | survivors of `hardFilter` |
| `reject_reasons` | jsonb tally: `{tier_too_low: 2, shift_too_short: 1}` |
| `nearest_unit_m` | distance to the nearest unit **even if unusable** |

`nearest_unit_m` is the important one. "There were 40 unserved calls in Surulere and
the nearest rig averaged 14km" is the pitch to the next fleet operator, and the
empirical answer to *where does supply come from*.

### Changed: `transport_requests`

- `search_deadline_at timestamptz` — set to `created_at + 60s` for emergency at
  insert. This is the contract; everything else reads it.
- `failure_reason text` — why we gave up, for the dataset above.

### Unchanged: `ambulance_shifts` — and this is the key simplification

Do **not** add a new duty-session concept. "Go on duty" simply **inserts an
`ambulance_shifts` row** starting now and ending at a stated time, alongside setting
`status = 'available'`.

That one decision means `find_candidate_units`, `effectiveTier`, and the shift
headroom filter all keep working **with no changes at all**. The rota model stops
being a pre-filing burden on operators and becomes a live duty record. Marketplace
supply and fleet supply use the identical path.

---

## 2. The two 60-second timers

Three layers, degrading independently. Any one alone still honours the promise.

### Layer A — server, guaranteed: pg_cron, pure SQL

```
expire_overdue_searches()   -- every 10s, via the existing pg_cron schedule
  status = 'searching' AND search_deadline_at <= now()
    -> status = 'no_unit_available', failure_reason, dispatcher_alert, notification
```

**Deliberately contains no HTTP.** It does not call the Next.js engine, so it does
not depend on `CRON_SECRET`, on the Vercel plan, or on Vercel being up at all. The
existing `20260729000003` cron already runs at 10s granularity — this is one more
function on that schedule.

This is why the deadline is enforceable even though round-advancement isn't.

### Layer B — server, best-effort: `/api/transport/sweep`

Already built and deployed; still has no trigger. It advances rounds for *better
matching* within the 60s window. If it never runs, Layer A still fails the request
honestly and on time — you get worse matching, not a broken promise.

Needs Vercel Pro cron or any external scheduler. **Not a stage-one blocker.**

### Layer C — client, guaranteed: the app's own countdown

A local timer in `AmbulanceTrackingScreen`, anchored to the request's
`created_at`. At T+60s it escalates the UI to the failure state **regardless of
server state**.

*(Corrected from an earlier draft that named `EmergencyConfirmationScreen` —
that screen is the hospital walk-in flow. The ambulance request navigates from
`EmergencyBookingScreen` straight to `AmbulanceTracking`.)*

Anchoring to `created_at` rather than a mount timestamp matters: backgrounding
the app or re-entering the screen must not restart the clock and hide the
deadline from someone who has already been waiting.

The phone knows when it pressed the button. It does not need permission from the
backend to conclude that a minute has passed. If Supabase is slow, if realtime drops,
if the API 500s — the patient still gets told at 60 seconds. For a life-safety path,
never trust your own infrastructure to report its own failure.

`subscribeToTransport` already gives live status; the local timer is the floor under
it, not a replacement.

---

## 3. Screens

### Mobile

**`components/emergency/FallbackPanel.tsx`** *(new)* — the directory, one tap to dial,
reads from the on-device cache first. Renders with no network and no session.

**`EmergencyBookingScreen`** — surface the fallback panel from the first frame,
before any request exists.

**`AmbulanceTrackingScreen`** — the heart of stage one. Owns Layer C. Two states:

- `t < 60s` — *"Finding you an ambulance… 0:12"*, fallback panel visible and
  dialable **the entire time**
- `t >= 60s` or status `no_unit_available` — escalate: *"We couldn't reach an
  ambulance. Call now."*, fallback becomes the primary surface

The fallback is **never gated behind failure**. A patient waiting on a spinner is a
patient not dialling. Both paths run in parallel and the user chooses. If they call
*and* we find a unit, that is a good outcome.

**`crew/CrewHomeScreen`** — an **on/off duty toggle** (this is the missing writer for
`ambulances.status`), and heartbeat while *on duty*, not only while on a job. Moving
the ping out of the `activeJob` guard is what breaks the deadlock.

### Web

**`dashboard/ambulances/fleet`** — per-unit duty controls so an operator can put a rig
on duty from a desk. For a hospital fleet this is the primary path; the crew app
toggle is the convenience one.

**Directory admin** *(new, super-admin)* — CRUD plus verification tracking: who
dialled it, when, what happened. Surfaces entries approaching decay.

---

## 4. Deliberately not in scope

Keep the code, disable the behaviour — none of this is wrong, it is early.

| Thing | Why it waits |
|---|---|
| Fairness tie-break (`TIE_BREAK_EPSILON`, `lastDispatchedAt`) | Solves "many providers competing for one job". The problem is the exact opposite. |
| `reliabilityScore` weight | Never written by anything. Weight it to zero rather than rank on a constant. |
| `networkScore` / `applyNetworkPreference` | Meaningless at two hospitals. |
| `transport_rate_cards`, `transport_invoices` | No pricing in v1. |
| Surge, bidding, driver incentives | Gig-supply mechanics. Both supplier types are organisations. |
| Proximity-ranked hospital directory | **No coordinates exist.** Production has 2 hospitals, 0 geocoded. |

**Prerequisite, small but blocking:** make `latitude`/`longitude` mandatory in
hospital onboarding (`/api/geocode` already exists) and backfill the two live rows.
Without it there is no proximity anything, ever.

---

## 5. Sequence

1. ~~**Directory + Layer C.**~~ **Done** — `20260810000001`, applied. Table ships
   empty by design; the app shows no number until a human verifies one.
2. ~~**Layer A.**~~ **Done** — `20260810000002`, applied. Verified in production:
   a request created at 12:03:25 with a 60s budget was swept at 12:04:34
   (9s overshoot, within the 10s cron tick), with the status flip, dispatcher
   alert, patient notification and `transport_events` audit row all landing.
3. **Break the deadlock.** Duty toggle, idle heartbeat, operator console. Dispatch can
   now actually find a unit.
4. **`dispatch_attempts`.** Start collecting the coverage-gap dataset immediately —
   it is the input to every supply conversation.
5. **Layer B.** Schedule the sweep once the plan/scheduler question is settled.

Steps 1–2 are shippable without a single ambulance onboarded.

---

## 6. Open, and blocking launch

- **Directory verification.** Every number dialled and confirmed by a human, with an
  owner and a re-verification cadence. Not delegable to tooling.
- **Legal review.** There is currently no adviser. The exposure is not hypothetical
  and not future: production already holds medical histories, vitals, diagnoses and
  prescriptions. An emergency-dispatch promise raises it further. A Nigerian
  health-tech / data-protection lawyer should see this before the ambulance feature
  launches — and arguably before the PHI already being stored.
- **Anonymous access.** Should someone be able to press the button without an
  account? The directory must work logged-out. Dispatch probably needs identity for
  callback. Undecided.
- ~~Migration `20260730000002`~~ — already applied to production.

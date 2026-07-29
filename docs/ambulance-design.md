# Queue — Ambulance Services Integration

**Scope:** emergency dispatch + scheduled non emergency transport
**Ownership:** mixed (hospital owned fleets + third party providers on the marketplace)

---

## 0. The core insight

Appointments and ambulances look similar (both book a resource for a time) but behave
oppositely:

| | Appointment | Emergency transport |
|---|---|---|
| Time | chosen by patient | now |
| Resource | fixed to one facility | mobile, changes location |
| Failure mode | slot double booked | no unit found |
| Cancellation | patient's choice | can be clinical |
| Truth source | the calendar | the vehicle's GPS |

So the transport request is **not** an appointment subtype. It is its own entity with
its own state machine, and it *creates* an appointment style record at the destination
facility once a hospital is selected.

Scheduled non emergency transport sits between the two: it books ahead like an
appointment, but executes like a dispatch.

---

## 1. Data model

### 1.1 Providers and units

```
ambulance_providers
  id, name, provider_type ('hospital_fleet' | 'third_party')
  hospital_id            -- non null only for hospital_fleet
  service_area           -- polygon
  status, commission_rate, reliability_score
```

Keeping hospital fleets and third party operators in **one** table with a discriminator
matters. If you split them you will duplicate every matching, billing, and
tracking query. The only real differences are billing (internal cost centre vs
commissioned payout) and dispatch priority, both of which are columns.

```
ambulances
  id, provider_id, plate_number
  unit_type ('PTS' | 'BLS' | 'ALS' | 'CCT')
  capabilities jsonb      -- oxygen, ventilator, incubator, bariatric, wheelchair
  status ('offline' | 'available' | 'assigned' | 'busy' | 'out_of_service')
  home_base geography(Point)
```

`unit_type` is an ordered tier; `capabilities` is the unordered extras. Matching needs
both — a request may need "at least BLS" **and** "must have an incubator".

Crew is a separate shift table, not a column on the unit. A unit's capability is
actually `min(vehicle capability, crew capability)`: an ALS vehicle staffed by a
basic crew is a BLS unit for that shift. Compute effective tier at match time.

### 1.2 The request

```
transport_requests
  id, request_type ('emergency' | 'scheduled')
  patient_id, requester_id          -- often different people
  pickup_point geography, pickup_address, pickup_contact_phone
  destination_facility_id           -- nullable for scene pickups
  triage_level (1 critical .. 5 non urgent)
  required_unit_type, required_capabilities
  scheduled_for                     -- null for emergency
  status, assigned_unit_id
  clinical_summary, disposition
```

`requester_id` separate from `patient_id` is not optional. A large share of emergency
calls come from a bystander, relative, or the facility itself, and your notification
routing, permissions, and billing all differ depending on which.

### 1.3 Offers — the table people forget

```
dispatch_offers
  id, request_id, unit_id
  score, eta_seconds, rank
  offered_at, expires_at
  response ('pending'|'accepted'|'declined'|'expired'), decline_reason
```

Do not just stamp a unit onto the request. Modelling the offer explicitly gives you
the retry loop, the audit trail for "why did this take 14 minutes", provider
reliability scoring, and a clean place to enforce the accept race.

### 1.4 Events

```
transport_events
  request_id, from_status, to_status, actor_id, at, location
```

Append only. Every response time metric you will ever be asked for (call to dispatch,
dispatch to scene, scene to hospital) is a subtraction between two rows here. Do not
try to derive them from mutable columns on the request.

### 1.5 Location

Two tables, deliberately:

- `ambulance_locations` — append only ping history, high write volume, aggressive retention
- `ambulance_current_location` — one row per unit, upserted, the only thing anyone queries live

Never make the live map read from the history table.

---

## 2. State machine

```
                    ┌─────────────┐
                    │  requested  │  (emergency)
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐        ┌───────────┐
                    │  searching  │◄───────┤ scheduled │ (T minus 60 min)
                    └──────┬──────┘        └─────┬─────┘
                           │                     │ cancel
              ┌────────────┼───────────┐         ▼
              │            │           │    cancelled
     no_unit_available     │      (offer declined
                           │       → next unit)
                    ┌──────▼──────┐
                    │   matched   │  crew accepted
                    └──────┬──────┘
                           │
                ┌──────────▼───────────┐
                │ en_route_to_patient │──► provider_cancelled ──► re-dispatch
                └──────────┬───────────┘
                           │
                    ┌──────▼──────┐
                    │  on_scene   │──► completed (disposition:
                    └──────┬──────┘     treated_not_transported / refused / deceased)
                           │
                    ┌──────▼──────┐
                    │transporting │──► destination changed (diversion)
                    └──────┬──────┘
                           │
              ┌────────────▼─────────────┐
              │ arrived_at_destination  │
              └────────────┬─────────────┘
                           │  handover confirmed by receiving facility
                    ┌──────▼──────┐
                    │  completed  │
                    └─────────────┘
```

**Rules worth encoding as constraints, not comments:**

- `assigned_unit_id` must be null in `requested`, `searching`, `scheduled` (unreserved), and non null from `matched` onward.
- A unit may hold at most one request in an active status. Enforce with a partial unique index.
- `on_scene` may terminate directly to `completed` — patient refusal and treat and release are common and must not be modelled as a cancellation.
- `arrived_at_destination → completed` requires an actor from the receiving facility. The crew cannot close their own handover. This is the clinical accountability boundary and it is also where your billing clock stops.
- Backward transitions are never allowed. A diversion is an update to `destination_facility_id` while remaining in `transporting`, logged as an event — not a rollback to `on_scene`.

---

## 3. Matching and dispatch

### 3.1 Hard filters (SQL WHERE, runs first)

```
unit.status = 'available'
AND crew shift covers now + estimated_job_duration
AND effective_tier >= request.required_unit_type
AND capabilities ⊇ request.required_capabilities
AND ST_DWithin(unit.location, request.pickup_point, search_radius)
AND provider.status = 'active'
AND unit has no active assignment
```

### 3.2 Score (rank the survivors)

```
score =  0.45 × eta_score          -- normalized, road ETA not straight line
       + 0.20 × capability_fit     -- penalize over provisioning
       + 0.15 × shift_headroom
       + 0.12 × network_preference
       + 0.08 × provider_reliability
```

Notes on each:

- **eta_score** — use a routing matrix API, not haversine. In Lagos traffic the straight line distance and the drive time are barely correlated; a unit 2 km away across a bridge can be 25 minutes out while one 6 km away on the same axis is 9 minutes. Cache the matrix per grid cell for a couple of minutes to control API cost.
- **capability_fit** — an exact tier match scores highest. Sending your only CCT unit on a routine discharge transfer is how you have nothing left when the neonatal transfer calls. Over provisioning is a real cost, so price it in.
- **shift_headroom** — if remaining shift is under 1.3 × estimated job duration, penalize hard. A crew timing out mid transport is a much worse outcome than a 4 minute slower ETA.
- **network_preference** — where the destination is a Queue hospital that owns a fleet, its own units get a boost. This keeps in network revenue and matters commercially for signing hospitals. Cap the boost so it can never beat a materially better ETA on a triage 1 or 2 call: clinical need outranks commercial preference, and you should be able to point at the line of code where that is true.
- **provider_reliability** — rolling accept rate and on time rate. Decays, so a provider can recover.

**Fairness tie break:** among third party providers within a few points of each other,
prefer least recently dispatched. Without this, one provider with slightly better
average positioning takes most of the volume and the rest leave the marketplace.

### 3.3 Offer loop

| | Triage 1–2 | Triage 3–5 | Scheduled |
|---|---|---|---|
| Strategy | broadcast top 3 in parallel | sequential | sequential |
| Accept rule | first accept wins | single holder | single holder |
| TTL | 30 s | 60 s | 10 min |
| Rounds before widening radius | 1 | 2 | 3 |
| Max rounds | 3 | 3 | unlimited until T minus 30 min |

Parallel offers on critical calls trade some provider annoyance for seconds of
response time. That is the right trade at triage 1. It is the wrong trade at triage 5.

On exhaustion → `no_unit_available`. This must never be silent: page a human
dispatcher, notify the requester in plain language, and surface the local emergency
number. An app that quietly fails to find an ambulance is worse than one that never
offered.

### 3.4 The accept race

Two crews tap Accept on a broadcast offer within the same second. Resolve at the
database, never in application code:

```sql
UPDATE transport_requests
   SET status = 'matched', assigned_unit_id = $unit, matched_at = now()
 WHERE id = $request AND status = 'searching'
RETURNING id;
```

Zero rows returned means the other crew won. Show them "already covered", not an
error. Combined with the partial unique index on active assignments, a unit also
cannot be double committed across two different requests.

### 3.5 Scheduled transport is a different problem

Greedy nearest unit assignment at booking time is fine for v1 but degrades fast. Once
you have real volume, run a nightly batch that re-optimizes the next day's bookings as
a vehicle routing problem — chaining transports that share a corridor, so one unit does
three discharges along the same axis instead of three units criss crossing the city.

Structure for it now by keeping `scheduled` requests unassigned until T minus 60
minutes. If you hard assign at booking time you cannot re-optimize later without
breaking promises you already displayed to patients.

---

## 4. Destination selection

For inter facility transfers the destination is an input. For scene pickups it is a
decision, and it is where Queue has an advantage no standalone dispatch app has: you
already hold hospital capability and capacity data.

Rank candidate facilities by:

1. **Capability for the presenting condition** — hard filter. A stroke goes to a
   facility with imaging and thrombolysis, not the nearest bed.
2. **Current ED capacity / diversion status** — needs hospitals to maintain it. Treat a
   stale capacity signal (over ~60 min old) as unknown rather than as available.
3. **Drive time from scene.**
4. **Existing patient records at that facility** — continuity is a genuine clinical
   benefit and a nice differentiator.
5. **Patient or family preference**, where triage allows it.

**The crew can always override.** They have eyes on the patient and you do not. Capture
the override reason as structured data — after a few hundred overrides that field will
tell you exactly where your ranking model is wrong.

### Pre arrival handoff

The moment a destination is confirmed, push to the receiving facility: patient
identity (if known), triage level, presenting complaint, vitals, ETA, and a live
tracking link. Create a **pending encounter** record in the ED queue before the patient
physically exists there.

This is the single highest value part of the whole integration. Everything else is
logistics; this is the part that changes what happens to the patient in the first ten
minutes after arrival.

---

## 5. Real time tracking

### 5.1 Ping cadence

| Unit state | Interval |
|---|---|
| Offline / off shift | none |
| Available, idle | 30 s |
| Assigned or en route | 5 s |
| On scene | 30 s |
| Transporting | 5 s |

Battery is the constraint. A crew's phone dying mid shift is a real operational
failure, so do not run 5 s pings when idle.

### 5.2 Pipeline

```
Expo background location task
  → local buffer (survives offline + app kill)
  → batched POST every 15 s
  → Edge Function: validate, filter, insert history + upsert current
  → Supabase Realtime broadcast, filtered by request_id
  → patient app / hospital dashboard / provider dispatch console
```

Subscribers listen on a channel scoped to their request, never on the raw unit
firehose. RLS restricts `ambulance_current_location` reads to participants in an
active request involving that unit.

### 5.3 Data hygiene

- **Drift** — reject or smooth movements under 15 m, or with accuracy worse than 50 m. Without this, a parked ambulance appears to wander around the block.
- **Out of order** — accept writes ordered by device `recorded_at`, not server arrival. Reconnecting after a tunnel flushes a backlog and you want the last real position, not the last received packet.
- **Impossible jumps** — discard implied speeds over ~200 km/h; that is a GPS glitch, not a vehicle.
- **Staleness** — no ping for 90 s during an active job raises a flag on the request and alerts the dispatcher. Show the patient "last updated 2 minutes ago" rather than a confidently wrong stale dot.

### 5.4 ETA

Compute server side, on a 30 s cycle, store on the request. All three parties then see
the same number. Client computed ETAs will disagree with each other and you will spend
support hours on it.

Show ETA as a range once it exceeds 10 minutes ("12 to 18 min"). False precision on a
number that depends on Lagos traffic destroys trust the first time it is wrong.

### 5.5 Retention

Raw 5 s pings are large and mostly worthless after the job. On completion, simplify the
route to a polyline (Douglas Peucker) and store it on the request. Downsample history
to 30 s after 7 days, purge raw at 30 days. Keep the polyline and the event timestamps
indefinitely — those are your clinical and legal record.

---

## 6. Cancellation and billing

| Cancelled at | Charge |
|---|---|
| `requested` / `searching` | none |
| `matched`, before movement | none |
| `en_route_to_patient` | callout fee |
| `on_scene` | callout + on scene time |
| Provider cancels, any point | none; auto re-dispatch, reliability score decrements |

Emergency cancellations need care in the UI. Someone cancelling a triage 1 call may be
doing so because the patient died, because another vehicle arrived, or because a
relative overruled them. Ask for a reason, keep it short, never make the fee the
prominent element on that screen.

Billing splits by ownership: hospital fleet jobs settle as internal transfers or direct
patient billing through the facility; third party jobs generate a payout net of
platform commission. Same job record, different settlement path — a `provider_type`
branch at invoice generation, not a separate pipeline.

---

## 7. Permissions (RLS)

| Role | Sees |
|---|---|
| Patient / requester | own requests, assigned unit location while active |
| Crew | currently assigned job only |
| Provider dispatcher | own units, own offers, own jobs |
| Destination facility | inbound requests to that facility |
| Platform admin | all, with access logged |

Crew access ends at `completed`. There is no reason a crew member can browse past
patients, and every reason they should not.

---

## 8. Edge cases to handle explicitly

- Requester is not the patient and is not at the pickup location
- Multi patient scene (one request spawning several, sharing scene context)
- Patient refuses transport after assessment
- Unit breaks down mid job — request must survive and re-dispatch, preserving clinical notes
- Destination goes on diversion while transporting
- Duplicate calls for the same incident (fuzzy match on location + time window, prompt the dispatcher to merge)
- Pickup point in a location with no addressable street — needs a map pin drop, not just text entry
- Network dead zone at the scene: the crew app must fully function offline and sync later

---

## 9. Suggested build order

1. Schema + state machine + events, with the concurrency constraints (foundation; hardest to change later)
2. Provider and unit management portal — onboarding fleets is a prerequisite for testing anything
3. Scheduled transport end to end — lower stakes, exercises the whole pipeline
4. Location tracking and the live map
5. Emergency dispatch and the matching engine
6. Destination selection + pre arrival handoff to the ED
7. Billing, payouts, and analytics

Shipping emergency dispatch before scheduled transport is tempting because it is the
exciting part. Resist it. Scheduled transport lets you find your bugs on a Tuesday
afternoon discharge run rather than on a triage 1 call.

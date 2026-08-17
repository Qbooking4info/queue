# Pass 5 — Correctness

Unhandled rejections, swallowed errors, missing loading/error states, booking
races, stale cache after mutation.

---

## 5-A · MEDIUM — Booked slots are never reserved; nothing prevents double booking

**`mobile/lib/api.ts:321`** writes `slot_id` onto the appointment.
**`supabase/migrations/20260726000002_secure_increment_slot_booking.sql`** defines
`increment_slot_booking()`, which is what would decrement availability.

It is **never called**. The only references to it in the repo are the generated
type declarations at `web/src/types/database.ts:3718` and
`mobile/types/database.ts:3718`.

So a slot's `booked_count` never increases, `is_available` never flips, and two
patients selecting the same slot both succeed.

**Why it has not caused an incident:** the slot system is entirely dormant —
`time_slots` has **0 rows** and **0 appointments carry a `slot_id`**. Pass 6
covers the same dormancy from the money angle. Booking currently uses the
hardcoded OPD grid, where slots are not capacity-limited at all.

**What breaks in plain terms:** the moment any hospital generates a real
schedule, per-slot capacity silently does nothing. Two patients get the same
10:00 appointment with the same doctor and both are told they are confirmed.

**Concrete fix:** call `increment_slot_booking()` inside the booking transaction
and treat a false/￾null return as "slot taken", surfacing it as a validation
error rather than a success.
**Effort:** 45 min including a concurrency test.
**NOT APPLIED** — booking/money path, proposal only.

## 5-B · LOW — Daily booking limit is correctly re-checked (verified, no defect)

`mobile/screens/BookingFlowScreen.tsx:332` populates the date picker and
`:392` re-checks immediately before insert. The TOCTOU window between choosing a
date and submitting is closed. Recorded so it is not re-flagged.

---

## 5-C · LOW — `setState` after unmount in the emergency flow

**`mobile/screens/EmergencyBookingScreen.tsx:160-165`**

```
160  useEffect(() => {
162      getDependents(user.id).then(setDependentsList)
165  }, [forDependent, user])
```

No cancellation guard and no `.catch`. If the user leaves the screen before the
fetch resolves, React logs a state-update-after-unmount warning; if it rejects,
it is an unhandled rejection.

The same file already does this correctly at `:174-180` (`let cancelled = false`
… `return () => { cancelled = true }`), so this is an inconsistency rather than
an unknown pattern.

**Concrete fix:** copy the guard from `:174-180`.
**Effort:** 5 minutes. **Mechanical — applied in Pass 10.**

---

## 5-D · LOW — Two empty catch blocks

**`web/src/lib/supabase/server.ts:26`** — `} catch {}` with the comment
"Server component — middleware handles refresh". Deliberate and correct; the
cookie write genuinely cannot succeed in a server component.

**`mobile/screens/specialist/DoctorVideoCallScreen.native.tsx:173`** —
`} catch (_) {}` with no comment. A failure during video-call teardown is
swallowed with no signal at all.

**Concrete fix:** add a `console.warn` in the video-call case so a teardown
failure is diagnosable.
**Effort:** 2 minutes. **Mechanical — applied in Pass 10.**

---

## 5-E · LOW — Unhandled fetch chains in the referral modal

**`web/src/app/dashboard/specialist/ReferPatientModal.tsx:104,105,106,136`**

Four `fetch(...).then(...)` chains with no `.catch`. Each maps a non-ok response
to `null`/`[]`, so an HTTP error degrades gracefully — but a *network* rejection
is unhandled and the modal is left in its loading state indefinitely with no
error shown.

This is the same failure class already fixed once in this codebase (commit
`495630f`, "unhandled location-fetch rejections left UI stuck loading").

**Concrete fix:** `.catch(() => null)` on each, plus an error state.
**Effort:** 15 minutes.
**NOT APPLIED** — adding an error state is a UI behaviour change, not mechanical.

---

## Summary

| severity | count |
|---|---|
| MEDIUM | 1 |
| LOW | 4 (2 applied in Pass 10) |

The one that matters is 5-A. It is invisible today only because the feature it
protects has never been switched on.

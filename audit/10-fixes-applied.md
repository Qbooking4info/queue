# Pass 10 — Fixes Applied

Rule: mechanical and obviously safe only. Anything touching auth, RLS, schema or
payments is a proposal in the report, never applied.

---

## Applied (3 commits, one per fix)

| commit | fix | finding | why it is mechanical |
|---|---|---|---|
| `ab341f2` | Cancellation guard + `.catch` on the dependents fetch, `mobile/screens/EmergencyBookingScreen.tsx:160-165` | 5-C | Copies the pattern the same file already uses at `:174-180`. Identical behaviour while mounted. |
| `f8a6ab7` | `console.warn` in place of `catch (_) {}`, `mobile/screens/specialist/DoctorVideoCallScreen.native.tsx:173` | 5-D | Adds logging only. No control-flow change; teardown stays best-effort. |
| `dc2d308` | Removed 5 unused imports | 1-B subset | Imports with zero references. Compiler-verifiable. |

Verification after each: `tsc --noEmit` clean on both apps, 73 web + 32 mobile
tests passing, `next build` compiles.

---

## Pass 11 — Applied on request ("fix all", 2026-08-11)

The rules above governed the unattended pass. Everything held back as a proposal
was then explicitly authorised and applied.

| commit | finding | what changed | verification |
|---|---|---|---|
| `ab10d0e` | **2-A** CRITICAL | Hospital ownership check on `clinic-staff/reset-password`, mirroring `clinic-staff/route.ts:117`. Any hospital or clinic admin could previously reset a staff password at any *other* hospital and sign in as them. | tsc clean |
| `e337d8c` | **2-B** HIGH | `notify-staff` now requires a session and patient-or-hospital-staff ownership of the appointment, and composes the notification text server-side. It was an open API for pushing arbitrary text to a named clinician's phone. Mobile call site sends the bearer token. | tsc clean, both apps |
| `2c50830` | **6-A** HIGH | CHECK constraint on `appointments.urgency` plus a trigger pinning it against non-staff updates. Booking routine, paying the single fee and then escalating to emergency was a discount on queue priority. | applied to prod; invalid urgency rejected live |
| `441793e` | **3-B** MEDIUM | `current_doctor_ids()` resolves both doctor identity paths; appointment and vitals policies use it. 1 of 16 doctors previously matched no policy and silently saw zero rows. | applied to prod; RPC verified live |
| `441793e` | **3-A** MEDIUM | Active/verified scoping restated on doctors and hospitals so the column grants are a second layer rather than the only one. | applied to prod |
| `441793e` | **5-A / 6-B** MEDIUM | Slot capacity enforced by triggers on `appointments` rather than a call site, because there are three booking paths and the RPC is service_role-only so mobile could not call it. Claims on insert and reschedule; releases on cancel, no-show, delete, slot change. | applied to prod; **proven live** — second patient on a capacity-1 slot rejected, counter released on cancel, test rows cleaned up |
| `2a7b168` | **8-C** MEDIUM | Notification taps route to the appointment, dispatch offer or tracking screen the payload already named, including the cold-start tap. `scheme: queue` declared. | tsc + 32 tests; **device test still owed** |
| `6039f21` | **8-D** MEDIUM | `expo-network` offline detection, global banner, and "you're offline" distinguished from "no bookings". | tsc + 32 tests; **device test still owed** |
| `144b0fa` | **9-C / 9-D** MEDIUM | 8 Expo pins aligned to SDK 56; web moved to TypeScript 6 to match mobile. Web builds clean on TS 6 with no source changes. | tsc, build, lint unchanged from baseline |
| `1890db2` | **9-A / 9-B** | next 16.2.6 -> 16.3.0. The advisory range ends at 16.3.0-preview.10, so this was a minor bump, not the major the audit assumed. `npm audit` on web: 0 vulnerabilities, down from 7 high. | tsc, build |

### Still owed

- **Device test** for 8-C and 8-D. Both need a real build on a phone: a tap on a
  live push, and airplane mode. Neither can be settled from here.
- **4-A** git history rewrite — needs Ikenna's clone coordinated.
- **GitHub secret scanning** — the token returns 403.
- **Emergency directory phone numbers** — never verified against the real
  services.

---

## Deliberately NOT touched

### Auth / RLS / schema / payments — proposal only, per the rules
- **2-A** cross-tenant password reset, `clinic-staff/reset-password/route.ts:6-33`.
  The one-line fix is known and the pattern exists at `clinic-staff/route.ts:117`.
  Still not applied: it is an authorization change, and a wrong edit here widens
  the hole rather than closing it.
- **2-B** unauthenticated `notify-staff` endpoint. Requires a matching mobile
  change; a server-side-only fix would break booking notifications.
- **3-A** `USING (true)` on `doctors` / `hospitals`.
- **3-B** doctor RLS policy missing the `user_id` identity path.
- **5-A / 6-B** slot reservation via `increment_slot_booking()`.
- **6-A** client-written `urgency` driving the 2× fee.

### Not mechanical, though they look it
- **9-A** Next upgrade — framework bump, needs a regression pass.
- **9-C** TypeScript major alignment — a stricter compiler will surface new
  errors that need judgement.
- **9-D / 1-D** `npx expo install --check` — changes native dependency versions
  before an unattended build, and `expo-location` is load-bearing for crew
  tracking.
- **9-B** `npm audit fix` — alters the lockfile and therefore the build output.

### Left on purpose despite being flagged by lint
- `_prev` / `_formData`, `web/src/app/dashboard/staff/actions.ts:41-42` —
  underscore-prefixed React server-action signature. Removing them breaks the
  contract.
- Unused parameters `bookingRef`, `hospitalId`, `onClose` — positional or
  interface-mandated.
- Unused locals `urg`, `spec`, `doctorName`, `QUEUE_STATUSES` — dead, but dead
  code can mark an unfinished feature. Deleting it unattended throws away that
  signal for a cosmetic gain.
- **4-A** git history rewrite — force-push to shared history with nobody awake
  to re-clone.

---

## Branch state

All work is on `audit/2026-08-11`. `main` is untouched. Every pass committed
separately, so the branch stands alone at any point in the sequence.

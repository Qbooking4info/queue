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

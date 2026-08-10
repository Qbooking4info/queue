# Queue — Unattended Audit, 2026-08-11

**Branch:** `audit/2026-08-11` · **Base:** `a8e1ca5` · `main` untouched
**Scope:** web (Next.js App Router), mobile (Expo), supabase/migrations
**Method:** read-only against production. No migrations, no writes, no paid or
outbound-messaging calls. Every finding cites `file:line`; anything I could not
confirm is labelled HYPOTHESIS.

One file per pass: `00-inventory`, `01-build-health`, `02-authz`, `03-rls`,
`04-secrets`, `05-correctness`, `06-money`, `07-migrations`, `08-mobile`,
`09-dependencies`, `10-fixes-applied`.

---

## Do these three first

### 1. Cross-tenant staff account takeover — 10 minutes
`web/src/app/api/clinic-staff/reset-password/route.ts:6-33`
Any hospital or clinic admin can reset the password of any staff member at any
**other** hospital and sign in as them, inheriting access to that hospital's
patient records. The handler authenticates the caller and then trusts `staffId`
from the request body without comparing `hospital_id`.

The correct check already exists 100 lines away in the sibling handler,
`clinic-staff/route.ts:117`. Copy it.

Not yet exploitable — production has one hospital. It becomes exploitable the
day a second onboards, which is the entire business plan.

### 2. Unauthenticated push injection to clinical staff — 25 minutes
`web/src/app/api/appointments/notify-staff/route.ts:5-18`
No auth of any kind, uses the service-role client, and turns request-body strings
into push notifications on a named doctor's phone. Anyone on the internet can
send arbitrary text to clinical staff through your app, and write unbounded rows
into `notifications`.

### 3. Turn on GitHub secret scanning — 2 minutes
Repo is public; the feature is free and currently off. It is the control that
would have blocked the 2026-07-26 service_role key push at the moment it
happened. Nothing prevents an identical recurrence.

---

## Top 10 by impact ÷ effort

| # | severity | finding | file:line | effort |
|---|---|---|---|---|
| 1 | CRITICAL | Cross-tenant staff password reset | `api/clinic-staff/reset-password/route.ts:6-33` | 10m |
| 2 | HIGH | Unauthenticated notify-staff endpoint | `api/appointments/notify-staff/route.ts:5-18` | 25m |
| 3 | HIGH | Secret scanning / push protection off | GitHub settings | 2m |
| 4 | HIGH | 2× fee derives from client-written `urgency` | `lib/fees.ts:91` + `mobile/lib/api.ts:327,379` | 60m |
| 5 | HIGH | Dead keys still in public git history | `PROJECT_SOURCE.md` in `e6b6fa2`, `c5d7655` | 30m + coord |
| 6 | MEDIUM | Slots never reserved — double booking | `mobile/lib/api.ts:321`, `increment_slot_booking` never called | 45m |
| 7 | MEDIUM | `USING (true)` on `doctors`/`hospitals` | `20260531150000_public_tables_rls.sql:10,16` | 30m |
| 8 | MEDIUM | Doctor RLS misses the `user_id` identity path | `20260719000002_rls_fixes.sql:24-27` | 15m |
| 9 | MEDIUM | No deep-link routing for notifications | `mobile/app.json` (no `scheme`) | 45m |
| 10 | MEDIUM | No network-state awareness | mobile-wide | 3–4h |

Severity totals: **1 CRITICAL, 5 HIGH, 9 MEDIUM, 8 LOW**.

---

## What is genuinely healthy

Stated because a findings list is one-sided by construction.

- **No patient data is reachable by an unauthenticated caller.** All 52 tables
  probed with the publishable key: `users`, `appointments`,
  `patient_medical_history`, `vitals_audit_log`, `payments`,
  `transport_requests` all return zero rows.
- **Patient RLS resolves identity correctly** —
  `20260531115800_patient_booking_rls.sql:26,33` maps `auth.uid()` through
  `users.auth_id` for both SELECT and the INSERT `WITH CHECK`.
- **The payment endpoint cannot be told what to charge.**
  `api/payments/initialize/route.ts:30` accepts only an appointment id; the
  webhook re-verifies the amount independently (`webhook/route.ts:94-105`).
  Both exercised against live Paystack.
- **Credentials are in SecureStore**, with a chunking adapter for the 2 KB
  keychain limit (`mobile/lib/supabase.ts:22-50`). Nothing sensitive is in
  AsyncStorage, and no `EXPO_PUBLIC_` variable holds a secret.
- **Migration ledger is fully in sync** — 85 entries, nothing local-only or
  remote-only — and the one historical hand-applied drift was found and
  backfilled with definitions read verbatim off production.
- **Typecheck clean, 105 tests passing, build compiles.**

---

## Two methodology corrections

Recorded because in both cases my first attempt produced a **false clean**, and
an audit that misses what it was pointed at is worse than none.

1. **Pass 0** — the anon-exposure probe initially treated any JSON array as
   "readable", counting `[]` (RLS filtering to zero rows) the same as `[{...}]`
   (data exposed). It would have reported `users` and `transport_requests` as
   leaking patient data. Corrected to distinguish DATA / empty / denied.
2. **Pass 4** — the history secret scan searched for provider-prefixed shapes
   (`sk_…`, `sb_secret_…`) and reported zero hits across 252 commits. The known
   2026-07-26 leak was a *legacy JWT* and matched none of them. Re-scanning on
   the JWT header found both keys immediately.

Any future scan must match JWT shapes, and must not treat an empty array as
absence of exposure.

---

## Open questions

Decision points hit during the run, resolved with the safest assumption and
logged rather than acted on.

1. **Git history rewrite (4-A).** Purging `PROJECT_SOURCE.md` needs a force-push
   to shared history. The other contributor has a clone. *Assumed: do not
   rewrite unattended.* Both keys are already dead, so this is disclosure of the
   incident rather than live access. **Needs a human to coordinate.**
2. **Dependency upgrades (1-D, 9-A, 9-C, 9-D).** Next is in a middleware-bypass
   advisory, TypeScript majors differ between apps, 8 Expo packages are behind
   their pins. *Assumed: do not bump anything unattended* — none can be
   regression-tested without a person.
3. **Should `clinic_admin` be able to reset passwords at all?** Fixing 2-A by
   adding the tenant check preserves that ability. Restricting it to
   `hospital_admin` may be the actual intent. *Assumed: preserve current
   behaviour, add only the missing check.*
4. **Migration drift detection (7-C).** Could not confirm no untracked object
   exists in production — needs Docker (not running) or the Supabase management
   token (not retrievable). *Assumed: unproven, labelled HYPOTHESIS.*
5. **Dead locals (`urg`, `spec`, `doctorName`, `QUEUE_STATUSES`).** Removable,
   but may mark unfinished features. *Assumed: leave them.*
6. **The 362 MB APK (8-E).** Fixing it means switching to an App Bundle with ABI
   splits, which changes the distribution artifact. *Assumed: out of scope.*

---

## Applied on this branch

Three mechanical commits: `ab341f2` unmount guard, `f8a6ab7` logged teardown
failure, `dc2d308` five unused imports. Full rationale and the
deliberately-untouched list in `10-fixes-applied.md`.

Nothing touching auth, RLS, schema or payments was applied — including finding
#1, where the exact one-line fix is known. An authorization edit made unattended
and unreviewed can widen a hole as easily as close it.

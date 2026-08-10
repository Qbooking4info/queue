# Pass 3 — Row Level Security

Checked three things per table: is RLS enabled, does each policy resolve
`auth.uid()` through `users.auth_id` correctly, and can a patient role reach
staff rows or another hospital's rows. Verified live against production with the
publishable (anon) key where a read-only probe could settle the question.

---

## 3-A · MEDIUM — `doctors` and `hospitals` are protected by column grants, not by RLS

**`supabase/migrations/20260531150000_public_tables_rls.sql:10,16,22,28,34,40`**
**`supabase/migrations/20260601050000_remaining_tables_rls.sql:15,34,53`**
**`supabase/migrations/20260531160000_doctor_specialties_rls.sql:5`**

Ten policies are `FOR SELECT USING (true)` — unconditional. On `doctors` and
`hospitals` that would publish every column, including `doctors.email`,
`doctors.mdcn_number`, `hospitals.registration_number` and the Paystack payout
fields.

They do not, because `20260726000004_column_privacy_doctors_hospitals_v2.sql`
layers **column-level grants** on top, and those default-deny.

Verified live — columns added *after* that migration are correctly denied:

```
hospitals.paystack_subaccount_code   denied
hospitals.paystack_bank_name         denied
hospitals.paystack_account_last4     denied
hospitals.email                      denied
doctors.email / mdcn_number          denied
doctors.auth_user_id / user_id       denied

hospitals.opd_fee                    EXPOSED  (intentional — public directory)
hospitals.daily_booking_limit        EXPOSED  (intentional)
doctors.consultation_fee             EXPOSED  (intentional)
```

**What breaks in plain terms:** nothing today. The risk is structural: the only
thing standing between `anon` and every doctor's email address is a `GRANT`
statement in one migration. RLS — the mechanism the PRD names as the access
control — says "everyone can read everything" for these tables. Any future
`GRANT SELECT ON doctors TO anon`, a restore that replays grants differently, or
a switch to a client that selects `*`, removes the protection silently.

The migration's own comment at `:32-34` acknowledges the model and is the reason
this held. It is defence that works, resting on a single layer.

**Concrete fix:** replace `USING (true)` on `doctors` and `hospitals` with a
policy scoped to `is_active`, and keep the column grants as the second layer
rather than the only one.
**Effort:** 30 min plus regression testing of the public directory.
**NOT APPLIED** — touches RLS.

---

## 3-B · MEDIUM — One doctor cannot see their own appointments

**`supabase/migrations/20260719000002_rls_fixes.sql:24-27`**

```
24  CREATE POLICY "Doctors can read own appointments" ON appointments
25    FOR SELECT USING (
27        SELECT id FROM doctors WHERE auth_user_id = auth.uid()
```

This resolves identity through `doctors.auth_user_id` only. The codebase has two
doctor identity paths — `web/src/lib/supabase/auth-server.ts:101-107` documents
both and handles both, precisely because portal-created doctors link via
`user_id` and self-registered ones via `auth_user_id`.

Live counts:

```
total doctors                      16
auth_user_id set                   11
ONLY user_id, no auth_user_id       1   <- cannot match this policy
neither set                         4
```

**What breaks in plain terms:** the one doctor linked only via `user_id` gets
zero rows from any direct Supabase query against `appointments`. They can still
work through the service-role API routes (which handle both paths), so the
dashboard functions — but any mobile or client-side query returns an empty list
with no error. That is the silent-empty-result failure mode, which reads as "no
patients today" rather than "you are misconfigured".

**Concrete fix:** widen the policy to
`auth_user_id = auth.uid() OR user_id = (SELECT id FROM users WHERE auth_id = auth.uid())`,
matching what `auth-server.ts` already does.
**Effort:** 15 min.
**NOT APPLIED** — touches RLS.

---

## 3-C · Verified correct (recorded so the next audit skips them)

**Patient scoping resolves correctly.** `20260531115800_patient_booking_rls.sql:26,33`
uses `patient_id = (SELECT id FROM users WHERE auth_id = auth.uid())` for both
SELECT and the INSERT `WITH CHECK`. That is the correct mapping for this schema.

**A stale-column policy was already caught and fixed.** `20260719000002:36-40`
had the front-desk policy joining `clinic_admins.auth_user_id`, and
`20260726000006` later dropped that column. It does not dangle:
`20260722000005_fix_frontdesk_appointments_rls.sql:6-13` had already rewritten
it to go through `users`, and its header comment states the original was "always
NULL". Sequence is sound.

**No patient can read staff or cross-hospital rows.** All 52 tables were probed
with the publishable key (Pass 0 inventory). `users`, `appointments`,
`patient_medical_history`, `vitals_audit_log`, `payments`, `notifications` and
`transport_requests` all return zero rows. The 7 tables that do return data are
public directory content plus PostGIS `spatial_ref_sys`.

---

## Summary

| severity | count |
|---|---|
| MEDIUM | 2 |

No patient data is reachable by an unauthenticated caller. Both findings are
about resilience and completeness rather than a present leak: one table family
is protected by a single layer that is not the layer anyone would look at, and
one doctor identity path is missing from a policy that the application layer
already handles.

# Audit Findings Log

Findings discovered while working through `Queue-Remediation-Audit.md` that were either
out of scope for the current task, or corrections to what the audit assumed. Per the
audit's own ground rules, these are logged here rather than fixed inline in an unrelated
commit.

---

## 2026-07-26 — Task 3: two claims in the source documents were stale

Both `Queue-Code-Review.md` (C3) and `Queue-Remediation-Audit.md` (Task 3, Task 3d) assumed
`patient_medical_history` had no RLS and `vitals_audit_log` had RLS with zero policies.

Querying the production project directly (`supabase db query --linked`) on 2026-07-26 showed
both already have correct, narrowly-scoped policies in place:

- `patient_medical_history`: one `ALL` policy, patient reads/writes only their own row.
- `vitals_audit_log`: two `SELECT` policies — treating doctor, and front-desk staff scoped
  to their hospital via `clinic_admins`.

Neither exists as a tracked migration file — both were evidently applied directly against
the project (dashboard SQL editor) after the review was written. No further fix needed for
either table; `Queue-RLS-Policies.md` has been updated to document the current policies so
the doc doesn't regress to "undocumented" again.

**Action for repo hygiene (not done here, out of scope for Task 3):** consider backfilling a
migration file for these two policy sets so `supabase/migrations/` is the source of truth
and a `supabase db reset` / fresh environment doesn't come up without them.

## 2026-07-26 — New finding: `get_daily_booking_count` leaks per-hospital booking volume to `anon`

Not flagged in either source document. Found while running the full `SECURITY DEFINER`
function audit that Task 3a calls for.

```sql
CREATE OR REPLACE FUNCTION public.get_daily_booking_count(p_hospital_id uuid, p_date date, p_clinic_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
AS $function$
  SELECT COUNT(*)::INT FROM appointments
  WHERE hospital_id = p_hospital_id AND appointment_date = p_date AND status != 'cancelled'
    AND (p_clinic_id IS NULL OR clinic_id = p_clinic_id);
$function$
```

`proacl` on the production project shows `anon=X` (EXECUTE granted). It takes `p_hospital_id`
as a caller-supplied parameter with no ownership check, same shape as the `get_doctor_queue`
(Task 2) and `increment_slot_booking` (Task 6) bugs, but the blast radius is smaller — it
returns an aggregate count, not patient PII. Still lets anyone with the anon key (shipped in
the APK) enumerate daily booking volume per hospital/clinic, which is competitively sensitive
and enables scraping business activity across every hospital on the platform.

**Suggested fix (not applied — flagging per the "don't widen a fix" / "log unrelated problems
instead of fixing inline" ground rules):** revoke the `anon` grant; if a caller check is
needed for `authenticated`, gate it the same way as `get_doctor_queue` (caller must be staff
at `p_hospital_id` or the patient booking flow calling it pre-auth needs a narrower
justification documented).

## 2026-07-26 — Vercel exposure of `NEXT_PUBLIC_SUPABASE_SERVICE_KEY` (Task 1a) — unresolved

Local `.env.local` does not set this variable (it correctly uses `SUPABASE_SERVICE_ROLE_KEY`).
Whether it was ever set in the Vercel dashboard (Production/Preview/Development) is unknown —
user confirmed they don't know and could not check at the time of this work. This could not be
verified via the Supabase or Vercel CLI available in this environment (no `vercel` CLI linked).

**Outstanding action for the user:** check Vercel → Project → Settings → Environment Variables
across all three environments. If it was ever set, rotate the Supabase `service_role` key
(Settings → API) and check Supabase API logs for anomalous service-role usage before
concluding no access occurred, per the NDPC 72-hour reporting window noted in the review.

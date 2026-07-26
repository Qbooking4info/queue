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

## 2026-07-26 — Task 7: RLS row policies don't restrict columns; fixed doctors/hospitals, flagging the rest

While fixing Task 7, confirmed live via curl that `anon`'s public-read RLS policies on
`doctors` and `hospitals` (`is_active = true`, etc.) only restrict *rows* — Postgres RLS
cannot restrict columns, and Supabase's default schema grants give `anon` full table-level
SELECT. A `select('*')` anywhere in the client (Next.js route, or a direct PostgREST call
with just the anon key from the APK) returned `doctors.email/auth_user_id/user_id/mdcn_number`
and `hospitals.email/registration_number/mdcn_accreditation` regardless of what the app UI
displayed. Fixed both tables with `REVOKE SELECT ON <table> FROM anon` + an explicit column
`GRANT`, and fixed the matching `select('*')` call sites in `mobile/lib/api.ts` that would
otherwise break under the new column allowlist. See
`supabase/migrations/20260726000004_column_privacy_doctors_hospitals_v2.sql`.

**Not fixed here (flagging per "don't widen a fix"):** `reviews` also has a public policy
(`is_visible = true`) and its columns include `patient_id` and `appointment_id` (raw UUIDs).
Individually low sensitivity, but combined with any future IDOR it's a linkage from a public
review back to a specific patient/appointment. Other public-read tables (`hospital_clinics`,
`hospital_operating_hours`, `services`, `specialties`, `hospital_images`, `time_slots`,
`slot_overrides`, `availability_templates`, `doctor_specialties`) were spot-checked and appear
to hold only structural/scheduling data, not PII -- not re-verified column-by-column beyond
that spot check.

## 2026-07-26 — Task 8: account deletion retention model — product decision, not made here

Fixed the patient_id/auth_uid bug so appointments actually get cancelled before the auth user
is deleted (see commit f8dda4c). Left the hard-delete model itself unchanged, per explicit
user decision: "fix the bug only, keep hard delete for now." The audit's alternative --
anonymizing the `users` row instead of calling `auth.admin.deleteUser()`, to align with
Nigerian medical record retention obligations -- is still on the table as a future decision,
not implemented here.

## 2026-07-26 — Task 11: legacy hospitals.lat/lng columns don't exist

Checked `information_schema.columns` for `hospitals` directly: only `latitude`/`longitude`
exist. No `lat`/`lng` columns in the current schema, and no application code reads
`hospitals.lat`/`hospitals.lng` (the one `data.lat`/`data.lon` hit in
`web/src/app/dashboard/settings/page.tsx` is the Nominatim geocode API response shape,
unrelated to the hospitals table). Task 11 as written doesn't apply to the current schema —
nothing to migrate.

## 2026-07-26 — Task 12: hospitals.total_bookings was never populated at all, not just drifting

hospitals.avg_rating/review_count and doctors.avg_rating/review_count are already
trigger-maintained (recompute from `reviews` on every change), so the "drift" concern
there is only about a direct edit bypassing the trigger. hospitals.total_bookings, on
inspection, has no trigger and no application code that writes it -- grepped web/src and
mobile, every reference reads it, none set it. It wasn't drifting, it had never been
populated (12 of the hospital rows corrected from stale/zero to a real count the first
time `recompute_denormalised_counters()` ran, logged in `counter_reconciliation_log`).

Defined it here as "count of all appointments ever created for that hospital, any status"
-- this is an interpretation, not something the codebase specifies anywhere. If product
intent is "completed/non-cancelled bookings only," the function
(supabase/migrations/20260726000007_denormalised_counter_reconciliation.sql) needs a
status filter added to that one UPDATE.

## 2026-07-26 — Task 14: scope of the Result<T> conversion

Converted getMedicalHistory/updateMedicalHistory (the clinically-flagged example -- a blank
allergy list is not the same as "failed to load") and getPatientAppointments (identical
shape: empty array on error was indistinguishable from "no appointments," and the empty
state's "Book an appointment to get started" copy was actively misleading on a failed
fetch). Both had exactly one screen consumer each, updated to show an explicit error state.

Checked the other console.warn spots in mobile/lib/api.ts: createAppointment,
createHospitalAppointment, cancelAppointment, and rescheduleAppointment already return a
discriminated `{ ok/success, error }` shape and their callers already branch on it --
they don't have the "swallowed, looks like success/empty" problem this task is about.
Left them as-is rather than reshaping working code to match a slightly different
convention.

Did not attempt to visually verify the two UI changes (MedicalHistoryScreen error banner +
retry, AppointmentsScreen error empty-state) in a running simulator -- no Expo/RN
environment available in this session. Verified via TypeScript (`tsc --noEmit` clean) and
by reading the render logic; recommend a manual pass in Expo Go/simulator before shipping.

## 2026-07-26 — Task 15: dead code found in web/src/app/dashboard/settings/actions.ts

While migrating the settings page off admin-api.ts, found `settings/actions.ts` -- a
Next.js Server Actions file (`updateHospitalProfile`, `upsertOperatingHours`) that
duplicates part of what the new `/api/hospitals/[id]/settings` route now does, using
`getHospitalContext()` for authorization instead of `requireRole`. `settings/page.tsx`
does not import from it at all -- it's unused dead code, likely an earlier attempt
superseded by the direct admin-api.ts calls that were in the page until this migration.
Not deleted (out of scope for this task, could be intentionally kept); flagging in case
it should be removed in a cleanup pass.

## 2026-07-26 — Task 17: admin-api.ts split via Task 15; clinics/[clinicId]/page.tsx not split

admin-api.ts shrank from 1869 to 1001 lines as a side effect of the Task 15 migration
(every function moved to an API route was deleted from it, not just the data-fetching call
sites in components). Did not do the second half of Task 17 -- splitting
clinics/[clinicId]/page.tsx (still 2074 lines) into smaller components. That page's *data
access* was fully migrated (see the Task 15 clinics/[clinicId] commit), but restructuring its
JSX into sub-components is a separate, purely-presentational refactor with real risk of
prop-drilling or conditional-rendering bugs that I can't visually verify in this environment.
Left for a follow-up pass with browser testing.

## 2026-07-26 — Task 18: design token infrastructure already exists, adoption is incomplete

Checked before attempting this: a token system already exists --
`web/src/contexts/ThemeContext.tsx` (colors: `accent`, `textMuted`, `border`, etc., consumed
via `useTheme()` almost everywhere already) and `web/src/lib/typography.ts` (`T` for font
scale, `SPACE` for spacing scale). The review's "inline styles throughout" finding is really
about incomplete *adoption* of these existing tokens, not their absence -- many components
still hardcode `fontSize: 13` or `padding: '10px 14px'` instead of referencing `T.body`/
`SPACE.md`.

Did not do a mechanical sweep replacing every inline literal across every dashboard component
-- that's dozens of files, each individually low-risk but the aggregate blast radius is large
for a P4 hygiene item, and I can't visually verify the result without a running browser.
Flagging as a follow-up: audit which components already import `T`/`SPACE` vs. which still
hardcode values, and convert incrementally when next touching each file (per the review's own
suggestion), rather than as one large mechanical pass.

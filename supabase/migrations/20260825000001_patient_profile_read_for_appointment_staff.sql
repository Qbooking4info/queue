-- doctors/screens/specialist/PatientConsultScreen.tsx (and its mobile/ twin) embed
-- `patient:users!appointments_patient_id_fkey(...)` directly in a client-side query --
-- unlike get_doctor_queue, this isn't a SECURITY DEFINER RPC, so it's fully subject to
-- users' RLS. The only SELECT policies on users are "read own profile" (auth_id =
-- auth.uid()), so this join has always resolved to null for a doctor/front-desk viewer:
-- confirmed live -- a patient with full_name already set still rendered as the "?"
-- avatar / "—" name fallback, not because the data was missing, but because RLS was
-- silently dropping the joined row.
--
-- A first attempt at this policy used a plain `EXISTS (SELECT 1 FROM appointments a
-- WHERE a.patient_id = users.id)` directly in the USING clause, reasoning that it would
-- inherit appointments' own RLS for free. That caused `infinite recursion detected in
-- policy for relation "users"` for EVERY query against users, including a doctor's own
-- self-lookup on login -- appointments' own SELECT policies (appointments_hospital_select,
-- appointments_patient_select) themselves query users to resolve auth.uid(), so
-- users -> appointments -> users formed a cycle. Confirmed live (broke doctor login
-- app-wide for the few minutes it was live) and rolled back immediately.
--
-- Fixed the same way current_doctor_ids() avoids this: a SECURITY DEFINER function's
-- internal queries bypass RLS entirely (run as the function owner, not the calling
-- role), so resolving the caller's identity and checking the appointment relationship
-- inside can_view_patient_profile() never re-triggers users' policies at all.
CREATE OR REPLACE FUNCTION public.can_view_patient_profile(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.patient_id = p_patient_id
      AND (
        a.doctor_id IN (SELECT current_doctor_ids())
        OR a.assigned_doctor_id IN (SELECT current_doctor_ids())
        OR a.doctor_user_id = (SELECT u.id FROM users u WHERE u.auth_id = auth.uid())
        OR a.hospital_id IN (
          SELECT ha.hospital_id FROM hospital_admins ha
          JOIN users u ON u.id = ha.user_id
          WHERE u.auth_id = auth.uid() AND ha.is_active = true
        )
      )
  )
$$;

CREATE POLICY "Appointment staff can read patient profile" ON users
  FOR SELECT USING (can_view_patient_profile(id));

-- 1. Sign-up personal details: title (new column) plus gender/country/state, which
--    the apps now collect at registration and must be able to INSERT, not only UPDATE.
-- 2. Staff shift rota for hospitals (front desk, nurses, crew...): admins/owners plan
--    shifts in Queue Hospital; every staff member can see the rota and their own shifts.
-- 3. Ambulance status hygiene: a unit stayed 'available' forever after its shift
--    ended (all 23 production units read 'available' with zero open shifts), so fleet
--    screens showed rigs as ready that nobody was crewing. A minute cron keeps status
--    in step with shifts both ways (offline when the shift ends, available when a
--    pre-scheduled shift starts). Dispatch itself already required an open shift.

-- 1 ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS title text
  CHECK (title IS NULL OR char_length(title) <= 20);
GRANT INSERT (title, gender, country, state) ON public.users TO authenticated;
GRANT UPDATE (title) ON public.users TO authenticated;

-- 2 ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_shifts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_label  text NOT NULL DEFAULT 'Staff' CHECK (char_length(role_label) BETWEEN 1 AND 40),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz NOT NULL,
  notes       text CHECK (notes IS NULL OR char_length(notes) <= 300),
  created_by  uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '24 hours')
);
CREATE INDEX IF NOT EXISTS staff_shifts_hosp_start_idx ON public.staff_shifts (hospital_id, starts_at);
CREATE INDEX IF NOT EXISTS staff_shifts_user_start_idx ON public.staff_shifts (user_id, starts_at);

-- Can the caller plan shifts for this hospital? Owners and hospital admins only.
CREATE OR REPLACE FUNCTION public.can_manage_staff_shifts(p_hospital uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.hospital_admins ha JOIN public.users u ON u.id = ha.user_id
     WHERE u.auth_id = auth.uid() AND ha.hospital_id = p_hospital AND ha.is_active
       AND ha.role IN ('admin', 'owner')
  )
$$;

-- Every hospital the caller works at, including as ambulance crew (who are excluded
-- from my_staff_hospital_ids() because that one drives the shared message inbox).
CREATE OR REPLACE FUNCTION public.my_workplace_hospital_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ha.hospital_id FROM public.hospital_admins ha JOIN public.users u ON u.id = ha.user_id
   WHERE u.auth_id = auth.uid() AND ha.is_active
  UNION
  SELECT ca.hospital_id FROM public.clinic_admins ca JOIN public.users u ON u.id = ca.user_id
   WHERE u.auth_id = auth.uid() AND ca.is_active
$$;

ALTER TABLE public.staff_shifts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_shifts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_shifts TO authenticated;

DROP POLICY IF EXISTS staff_shifts_select ON public.staff_shifts;
CREATE POLICY staff_shifts_select ON public.staff_shifts FOR SELECT TO authenticated
  USING (hospital_id IN (SELECT public.my_workplace_hospital_ids())
         OR user_id IN (SELECT id FROM public.users WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS staff_shifts_write ON public.staff_shifts;
CREATE POLICY staff_shifts_write ON public.staff_shifts FOR ALL TO authenticated
  USING (public.can_manage_staff_shifts(hospital_id))
  WITH CHECK (
    public.can_manage_staff_shifts(hospital_id)
    -- only people who actually work at this hospital can be rostered there
    AND (EXISTS (SELECT 1 FROM public.hospital_admins ha WHERE ha.user_id = staff_shifts.user_id AND ha.hospital_id = staff_shifts.hospital_id)
      OR EXISTS (SELECT 1 FROM public.clinic_admins ca WHERE ca.user_id = staff_shifts.user_id AND ca.hospital_id = staff_shifts.hospital_id))
  );

REVOKE ALL ON FUNCTION public.can_manage_staff_shifts(uuid), public.my_workplace_hospital_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_staff_shifts(uuid), public.my_workplace_hospital_ids() TO authenticated;

-- 3 ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offline_units_without_shift()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer; m integer;
BEGIN
  -- Shift over: no longer available.
  UPDATE public.ambulances a SET status = 'offline', updated_at = now()
   WHERE a.status = 'available'
     AND NOT EXISTS (SELECT 1 FROM public.ambulance_shifts s
                      WHERE s.ambulance_id = a.id AND now() BETWEEN s.starts_at AND s.ends_at);
  GET DIAGNOSTICS n = ROW_COUNT;
  -- A shift the hospital scheduled in advance has started: available again
  -- (dispatch still needs a fresh GPS fix from the crew's phone on top of this).
  UPDATE public.ambulances a SET status = 'available', updated_at = now()
   WHERE a.status = 'offline' AND a.is_active
     AND EXISTS (SELECT 1 FROM public.ambulance_shifts s
                  WHERE s.ambulance_id = a.id AND now() BETWEEN s.starts_at AND s.ends_at);
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END;
$$;
REVOKE ALL ON FUNCTION public.offline_units_without_shift() FROM PUBLIC, anon, authenticated;

DO $$ BEGIN
  PERFORM cron.unschedule('offline-units-without-shift');
EXCEPTION WHEN others THEN NULL; END $$;
SELECT cron.schedule('offline-units-without-shift', '* * * * *', 'SELECT public.offline_units_without_shift()');

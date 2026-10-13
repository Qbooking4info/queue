-- 1. Self-service account deletion (all four apps: Profile -> Delete account).
--    Personal data is wiped and the sign-in removed; clinical history stays (with the
--    name blanked) because hospitals have a medical-records duty to keep it. Staff,
--    doctor and crew roles are deactivated so the person disappears from rosters.
-- 2. Keep doctors.avatar_url in step with users.avatar_url, so a photo a doctor sets
--    in Queue Doctor shows on their public profile in the patient app.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_auth uuid := auth.uid();
  v_user uuid;
BEGIN
  IF v_auth IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_user FROM public.users WHERE auth_id = v_auth;

  IF v_user IS NOT NULL THEN
    -- Future bookings nobody will attend.
    UPDATE public.appointments
       SET status = 'cancelled'
     WHERE patient_id = v_user
       AND status IN ('pending', 'confirmed')
       AND appointment_date >= current_date;

    UPDATE public.hospital_admins SET is_active = false WHERE user_id = v_user;
    UPDATE public.ambulance_crew  SET is_active = false WHERE user_id = v_user;
    UPDATE public.doctors         SET is_active = false, avatar_url = NULL WHERE user_id = v_user;

    UPDATE public.users SET
      full_name     = 'Deleted user',
      email         = 'deleted-' || id || '@queue.invalid',
      phone         = NULL,
      date_of_birth = NULL,
      gender        = NULL,
      address       = NULL,
      city          = NULL,
      avatar_url    = NULL,
      push_token    = NULL,
      auth_id       = NULL,
      updated_at    = now()
    WHERE id = v_user;
  END IF;

  -- Doctors created from the hospital portal can have no users row.
  UPDATE public.doctors SET is_active = false, avatar_url = NULL WHERE auth_user_id = v_auth;

  DELETE FROM auth.users WHERE id = v_auth;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- Avatar sync ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_doctor_avatar()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.avatar_url IS DISTINCT FROM OLD.avatar_url THEN
    UPDATE public.doctors SET avatar_url = NEW.avatar_url
     WHERE user_id = NEW.id OR (NEW.auth_id IS NOT NULL AND auth_user_id = NEW.auth_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_doctor_avatar ON public.users;
CREATE TRIGGER users_sync_doctor_avatar
  AFTER UPDATE OF avatar_url ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_doctor_avatar();

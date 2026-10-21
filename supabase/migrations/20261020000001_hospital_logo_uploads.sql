-- Hospital logos. The `hospitals` storage bucket already existed and is
-- public-read, but it had no policies at all on storage.objects -- which under
-- RLS means every authenticated write was denied, so nothing could ever be
-- uploaded to it. These mirror the patient avatar policies
-- (20261012000001_patient_avatars_bucket.sql), with the folder keyed by
-- hospital id rather than auth uid, since a logo belongs to the organisation
-- and not to whoever happens to upload it.
--
-- Write access is limited to an active owner/admin of that specific hospital.
-- front_desk and ambulance_crew are deliberately excluded: they act for the
-- hospital day to day but changing its public identity is not their call.

-- Make sure the bucket carries the same limits as avatars. It was created by
-- hand, so it may have neither.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hospitals', 'hospitals', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- True when the caller is an active owner/admin of the hospital whose id names
-- the first folder segment of the object path.
CREATE OR REPLACE FUNCTION public.can_manage_hospital_media(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM hospital_admins ha
    JOIN users u ON u.id = ha.user_id
    WHERE u.auth_id = auth.uid()
      AND ha.is_active
      AND ha.role IN ('owner', 'admin')
      AND ha.hospital_id::text = (storage.foldername(object_name))[1]
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_hospital_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_hospital_media(text) TO authenticated;

DROP POLICY IF EXISTS hospitals_media_insert ON storage.objects;
CREATE POLICY hospitals_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hospitals' AND public.can_manage_hospital_media(name));

DROP POLICY IF EXISTS hospitals_media_update ON storage.objects;
CREATE POLICY hospitals_media_update ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'hospitals' AND public.can_manage_hospital_media(name))
  WITH CHECK (bucket_id = 'hospitals' AND public.can_manage_hospital_media(name));

DROP POLICY IF EXISTS hospitals_media_delete ON storage.objects;
CREATE POLICY hospitals_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hospitals' AND public.can_manage_hospital_media(name));

-- Uploading the file is only half of it: the app then points hospitals.logo_url
-- at the new URL. Scoped to the two media columns via a trigger rather than the
-- policy, because a policy cannot restrict *which* columns an UPDATE touches,
-- and owners must not gain blanket write access to pricing or approval mode
-- through this route.
DROP POLICY IF EXISTS hospitals_media_update_own ON hospitals;
CREATE POLICY hospitals_media_update_own ON hospitals FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM hospital_admins ha
      JOIN users u ON u.id = ha.user_id
      WHERE u.auth_id = auth.uid()
        AND ha.is_active
        AND ha.role IN ('owner', 'admin')
        AND ha.hospital_id = hospitals.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM hospital_admins ha
      JOIN users u ON u.id = ha.user_id
      WHERE u.auth_id = auth.uid()
        AND ha.is_active
        AND ha.role IN ('owner', 'admin')
        AND ha.hospital_id = hospitals.id
    )
  );

CREATE OR REPLACE FUNCTION public.hospitals_client_update_media_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role and the API routes bypass RLS entirely and never reach this
  -- check; this only constrains a direct client-side UPDATE.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF to_jsonb(NEW) - 'logo_url' - 'cover_url' - 'updated_at'
     IS DISTINCT FROM
     to_jsonb(OLD) - 'logo_url' - 'cover_url' - 'updated_at' THEN
    RAISE EXCEPTION 'Only logo_url and cover_url can be changed from the app; use the settings API for anything else.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hospitals_client_update_media_only ON hospitals;
CREATE TRIGGER trg_hospitals_client_update_media_only
  BEFORE UPDATE ON hospitals
  FOR EACH ROW
  EXECUTE FUNCTION public.hospitals_client_update_media_only();

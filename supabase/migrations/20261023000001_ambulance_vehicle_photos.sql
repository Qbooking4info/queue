-- A photo of the actual vehicle, so a patient waiting at the roadside can tell
-- which ambulance is theirs. Shown on the unit in the operator console and on
-- the patient's tracking screen.
--
-- Mirrors the hospital-logo setup (20261020000001): a public-read bucket with
-- writes limited to the people who own the thing, and the folder keyed by the
-- row's own id rather than by whoever happens to upload it.

ALTER TABLE ambulances ADD COLUMN IF NOT EXISTS photo_url text;

COMMENT ON COLUMN ambulances.photo_url IS
  'Photo of the vehicle, shown to a patient waiting for it. Public URL in the '
  'ambulances bucket; writes gated to the provider''s owner/admin.';

-- jpeg/png/webp only, deliberately: a public bucket that serves user-uploaded
-- SVG is an XSS vector, since SVG can carry script.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('ambulances', 'ambulances', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- True when the caller runs the provider that owns the ambulance whose id names
-- the first folder segment of the object path. Covers both kinds of operator:
-- an independent one through ambulance_provider_admins, and a hospital-owned
-- fleet through that hospital's own owner/admin.
CREATE OR REPLACE FUNCTION public.can_manage_ambulance_media(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM ambulances a
    JOIN ambulance_providers p ON p.id = a.provider_id
    WHERE a.id::text = (storage.foldername(object_name))[1]
      AND (
        EXISTS (
          SELECT 1 FROM ambulance_provider_admins pa
          JOIN users u ON u.id = pa.user_id
          WHERE u.auth_id = auth.uid()
            AND pa.provider_id = p.id
            AND pa.is_active
            AND pa.role IN ('owner', 'admin')
        )
        OR EXISTS (
          SELECT 1 FROM hospital_admins ha
          JOIN users u2 ON u2.id = ha.user_id
          WHERE u2.auth_id = auth.uid()
            AND ha.hospital_id = p.hospital_id
            AND ha.is_active
            AND ha.role IN ('owner', 'admin')
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_manage_ambulance_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_manage_ambulance_media(text) TO authenticated;

DROP POLICY IF EXISTS ambulances_media_insert ON storage.objects;
CREATE POLICY ambulances_media_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'ambulances' AND public.can_manage_ambulance_media(name));

DROP POLICY IF EXISTS ambulances_media_update ON storage.objects;
CREATE POLICY ambulances_media_update ON storage.objects FOR UPDATE TO authenticated
  USING      (bucket_id = 'ambulances' AND public.can_manage_ambulance_media(name))
  WITH CHECK (bucket_id = 'ambulances' AND public.can_manage_ambulance_media(name));

DROP POLICY IF EXISTS ambulances_media_delete ON storage.objects;
CREATE POLICY ambulances_media_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'ambulances' AND public.can_manage_ambulance_media(name));

-- ── Short, memorable Doctor ID ─────────────────────────────────────────────
-- The "Doctor ID" a hospital admin types into Link Existing Doctor was the
-- raw users.id UUID (e.g. 5ecd28cf-0fc7-48ff-bbbd-23536a5a22aa) -- accurate
-- but nobody can read one aloud over the phone or type it without copy-paste.
-- Replaces it with a short, unique, human-typeable code.

ALTER TABLE users ADD COLUMN IF NOT EXISTS doctor_code text UNIQUE;

-- 32-symbol alphabet, excludes 0/O/1/I/L -- characters that are easy to
-- mistype or misread aloud. 6 symbols = 32^6 ≈ 1.07 billion combinations,
-- comfortably collision-free at this app's scale even before the retry loop.
CREATE OR REPLACE FUNCTION generate_doctor_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE doctor_code = code);
  END LOOP;
  RETURN code;
END;
$$;

-- Every user gets one, not just doctors -- "being a doctor" is only known
-- later (a doctors/doctor_profiles row existing), so there's no reliable
-- INSERT-time signal to generate it only for doctors, and an unused code on
-- a patient row costs nothing. Simpler than backfilling it lazily on first
-- doctors-app access.
CREATE OR REPLACE FUNCTION set_doctor_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.doctor_code IS NULL THEN
    NEW.doctor_code := generate_doctor_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_doctor_code ON users;
CREATE TRIGGER trg_set_doctor_code BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION set_doctor_code();

-- Backfill every existing row (created before this trigger existed).
UPDATE users SET doctor_code = generate_doctor_code() WHERE doctor_code IS NULL;

ALTER TABLE users ALTER COLUMN doctor_code SET NOT NULL;

-- anon needs to resolve a typed code back to nothing (POST /api/doctors/link
-- looks it up via the service-role client, which bypasses grants entirely) --
-- no anon/authenticated grant needed here. RLS SELECT stays exactly as it
-- was (own row via auth_id = auth.uid(), or resolved server-side elsewhere);
-- doctor_code isn't part of the self-update allowlist from 20260816000002
-- either -- it's system-generated, never client-writable.

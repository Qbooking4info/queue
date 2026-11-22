-- Patients could not check themselves in.
--
-- check_in is a staff action (requireRole on PATCH /api/appointments/[id]),
-- so the only way into the queue is a member of staff tapping a button. That
-- is correct for most hospitals -- the desk is also where identity is checked
-- and payment is taken -- and wrong for the ones that would rather a patient
-- arriving for an 09:00 slot joined the queue from the car park than stood in
-- a second queue to join the first one.
--
-- So it is a choice, and the default is no. A hospital that does nothing sees
-- no change whatsoever; one that turns it on gets self check-in subject to the
-- guards in /api/appointments/[id]/self-check-in: the booking must be the
-- caller's own, it must be for today, and the phone must actually be at the
-- hospital.

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS allow_self_check_in boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN hospitals.allow_self_check_in IS
  'Whether patients may join this hospital''s queue from their own phone on arrival. Default false: self check-in bypasses the desk, which is also where identity and payment are handled, so it is a decision each hospital makes rather than a platform default.';

-- How close "at the hospital" has to mean, in metres. A campus is bigger than
-- a doorway and a phone fix is not perfect, so this is deliberately generous;
-- it is in app_config so a hospital with an unusual site can be given a
-- different number without a deploy.
INSERT INTO app_config (key, value)
VALUES ('self_check_in_radius_m', '500')
ON CONFLICT (key) DO NOTHING;

-- Verification (read-only; run after applying)
--   select count(*) filter (where allow_self_check_in) as opted_in, count(*) from hospitals;
--   -- opted_in should be 0 immediately after applying.
--   select value from app_config where key = 'self_check_in_radius_m';   -- 500

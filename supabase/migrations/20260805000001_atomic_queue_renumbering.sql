-- ── Queue position: order by actual check-in time, assign atomically ────────
--
-- Bug this fixes: queue_position was computed in TypeScript (computeQueuePosition,
-- web/src/lib/appointment-checkin.ts) by counting other checked_in/in_progress rows
-- for the same doctor+day, then writing count+1. Two check-ins (or a check-in racing
-- an assign_doctor call) landing in overlapping requests both read the same count
-- before either write completed, so both computed position 1 -- exactly the two
-- live appointments both showing queue_position 1. There was no locking anywhere in
-- that path.
--
-- check_in_date is a DATE, not a timestamp, so it was never enough to order by
-- arrival on its own -- everyone checked in on the same day has an identical value.
-- checked_in_at (new column, this migration) captures the actual moment, and queue
-- position is now a straight ROW_NUMBER() over that, always emergency-first, always
-- recomputed atomically under an advisory lock scoped to (doctor, day) so two
-- concurrent check-ins for the same doctor can't both compute "I'm first" the way
-- the old read-then-write did.
--
-- Recomputing the *whole* queue on every relevant change (not just assigning a
-- position to the row that just joined) also fixes a second, smaller pre-existing
-- issue for free: today, when patient #1 completes, #2 stays labelled "#2" forever
-- instead of becoming "#1" -- position numbers only ever got fresher on a new
-- arrival, never on a departure. Now every checked_in/in_progress row for that
-- doctor+day gets renumbered whenever the set changes at all.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

-- Existing checked_in/in_progress rows predate this column and would sort to the
-- back (NULLS LAST below) the first time this trigger runs for their doctor+day,
-- unfairly bumping people already waiting behind anyone who checks in after this
-- migration ships. Backfill with the best available proxy for when they actually
-- checked in.
UPDATE appointments
SET checked_in_at = updated_at
WHERE status IN ('checked_in', 'in_progress')
  AND checked_in_at IS NULL;

CREATE OR REPLACE FUNCTION renumber_doctor_queue(p_hospital_id uuid, p_doctor_id uuid, p_check_in_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_avg_secs numeric;
BEGIN
  IF p_doctor_id IS NULL OR p_check_in_date IS NULL THEN
    RETURN;
  END IF;

  -- Serializes concurrent callers for the same doctor+day (check-in, assign_doctor,
  -- completion, etc. all funnel through here) so the read-then-write race that
  -- produced duplicate position 1s can't happen -- a second caller blocks here
  -- until the first's renumbering has committed, then recomputes from the
  -- now-current, already-correct state.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_doctor_id::text || ':' || p_check_in_date::text, 0));

  SELECT avg(consult_duration_secs) INTO v_avg_secs
  FROM appointments
  WHERE doctor_id = p_doctor_id AND consult_duration_secs IS NOT NULL;

  WITH ranked AS (
    SELECT a.id,
      row_number() OVER (
        ORDER BY (a.urgency = 'emergency') DESC, a.checked_in_at ASC NULLS LAST, a.created_at ASC, a.id
      ) AS rn
    FROM appointments a
    WHERE a.hospital_id = p_hospital_id
      AND a.check_in_date = p_check_in_date
      AND a.status IN ('checked_in', 'in_progress')
      AND (a.doctor_id = p_doctor_id OR a.assigned_doctor_id = p_doctor_id)
  )
  UPDATE appointments a
  SET queue_position = ranked.rn,
      estimated_wait = CASE WHEN v_avg_secs IS NULL THEN NULL ELSE round((ranked.rn - 1) * v_avg_secs / 60) END
  FROM ranked
  WHERE a.id = ranked.id
    AND (a.queue_position IS DISTINCT FROM ranked.rn OR a.estimated_wait IS DISTINCT FROM
      (CASE WHEN v_avg_secs IS NULL THEN NULL ELSE round((ranked.rn - 1) * v_avg_secs / 60) END));
END;
$$;

REVOKE ALL ON FUNCTION renumber_doctor_queue(uuid, uuid, date) FROM public, anon, authenticated;

-- Stamps the moment a row actually enters the waiting/being-seen state. Only ever
-- sets it once (COALESCE) -- if an already-checked-in row is later re-touched (e.g.
-- assign_doctor), its original arrival time must not be overwritten to "now", or
-- renumbering would send them to the back of the very queue they've been in.
CREATE OR REPLACE FUNCTION set_checked_in_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('checked_in', 'in_progress') THEN
    NEW.checked_in_at := COALESCE(NEW.checked_in_at, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_checked_in_at ON appointments;
CREATE TRIGGER set_checked_in_at
  BEFORE INSERT OR UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_checked_in_at();

-- Renumbers whichever doctor-queue(s) a row's change could have affected: its
-- current doctor_id/assigned_doctor_id, and -- on UPDATE -- its previous ones too,
-- if they changed (so the queue someone just left also closes its gap).
--
-- Scoped to `UPDATE OF status, doctor_id, assigned_doctor_id, urgency, checked_in_at`
-- deliberately: renumber_doctor_queue()'s own UPDATE only ever sets queue_position/
-- estimated_wait, neither of which is in this list, so its writes don't re-fire this
-- trigger. Without that scoping this would recurse.
CREATE OR REPLACE FUNCTION renumber_queue_after_change()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_date date := COALESCE(NEW.check_in_date, OLD.check_in_date);
BEGIN
  IF v_date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.doctor_id IS NOT NULL THEN
    PERFORM renumber_doctor_queue(NEW.hospital_id, NEW.doctor_id, v_date);
  END IF;
  IF NEW.assigned_doctor_id IS NOT NULL AND NEW.assigned_doctor_id IS DISTINCT FROM NEW.doctor_id THEN
    PERFORM renumber_doctor_queue(NEW.hospital_id, NEW.assigned_doctor_id, v_date);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.doctor_id IS NOT NULL
       AND OLD.doctor_id IS DISTINCT FROM NEW.doctor_id
       AND OLD.doctor_id IS DISTINCT FROM NEW.assigned_doctor_id THEN
      PERFORM renumber_doctor_queue(OLD.hospital_id, OLD.doctor_id, COALESCE(OLD.check_in_date, v_date));
    END IF;
    IF OLD.assigned_doctor_id IS NOT NULL
       AND OLD.assigned_doctor_id IS DISTINCT FROM NEW.doctor_id
       AND OLD.assigned_doctor_id IS DISTINCT FROM NEW.assigned_doctor_id THEN
      PERFORM renumber_doctor_queue(OLD.hospital_id, OLD.assigned_doctor_id, COALESCE(OLD.check_in_date, v_date));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS renumber_queue_after_change ON appointments;
CREATE TRIGGER renumber_queue_after_change
  AFTER INSERT OR UPDATE OF status, doctor_id, assigned_doctor_id, urgency, checked_in_at ON appointments
  FOR EACH ROW EXECUTE FUNCTION renumber_queue_after_change();

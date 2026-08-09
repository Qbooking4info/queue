-- ── Waiting time: check-in to consultation start ─────────────────────────────
-- Mirrors consult_duration_secs exactly (same GENERATED shape, same rounding --
-- confirmed empirically against live data: consult_duration_secs is
-- round(extract(epoch from (consult_ended_at - consult_started_at)))). This is
-- the other half of the same "how long did this visit actually take" picture:
-- waiting_time_secs is time in the queue (check-in to being seen),
-- consult_duration_secs is time being seen (start to end).
--
-- NULL until both checked_in_at and consult_started_at are set, same as
-- consult_duration_secs is NULL until both of its inputs are. checked_in_at only
-- exists from 20260805000001 onward (backfilled there for rows that were still
-- checked_in/in_progress at the time; completed rows before that migration have
-- no checked_in_at and so have no waiting_time_secs -- there's no reliable
-- historical check-in moment to reconstruct for those, so this metric only
-- accumulates real data going forward rather than guessing backward.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS waiting_time_secs integer
  GENERATED ALWAYS AS (
    CASE WHEN consult_started_at IS NOT NULL AND checked_in_at IS NOT NULL
      THEN round(extract(epoch FROM (consult_started_at - checked_in_at)))::integer
      ELSE NULL
    END
  ) STORED;

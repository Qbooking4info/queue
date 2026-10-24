-- Locum posts stop being offers at some point, and until now nothing said when.
--
--   locum      -- 24 hours after the shift's start date
--   full_time  -- one month after the start date
--
-- A post that gets taken closes immediately instead; that happens in
-- /api/locum/jobs/[id]/select, not here.
--
-- expires_at is generated rather than set by the app, so the deadline always
-- matches the dates actually stored and cannot drift if a post is edited.
-- 'Africa/Lagos' is written in literally: a bare date-to-timestamptz cast reads
-- the session's TimeZone, which is not immutable and so cannot be used in a
-- generated column. Nigeria has no DST, so a fixed zone is exact here.

ALTER TABLE locum_jobs ADD COLUMN IF NOT EXISTS expires_at timestamptz
  GENERATED ALWAYS AS (
    (
      (starts_on + CASE WHEN employment_type = 'full_time'
                        THEN INTERVAL '1 month'
                        ELSE INTERVAL '1 day' END)::timestamp
      AT TIME ZONE 'Africa/Lagos'
    )
  ) STORED;

COMMENT ON COLUMN locum_jobs.expires_at IS
  'When an unfilled post stops being offered: start date + 24h for a locum '
  'shift, + 1 month for a permanent post. Generated, never written by the app.';

-- The feed reads open-and-unexpired; the sweep reads open-and-expired. One
-- index serves both.
CREATE INDEX IF NOT EXISTS idx_locum_jobs_open_expiry
  ON locum_jobs (status, expires_at);

/**
 * Close every post whose deadline has passed, and tell the doctors who replied.
 *
 * Someone who accepted a shift and heard nothing is owed the same courtesy as
 * someone who lost it to another doctor -- in both cases they are holding a
 * date open for work that is not coming.
 *
 * Idempotent: it only touches rows still 'open', so a re-run after a partial
 * failure cannot notify the same doctor twice.
 */
CREATE OR REPLACE FUNCTION public.expire_locum_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closed integer := 0;
BEGIN
  WITH due AS (
    UPDATE locum_jobs
       SET status = 'expired', updated_at = now()
     WHERE status = 'open'
       AND expires_at <= now()
    RETURNING id, hospital_id, employment_type
  ),
  told AS (
    INSERT INTO notifications (user_id, type, title, body, data)
    SELECT r.doctor_user_id,
           'locum_closed',
           'Posting closed',
           COALESCE(h.name, 'The hospital')
             || ' · this '
             || CASE WHEN d.employment_type = 'full_time' THEN 'position' ELSE 'shift' END
             || ' was not filled and is no longer open.',
           jsonb_build_object('jobId', d.id, 'reason', 'expired')
      FROM due d
      JOIN locum_responses r ON r.job_id = d.id
      LEFT JOIN hospitals h ON h.id = d.hospital_id
     WHERE r.selected_at IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO closed FROM due;

  RETURN closed;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_locum_jobs() FROM PUBLIC;

-- Hourly. The deadlines are measured in days, so a post lingering for part of
-- an hour costs nothing, and the feed filters on expires_at anyway -- a job is
-- invisible the moment it is due, whatever the sweep has got to.
SELECT cron.schedule(
  'expire-locum-jobs',
  '5 * * * *',
  $cron$ SELECT public.expire_locum_jobs(); $cron$
);

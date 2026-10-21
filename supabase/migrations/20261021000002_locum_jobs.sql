-- Locum board: a doctor advertises a shift (or a permanent post) at a hospital
-- they are attached to, and doctors in that state can accept it or counter with
-- their own rate.
--
-- Money is never taken from client input twice: rate_per_hour and the two times
-- are the only figures stored, and hours and total_amount are GENERATED from
-- them. A client cannot post a rate of 5,000 and a total of 500,000.

CREATE TABLE IF NOT EXISTS locum_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  posted_by       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hospital_id     uuid NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,

  employment_type text NOT NULL DEFAULT 'locum'
                    CHECK (employment_type IN ('locum', 'full_time')),

  -- Denormalised from the hospital at post time. The board is read far more
  -- often than it is written, and a hospital that later moves must not silently
  -- re-target shifts already advertised.
  state           text NOT NULL,
  lga             text,

  starts_on       date NOT NULL,
  start_time      time,
  end_time        time,
  rate_per_hour   numeric(10,2) NOT NULL CHECK (rate_per_hour >= 0),

  -- A shift that ends before it starts has run past midnight.
  hours numeric(6,2) GENERATED ALWAYS AS (
    CASE
      WHEN start_time IS NULL OR end_time IS NULL THEN NULL
      WHEN end_time > start_time
        THEN ROUND(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0, 2)
      ELSE ROUND((86400 - EXTRACT(EPOCH FROM (start_time - end_time))) / 3600.0, 2)
    END
  ) STORED,

  total_amount numeric(12,2) GENERATED ALWAYS AS (
    CASE
      WHEN start_time IS NULL OR end_time IS NULL THEN NULL
      WHEN end_time > start_time
        THEN ROUND((EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0) * rate_per_hour, 2)
      ELSE ROUND(((86400 - EXTRACT(EPOCH FROM (start_time - end_time))) / 3600.0) * rate_per_hour, 2)
    END
  ) STORED,

  specialty_id    uuid REFERENCES specialties(id) ON DELETE SET NULL,
  notes           text,

  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'filled', 'cancelled', 'expired')),
  filled_with     uuid REFERENCES users(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_locum_jobs_state_status ON locum_jobs (state, status, starts_on);
CREATE INDEX IF NOT EXISTS idx_locum_jobs_posted_by    ON locum_jobs (posted_by, created_at DESC);

-- One response per doctor per job; changing your mind updates it rather than
-- stacking a second row (see the API's upsert on this constraint).
CREATE TABLE IF NOT EXISTS locum_responses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id         uuid NOT NULL REFERENCES locum_jobs(id) ON DELETE CASCADE,
  doctor_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  kind           text NOT NULL CHECK (kind IN ('accept', 'counter')),
  counter_rate   numeric(10,2) CHECK (counter_rate IS NULL OR counter_rate >= 0),

  -- What this doctor would actually work for: the posted rate on an accept,
  -- their own on a counter. Stored so the board can sort on it in one index
  -- rather than a CASE across two columns.
  effective_rate numeric(10,2) NOT NULL,

  message        text,
  -- Set when the poster picks this doctor. Until then the poster cannot see
  -- their phone number; see the API route.
  selected_at    timestamptz,

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT locum_responses_one_per_doctor UNIQUE (job_id, doctor_user_id),
  CONSTRAINT locum_responses_counter_needs_rate
    CHECK (kind <> 'counter' OR counter_rate IS NOT NULL)
);

-- The poster's ranking: cheapest first, earliest first among equals. An accept
-- at the posted rate therefore always outranks a counter above it, which is the
-- behaviour the board promises.
CREATE INDEX IF NOT EXISTS idx_locum_responses_rank
  ON locum_responses (job_id, effective_rate ASC, created_at ASC);

ALTER TABLE locum_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE locum_responses ENABLE ROW LEVEL SECURITY;

-- No policies: every read and write goes through the API routes on the service
-- role, which is where "is this doctor attached to that hospital", "is this
-- caller the poster" and the phone-number gate live. Enabled-with-no-policies
-- is deny-all for anon and authenticated, which is the intent.

COMMENT ON TABLE locum_jobs IS
  'Locum and permanent posts advertised by a doctor at a hospital they are '
  'attached to. Written and read only through /api/locum/*.';
COMMENT ON COLUMN locum_responses.effective_rate IS
  'The rate this doctor would work for: the job rate on an accept, counter_rate '
  'on a counter. Set server-side, never from the client.';

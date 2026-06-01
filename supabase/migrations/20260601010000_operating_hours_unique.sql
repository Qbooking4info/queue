-- Add unique constraint on (hospital_id, day_of_week) so that operating hours
-- can be safely upserted without a read-modify-write race condition.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'hospital_operating_hours_hospital_day_key'
      AND conrelid = 'hospital_operating_hours'::regclass
  ) THEN
    ALTER TABLE hospital_operating_hours
      ADD CONSTRAINT hospital_operating_hours_hospital_day_key
      UNIQUE (hospital_id, day_of_week);
  END IF;
END $$;

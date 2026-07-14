-- Add geographic coordinates to hospitals for map/GPS features
ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

-- Index for bounding-box spatial queries (nearby hospitals)
CREATE INDEX IF NOT EXISTS idx_hospitals_lat_lng ON hospitals (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Hospital type vocabulary: one axis per column.
--
-- The two clients were writing disjoint vocabularies into a free-text column:
--   web    → hospital | clinic | specialist_center | diagnostic
--   mobile → General | Specialist | Teaching | Private | Federal | State |
--            Mission | Clinic | Maternity
--
-- Nothing branched on the value — both dashboard call sites only print it — so
-- no logic breaks here. But the column was answering two different questions at
-- once: what care the facility provides, and who owns it. 'Federal' and
-- 'Teaching' are not alternatives to each other; a federal teaching hospital is
-- both. Flattening them into one list is what made the two clients disagree.
--
-- So: `type` keeps the function axis, and ownership moves to its own nullable
-- column. Mobile's ownership words are preserved rather than dropped.

ALTER TABLE hospitals
  ADD COLUMN IF NOT EXISTS ownership text;

-- Backfill. Existing rows hold either vocabulary or NULL; map both onto the
-- canonical set and lift ownership out where mobile encoded it in `type`.
-- Case-insensitive because mobile wrote Titlecase and web wrote lowercase.
UPDATE hospitals SET ownership = CASE lower(coalesce(type, ''))
  WHEN 'private' THEN 'private'
  WHEN 'federal' THEN 'federal'
  WHEN 'state'   THEN 'state'
  WHEN 'mission' THEN 'mission'
  ELSE ownership
END
WHERE ownership IS NULL;

UPDATE hospitals SET type = CASE lower(coalesce(type, ''))
  WHEN 'general'    THEN 'hospital'
  WHEN 'specialist' THEN 'specialist_center'
  WHEN 'teaching'   THEN 'teaching'
  WHEN 'clinic'     THEN 'clinic'
  WHEN 'maternity'  THEN 'maternity'
  -- Ownership words carried no function information; 'hospital' is the only
  -- safe reading, and the ownership column above keeps what they did say.
  WHEN 'private'    THEN 'hospital'
  WHEN 'federal'    THEN 'hospital'
  WHEN 'state'      THEN 'hospital'
  WHEN 'mission'    THEN 'hospital'
  -- Web's values are already canonical.
  WHEN 'hospital'          THEN 'hospital'
  WHEN 'specialist_center' THEN 'specialist_center'
  WHEN 'diagnostic'        THEN 'diagnostic'
  -- Anything unrecognised (including NULL) becomes the neutral default rather
  -- than failing the CHECK below and blocking every later migration.
  ELSE 'hospital'
END;

ALTER TABLE hospitals ALTER COLUMN type SET DEFAULT 'hospital';
ALTER TABLE hospitals ALTER COLUMN type SET NOT NULL;

-- Constrain both axes so the clients can't drift apart again. Dropped first —
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, and a re-run must not fail and
-- block the migrations queued behind it.
ALTER TABLE hospitals DROP CONSTRAINT IF EXISTS hospitals_type_check;
ALTER TABLE hospitals ADD CONSTRAINT hospitals_type_check
  CHECK (type IN ('hospital','clinic','specialist_center','diagnostic','teaching','maternity'));

ALTER TABLE hospitals DROP CONSTRAINT IF EXISTS hospitals_ownership_check;
ALTER TABLE hospitals ADD CONSTRAINT hospitals_ownership_check
  CHECK (ownership IS NULL OR ownership IN ('private','federal','state','mission','ngo'));

COMMENT ON COLUMN hospitals.type IS
  'What care the facility provides. Constrained; see hospitals_type_check.';
COMMENT ON COLUMN hospitals.ownership IS
  'Who runs the facility. Nullable — not asked of hospitals onboarded before 2026-08-28.';

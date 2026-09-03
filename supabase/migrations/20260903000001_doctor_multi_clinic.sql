-- Doctor multi-clinic assignment -- a doctor can be assigned to MULTIPLE
-- clinics within the same hospital, but is "active" in only one at a time.
--
-- doctors.clinic_id keeps meaning exactly what it means today: "this
-- doctor's CURRENTLY ACTIVE clinic". Every operational read (queue
-- visibility, appointment check-in doctor-assignment, schedule-hour
-- clamping, referral targeting) keeps reading it completely unchanged.
--
-- doctor_clinics (new, below) is the assignment POOL -- which clinics a
-- doctor may be active in at all. Management UI (a clinic's "Doctors in
-- this clinic" list, assign/unassign, the two "Set Active" actions -- one
-- admin-driven, one self-service) reads/writes this table; nothing
-- operational does.
CREATE TABLE doctor_clinics (
  id         uuid primary key default gen_random_uuid(),
  doctor_id  uuid not null references doctors(id) on delete cascade,
  clinic_id  uuid not null references hospital_clinics(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (doctor_id, clinic_id)
);

CREATE INDEX idx_doctor_clinics_clinic ON doctor_clinics (clinic_id);
CREATE INDEX idx_doctor_clinics_doctor ON doctor_clinics (doctor_id);

-- Mandatory backfill, not optional: without this, every doctor who already
-- has a single clinic today would show an EMPTY assigned-clinics pool under
-- the new model, breaking unassign/set-active for all existing data the
-- moment this ships.
INSERT INTO doctor_clinics (doctor_id, clinic_id)
SELECT id, clinic_id FROM doctors WHERE clinic_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- No GRANTs to anon/authenticated -- nothing client-side reads this table
-- directly today; every read/write is mediated by service-role API routes
-- (same trust model as every doctors.clinic_id write already has). RLS is
-- still enabled for defense-in-depth, matching every other table's own
-- convention, even though no policy is defined -- service-role bypasses it.
ALTER TABLE doctor_clinics ENABLE ROW LEVEL SECURITY;

-- Bonus/defensive, optional but cheap while already touching this exact
-- integrity model: doctors/link/route.ts's check-then-insert-or-reactivate
-- has never had a DB constraint backing its one-row-per-(user,hospital)
-- invariant. Partial index because the invariant only applies to real
-- user_id-linked rows (portal-only rows can have user_id null).
CREATE UNIQUE INDEX doctors_user_hospital_unique ON doctors (user_id, hospital_id) WHERE user_id IS NOT NULL;

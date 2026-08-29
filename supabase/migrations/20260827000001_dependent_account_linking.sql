-- ── Real-account dependent linking ──────────────────────────────────────────
-- A caretaker (parent managing a child, or an adult managing an elderly
-- parent) links to the DEPENDENT'S OWN, independently-registered account by a
-- short shareable ID -- distinct from the pre-existing `dependents` table,
-- which is just a name/DOB/relationship profile blob with no login behind it
-- (kept as-is for historical rows; no new ones can be created going forward,
-- per product decision -- every dependent now needs a real account).
--
-- appointments.patient_id for a dependent's booking is the DEPENDENT'S OWN
-- users.id (medically correct: history follows the real person, not whoever
-- booked), so check_duplicate_active_booking and check_clinic_booking_eligibility
-- need no changes -- both already resolve via patient_id when dependent_id IS
-- NULL, exactly this shape. "Caretaker always pays" is enforced in
-- application code (payments initialize/verify), not here -- see those routes.

-- ── 1. Patient ID -- mirrors doctor_code (20260821000001) exactly, kept as a
--    separate column on purpose: conceptually distinct identifiers even
--    though the generation algorithm is identical.
ALTER TABLE users ADD COLUMN IF NOT EXISTS patient_code text UNIQUE;

CREATE OR REPLACE FUNCTION generate_patient_code() RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..6 LOOP
      code := code || substr(chars, floor(random() * length(chars))::int + 1, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE patient_code = code);
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION set_patient_code() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.patient_code IS NULL THEN
    NEW.patient_code := generate_patient_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_patient_code ON users;
CREATE TRIGGER trg_set_patient_code BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION set_patient_code();

UPDATE users SET patient_code = generate_patient_code() WHERE patient_code IS NULL;

ALTER TABLE users ALTER COLUMN patient_code SET NOT NULL;

-- ── 2. dependent_links -- two real accounts linked, not a demographic blob.
CREATE TABLE dependent_links (
  id            uuid primary key default gen_random_uuid(),
  caretaker_id  uuid not null references users(id),
  dependent_id  uuid not null references users(id),
  relationship  text not null check (relationship in ('spouse','child','parent','sibling','other')),
  status        text not null default 'active' check (status in ('active','unlinked')),
  linked_at     timestamptz not null default now(),
  unlinked_at   timestamptz,
  unlinked_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  check (caretaker_id <> dependent_id)
);

-- "Can't be added again until unlinked" -- enforced at the DB level, not just
-- in application code (which also checks this, for a friendlier error).
CREATE UNIQUE INDEX dependent_links_active_dependent_idx ON dependent_links (dependent_id) WHERE status = 'active';
CREATE INDEX dependent_links_caretaker_idx ON dependent_links (caretaker_id);

ALTER TABLE dependent_links ENABLE ROW LEVEL SECURITY;

-- SELECT only -- both sides need to see the relationship exists (caretaker for
-- their dependents list, dependent for their "managed by" section). No
-- INSERT/UPDATE policy: all writes go through the service-role-backed
-- /api/dependents/link and /unlink routes, same trust model as doctor-linking
-- never being directly writable by clients -- keeps uniqueness/rate-limiting
-- logic in application code instead of RLS.
CREATE POLICY "Caretakers can read their own links" ON dependent_links
  FOR SELECT USING (caretaker_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY "Dependents can read their own links" ON dependent_links
  FOR SELECT USING (dependent_id = (SELECT id FROM users WHERE auth_id = auth.uid()));

-- ── 3. current_patient_ids() -- mirrors current_doctor_ids() exactly. Being
--    SECURITY DEFINER, its internal queries bypass RLS entirely, so calling it
--    from within a users/appointments/vitals policy can never re-trigger those
--    tables' own policies -- this is exactly what avoids the infinite-recursion
--    trap hit earlier (20260825000001's first, reverted attempt), where a
--    policy queried a table whose own policies queried back.
CREATE OR REPLACE FUNCTION current_patient_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (SELECT id FROM users WHERE auth_id = auth.uid())
  UNION
  SELECT dl.dependent_id FROM dependent_links dl
  WHERE dl.caretaker_id = (SELECT id FROM users WHERE auth_id = auth.uid())
    AND dl.status = 'active'
$$;

-- ── 3b. CRITICAL FIX, found only by testing a real insert, not by reading RLS:
--    a pre-existing trigger, fn_set_appointment_patient_id (BEFORE INSERT,
--    predates this migration), unconditionally overwrote NEW.patient_id to the
--    caller's own resolved id on every direct client insert -- this is
--    presumably why the old dependent_id column existed at all (patient_id
--    could never be anyone but the booker). Left as-is, it would have silently
--    discarded every "book for my linked dependent" attempt from
--    BookingFlowScreen.tsx/EmergencyBookingScreen.tsx, since those insert
--    directly as the patient (no service-role route in the loop) -- confirmed
--    live: a caretaker's insert with patient_id = their dependent's real id
--    came back with patient_id silently reset to the caretaker's own.
--
--    Fixed to only force patient_id back to the caller's own id when the
--    client didn't set it to something in current_patient_ids() (self or an
--    actively-linked dependent) -- preserves the original anti-spoofing intent
--    (confirmed live: still can't set patient_id to an unrelated stranger)
--    while allowing the new legitimate case. Service-role inserts (walkin,
--    refer -- auth.uid() is null there) are untouched, exactly as before.
CREATE OR REPLACE FUNCTION public.fn_set_appointment_patient_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller_id UUID;
BEGIN
  SELECT id INTO v_caller_id FROM users WHERE auth_id = auth.uid();

  IF v_caller_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.patient_id IS NULL OR NEW.patient_id NOT IN (SELECT current_patient_ids()) THEN
    NEW.patient_id := v_caller_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4. Extend appointments' patient-identity policies to cover linked
--    dependents. Applied and verified live one policy at a time (self-lookup
--    re-tested after each) rather than all at once, learned the hard way from
--    20260825000001's recursion incident.
--
--    Also fixes a pre-existing hole found while doing this: "patients_insert_own"
--    had WITH CHECK (true) -- since Postgres OR-combines multiple permissive
--    policies for the same command, this unconditionally granted every
--    authenticated user permission to insert an appointment under ANY
--    patient_id, making the real identity check in "appointments_patient_insert"
--    moot. Tightening it to the real check (now extended for dependents) closes
--    that gap as a side effect of this change, not a separate fix.
DROP POLICY IF EXISTS "patients_insert_own" ON appointments;
CREATE POLICY "patients_insert_own" ON appointments
  FOR INSERT TO authenticated
  WITH CHECK (patient_id IN (SELECT current_patient_ids()));

DROP POLICY IF EXISTS "appointments_patient_insert" ON appointments;
CREATE POLICY "appointments_patient_insert" ON appointments
  FOR INSERT
  WITH CHECK (patient_id IN (SELECT current_patient_ids()));

DROP POLICY IF EXISTS "appointments_patient_select" ON appointments;
CREATE POLICY "appointments_patient_select" ON appointments
  FOR SELECT
  USING (patient_id IN (SELECT current_patient_ids()));

DROP POLICY IF EXISTS "patients_select_own" ON appointments;
CREATE POLICY "patients_select_own" ON appointments
  FOR SELECT TO authenticated
  USING (patient_id IN (SELECT current_patient_ids()));

DROP POLICY IF EXISTS "appointments_patient_update" ON appointments;
CREATE POLICY "appointments_patient_update" ON appointments
  FOR UPDATE
  USING (patient_id IN (SELECT current_patient_ids()) AND status = ANY (ARRAY['pending'::text, 'confirmed'::text]));

DROP POLICY IF EXISTS "patients_update_own" ON appointments;
CREATE POLICY "patients_update_own" ON appointments
  FOR UPDATE TO authenticated
  USING (patient_id IN (SELECT current_patient_ids()))
  WITH CHECK (patient_id IN (SELECT current_patient_ids()));

-- ── 5. users: additive policy (existing "read own profile" policies are left
--    untouched, not replaced -- this is the exact table whose self-lookup broke
--    app-wide during 20260825000001's first attempt, so the new capability is
--    layered on rather than risking the working path).
CREATE POLICY "Caretakers can read linked dependent profile" ON users
  FOR SELECT USING (id IN (SELECT current_patient_ids()));

-- ── 6. vitals_audit_log: a caretaker can see what was recorded during a
--    dependent's visit, same as they can for their own.
DROP POLICY IF EXISTS "Patients can read own vitals" ON vitals_audit_log;
CREATE POLICY "Patients can read own vitals" ON vitals_audit_log
  FOR SELECT USING (
    appointment_id IN (
      SELECT id FROM appointments WHERE patient_id IN (SELECT current_patient_ids())
    )
  );

-- Queue — emergency fallback directory seed
--
-- RUN THIS ONLY AFTER DIALLING EACH NUMBER. Read the next paragraph first.
--
-- WHY THIS IS A SEED FILE AND NOT A MIGRATION. emergency_directory declares
-- last_verified_at and verified_by NOT NULL with no default, and its own comment
-- says: "an entry that has never been dialled is not servable". That is the one
-- control standing between a person in an emergency and a number that rings out.
-- Auto-seeding it from public listings would satisfy the column and defeat the
-- control, which is worse than the current empty table because it converts
-- "we have nothing for you" into "call this" — and being told to call a dead
-- line costs minutes nobody has.
--
-- So: dial each number, hear a human or a working IVR, then fill in your name
-- and the date and run this. Numbers below are the widely published Nigerian
-- emergency lines as a starting list, NOT a verified one.
--
-- STATUS AS OF 2026-08-28: emergency_directory has 0 rows in production, so the
-- FallbackPanel renders "No verified emergency numbers are listed for your area
-- yet." Every one of the 11 transport requests ever made ended in
-- no_unit_available, which means this panel — showing nothing — has been the
-- entire user-facing outcome of the ambulance service to date. This file is the
-- highest-value thing on the recommendations list.
--
-- Entries decay after 90 days (emergency_directory_ttl_days) and stop being
-- served. That is deliberate: re-dial and re-run rather than letting the list rot.

begin;

-- ---------------------------------------------------------------------------
-- EDIT THESE TWO LINES, then the numbers below.
-- ---------------------------------------------------------------------------
\set verifier '''REPLACE WITH YOUR NAME'''
\set verified_at '''2026-08-28'''   -- the date you actually dialled them

-- National ------------------------------------------------------------------

insert into emergency_directory
  (name, kind, phone, country, state, priority, notes, last_verified_at, verified_by)
values
  ('National Emergency Number', 'national', '112', 'Nigeria', null, 1,
   'Toll-free national emergency line, routes to state response centres.',
   :verified_at::timestamptz, :verifier),

  ('National Emergency (legacy)', 'national', '199', 'Nigeria', null, 2,
   'Older national line, still answered in some states. Verify locally.',
   :verified_at::timestamptz, :verifier);

-- Lagos ---------------------------------------------------------------------

insert into emergency_directory
  (name, kind, phone, alt_phone, country, state, city, priority, notes, last_verified_at, verified_by)
values
  ('LASEMA Emergency Response', 'state', '767', '112', 'Nigeria', 'Lagos', 'Lagos', 10,
   'Lagos State Emergency Management Agency — primary state response line.',
   :verified_at::timestamptz, :verifier),

  ('LASAMBUS (Lagos Ambulance)', 'state', '767', null, 'Nigeria', 'Lagos', 'Lagos', 11,
   'Lagos State Ambulance Service, dispatched via the LASEMA line.',
   :verified_at::timestamptz, :verifier);

-- Your own network ----------------------------------------------------------
--
-- Hospitals already in the database with a phone number on file. These are the
-- most valuable entries in the table: they are people you have a relationship
-- with, and the patient is already looking at your app. Pulled from `hospitals`
-- rather than retyped so the numbers cannot drift apart.

insert into emergency_directory
  (name, kind, phone, country, state, city, priority, notes, last_verified_at, verified_by)
select h.name || ' (A&E)',
       'hospital_ae',
       h.phone,
       'Nigeria',
       h.state,
       h.city,
       50,
       'Hospital A&E line, from the hospitals table.',
       :verified_at::timestamptz,
       :verifier
  from hospitals h
 where h.phone is not null
   and h.is_active
   -- Only hospitals that actually run an emergency service should appear on a
   -- list someone reads mid-emergency.
   and coalesce(h.emergency_hours, false)
   and not exists (
     select 1 from emergency_directory e where e.phone = h.phone
   );

commit;

-- Check what you just made servable:
--
--   select name, phone, state, priority, last_verified_at
--     from emergency_directory_public
--    order by priority;
--
-- emergency_directory_public is the view the app reads; anything missing from it
-- is either inactive or past its 90-day verification window.

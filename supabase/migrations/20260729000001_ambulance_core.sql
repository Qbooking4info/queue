-- Queue — ambulance services: core schema
--
-- Conventions matched to the existing project:
--   * text columns with CHECK constraints, not Postgres enums (as with
--     appointments.status, booking_mode, urgency)
--   * `users` is the single person table; role link tables reference it
--   * RLS resolves auth.uid() through users.auth_id
--   * hospitals keeps its existing latitude/longitude float8 columns — this
--     migration does not touch that table
--
-- PostGIS is enabled and used ONLY by the new tables below. Enabling it is
-- additive and reversible; no existing table changes shape.

create extension if not exists postgis;
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- tier helper
--
-- Care levels are ordered: PTS < BLS < ALS < CCT. Kept as a function so the
-- ordering lives in one place rather than being reimplemented in every query.
-- ---------------------------------------------------------------------------

create or replace function tier_rank(p_tier text)
returns integer
language sql
immutable
parallel safe
as $$
  select case p_tier
    when 'PTS' then 0   -- patient transport, no clinical care
    when 'BLS' then 1   -- basic life support
    when 'ALS' then 2   -- advanced life support
    when 'CCT' then 3   -- critical care transport
    else -1
  end;
$$;

-- ---------------------------------------------------------------------------
-- providers
--
-- Hospital fleets and third party operators share one table with a
-- discriminator. They differ only in settlement path and dispatch preference,
-- both of which are columns — splitting them would duplicate every matching,
-- tracking, and billing query.
-- ---------------------------------------------------------------------------

create table ambulance_providers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  provider_type     text not null check (provider_type in ('hospital_fleet', 'third_party')),
  hospital_id       uuid references hospitals(id) on delete restrict,
  service_area      geography(Polygon, 4326),
  contact_phone     text not null,
  contact_email     text,
  commission_rate   numeric(5,4) not null default 0.1500 check (commission_rate between 0 and 1),
  reliability_score numeric(4,3) not null default 0.800  check (reliability_score between 0 and 1),
  is_active         boolean not null default true,
  is_verified       boolean not null default false,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  constraint hospital_fleet_has_hospital check (
    (provider_type = 'hospital_fleet' and hospital_id is not null) or
    (provider_type = 'third_party'    and hospital_id is null)
  )
);

create index ambulance_providers_type_idx     on ambulance_providers (provider_type) where is_active;
create index ambulance_providers_hospital_idx on ambulance_providers (hospital_id) where hospital_id is not null;
create index ambulance_providers_area_idx     on ambulance_providers using gist (service_area);

-- ---------------------------------------------------------------------------
-- crew members — role link table, same pattern as hospital_admins / clinic_admins
-- ---------------------------------------------------------------------------

create table ambulance_crew (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  provider_id  uuid not null references ambulance_providers(id) on delete cascade,
  crew_role    text not null check (crew_role in ('driver','emt','paramedic','nurse','doctor','dispatcher')),
  crew_tier    text not null default 'BLS' check (tier_rank(crew_tier) >= 0),
  is_active    boolean not null default true,
  created_at   timestamptz default now(),

  unique (user_id, provider_id)
);

create index ambulance_crew_user_idx     on ambulance_crew (user_id) where is_active;
create index ambulance_crew_provider_idx on ambulance_crew (provider_id) where is_active;

-- ---------------------------------------------------------------------------
-- units
-- ---------------------------------------------------------------------------

create table ambulances (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references ambulance_providers(id) on delete cascade,
  plate_number  text not null,
  call_sign     text,
  vehicle_tier  text not null check (tier_rank(vehicle_tier) >= 0),
  capabilities  text[] not null default '{}',   -- oxygen, ventilator, incubator, bariatric, wheelchair
  status        text not null default 'offline'
                  check (status in ('offline','available','assigned','busy','out_of_service')),
  home_base     geography(Point, 4326) not null,
  is_active     boolean not null default true,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),

  unique (provider_id, plate_number)
);

create index ambulances_provider_idx on ambulances (provider_id) where is_active;
create index ambulances_status_idx   on ambulances (status) where is_active;
create index ambulances_caps_idx     on ambulances using gin (capabilities);

-- ---------------------------------------------------------------------------
-- shifts
--
-- Effective care level of a unit is least(vehicle_tier, crew_tier). An ALS
-- vehicle staffed by a basic crew is a BLS unit for that shift — modelling this
-- matters because otherwise dispatch sends units that cannot deliver the care
-- the triage level requires.
-- ---------------------------------------------------------------------------

create table ambulance_shifts (
  id            uuid primary key default gen_random_uuid(),
  ambulance_id  uuid not null references ambulances(id) on delete cascade,
  crew_tier     text not null check (tier_rank(crew_tier) >= 0),
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  created_at    timestamptz default now(),

  constraint shift_ends_after_start check (ends_at > starts_at),
  constraint no_overlapping_shifts exclude using gist (
    ambulance_id with =,
    tstzrange(starts_at, ends_at) with &&
  )
);

create index ambulance_shifts_unit_time_idx on ambulance_shifts (ambulance_id, starts_at, ends_at);

create table ambulance_shift_crew (
  shift_id       uuid not null references ambulance_shifts(id) on delete cascade,
  crew_member_id uuid not null references ambulance_crew(id) on delete restrict,
  primary key (shift_id, crew_member_id)
);

create index ambulance_shift_crew_member_idx on ambulance_shift_crew (crew_member_id);

-- ---------------------------------------------------------------------------
-- transport requests
--
-- Deliberately NOT a subtype of appointments. An appointment is booked for a
-- future slot at a known facility; a transport request is for a mobile resource
-- now, often before the destination is even decided.
--
-- The link to appointments is created on arrival, not on request — see the note
-- on the front desk queue in the accompanying integration notes.
-- ---------------------------------------------------------------------------

create table transport_requests (
  id                    uuid primary key default gen_random_uuid(),
  booking_ref           text not null unique,          -- AMB-123456, matches QUE-/WLK- convention

  request_type          text not null check (request_type in ('emergency','scheduled')),
  status                text not null check (status in (
                          'requested','scheduled','searching','matched',
                          'en_route_to_patient','on_scene','transporting',
                          'arrived_at_destination','completed',
                          'cancelled_by_requester','cancelled_by_provider','no_unit_available')),

  patient_id            uuid references users(id) on delete restrict,
  dependent_id          uuid references dependents(id) on delete restrict,
  requester_id          uuid not null references users(id) on delete restrict,
  requester_relationship text check (requester_relationship in ('self','dependent','relative','bystander','facility')),
  contact_phone         text not null,

  -- unregistered caller, mirroring appointments.walkin_patient_name/phone
  caller_patient_name   text,

  pickup_point          geography(Point, 4326) not null,
  pickup_address        text,
  pickup_notes          text,                          -- gate colour, floor, landmark

  origin_hospital_id      uuid references hospitals(id) on delete restrict,
  destination_hospital_id uuid references hospitals(id) on delete restrict,
  destination_clinic_id   uuid references hospital_clinics(id) on delete restrict,
  appointment_id          uuid references appointments(id) on delete set null,

  triage_level          smallint check (triage_level between 1 and 5),
  required_tier         text not null default 'BLS' check (tier_rank(required_tier) >= 0),
  required_capabilities text[] not null default '{}',

  symptom_description   text,
  clinical_summary      text,

  scheduled_for         timestamptz,
  assigned_unit_id      uuid references ambulances(id) on delete restrict,

  eta_seconds           integer,
  eta_updated_at        timestamptz,
  route_polyline        text,                          -- simplified, written on completion

  disposition           text check (disposition in (
                          'transported','treated_not_transported','patient_refused',
                          'no_patient_found','deceased_on_scene','cancelled')),

  payment_method        text,                          -- reuses appointments.payment_method vocabulary
  cancellation_reason   text,

  created_at            timestamptz default now(),
  matched_at            timestamptz,
  completed_at          timestamptz,
  updated_at            timestamptz default now(),

  constraint emergency_has_triage check (
    request_type <> 'emergency' or triage_level is not null
  ),
  constraint scheduled_has_time check (
    (request_type = 'scheduled' and scheduled_for is not null) or
    (request_type = 'emergency' and scheduled_for is null)
  ),
  -- a unit is attached from 'matched' onward and never before
  constraint unit_matches_status check (
    (status in ('requested','scheduled','searching','no_unit_available')
       and assigned_unit_id is null) or
    (status not in ('requested','scheduled','searching','no_unit_available')
       and assigned_unit_id is not null)
  ),
  constraint completed_has_disposition check (
    status <> 'completed' or disposition is not null
  ),
  -- either a registered patient, a dependent, or a named unregistered caller
  constraint has_a_subject check (
    patient_id is not null or dependent_id is not null or caller_patient_name is not null
  )
);

create index transport_requests_active_idx on transport_requests (status)
  where status not in ('completed','cancelled_by_requester','cancelled_by_provider','no_unit_available');
create index transport_requests_unit_idx        on transport_requests (assigned_unit_id);
create index transport_requests_patient_idx     on transport_requests (patient_id);
create index transport_requests_requester_idx   on transport_requests (requester_id);
create index transport_requests_destination_idx on transport_requests (destination_hospital_id, status);
create index transport_requests_scheduled_idx   on transport_requests (scheduled_for) where request_type = 'scheduled';
create index transport_requests_pickup_idx      on transport_requests using gist (pickup_point);

-- One active job per unit. This is also what makes the broadcast accept race
-- resolve correctly — see accept_dispatch_offer in the dispatch functions.
create unique index one_active_job_per_unit
  on transport_requests (assigned_unit_id)
  where status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination');

-- ---------------------------------------------------------------------------
-- dispatch offers
--
-- Modelled explicitly rather than stamping a unit onto the request. Without
-- this table you cannot answer "why did this take 14 minutes", cannot score
-- provider reliability, and cannot cleanly retry.
-- ---------------------------------------------------------------------------

create table dispatch_offers (
  id             uuid primary key default gen_random_uuid(),
  request_id     uuid not null references transport_requests(id) on delete cascade,
  ambulance_id   uuid not null references ambulances(id) on delete cascade,
  round          smallint not null default 1,
  rank           smallint not null,
  score          numeric(6,4) not null,
  eta_seconds    integer,
  offered_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  response       text not null default 'pending'
                   check (response in ('pending','accepted','declined','expired')),
  responded_at   timestamptz,
  decline_reason text,

  constraint offer_expires_after_offer check (expires_at > offered_at),
  unique (request_id, ambulance_id, round)
);

create index dispatch_offers_pending_idx on dispatch_offers (ambulance_id) where response = 'pending';
create index dispatch_offers_expiry_idx  on dispatch_offers (expires_at)   where response = 'pending';
create index dispatch_offers_round_idx   on dispatch_offers (request_id, round);

create unique index one_accepted_offer_per_request
  on dispatch_offers (request_id) where response = 'accepted';

-- ---------------------------------------------------------------------------
-- event log — append only. Every response time metric derives from here.
-- ---------------------------------------------------------------------------

create table transport_events (
  id           bigserial primary key,
  request_id   uuid not null references transport_requests(id) on delete cascade,
  from_status  text,
  to_status    text not null,
  actor_id     uuid references users(id) on delete set null,
  actor_role   text,
  location     geography(Point, 4326),
  note         text,
  occurred_at  timestamptz not null default now()
);

create index transport_events_request_idx on transport_events (request_id, occurred_at);

-- ---------------------------------------------------------------------------
-- location — two tables on purpose. The live map only reads the current table.
-- ---------------------------------------------------------------------------

create table ambulance_current_location (
  ambulance_id  uuid primary key references ambulances(id) on delete cascade,
  location      geography(Point, 4326) not null,
  heading       numeric(5,2),
  speed_kmh     numeric(6,2),
  accuracy_m    numeric(7,2),
  recorded_at   timestamptz not null,
  received_at   timestamptz not null default now()
);

create index ambulance_current_location_geo_idx  on ambulance_current_location using gist (location);
create index ambulance_current_location_time_idx on ambulance_current_location (recorded_at);

create table ambulance_locations (
  id            bigserial primary key,
  ambulance_id  uuid not null references ambulances(id) on delete cascade,
  request_id    uuid references transport_requests(id) on delete set null,
  location      geography(Point, 4326) not null,
  heading       numeric(5,2),
  speed_kmh     numeric(6,2),
  accuracy_m    numeric(7,2),
  recorded_at   timestamptz not null,
  received_at   timestamptz not null default now()
);

create index ambulance_locations_unit_idx    on ambulance_locations (ambulance_id, recorded_at desc);
create index ambulance_locations_request_idx on ambulance_locations (request_id, recorded_at) where request_id is not null;

-- ---------------------------------------------------------------------------
-- billing
-- ---------------------------------------------------------------------------

create table transport_rate_cards (
  id                  uuid primary key default gen_random_uuid(),
  provider_id         uuid not null references ambulance_providers(id) on delete cascade,
  unit_tier           text not null check (tier_rank(unit_tier) >= 0),
  base_fee            integer not null,          -- in naira, matching hospitals.opd_fee
  per_km              integer not null default 0,
  per_minute_on_scene integer not null default 0,
  callout_fee         integer not null default 0,
  effective_from      timestamptz not null default now(),
  effective_to        timestamptz,

  constraint rate_window_valid check (effective_to is null or effective_to > effective_from),
  constraint no_overlapping_rate_cards exclude using gist (
    provider_id with =,
    unit_tier   with =,
    tstzrange(effective_from, effective_to) with &&
  )
);

create table transport_invoices (
  id               uuid primary key default gen_random_uuid(),
  request_id       uuid not null unique references transport_requests(id) on delete restrict,
  provider_id      uuid not null references ambulance_providers(id) on delete restrict,
  distance_km      numeric(8,2),
  on_scene_minutes integer,
  base_fee         integer not null default 0,
  distance_charge  integer not null default 0,
  on_scene_charge  integer not null default 0,
  callout_fee      integer not null default 0,
  total            integer not null,
  commission       integer not null default 0,
  provider_payout  integer not null default 0,
  settlement_path  text not null check (settlement_path in ('hospital_fleet','third_party')),
  created_at       timestamptz default now()
);

create index transport_invoices_provider_idx on transport_invoices (provider_id, created_at);

-- ---------------------------------------------------------------------------
-- dispatcher alerts — a failed search must never be silent
-- ---------------------------------------------------------------------------

create table dispatcher_alerts (
  id           uuid primary key default gen_random_uuid(),
  request_id   uuid references transport_requests(id) on delete cascade,
  severity     text not null check (severity in ('low','medium','high','critical')),
  kind         text not null,
  message      text not null,
  acknowledged_by uuid references users(id) on delete set null,
  acknowledged_at timestamptz,
  created_at   timestamptz default now()
);

create index dispatcher_alerts_open_idx on dispatcher_alerts (created_at desc) where acknowledged_at is null;

-- ---------------------------------------------------------------------------
-- booking ref generator, matching QUE-/WLK- style
-- ---------------------------------------------------------------------------

create or replace function generate_transport_ref()
returns text
language sql
volatile
as $$
  select 'AMB-' || lpad((floor(random() * 900000) + 100000)::text, 6, '0');
$$;

create or replace function set_transport_booking_ref()
returns trigger
language plpgsql
as $$
begin
  if new.booking_ref is null or new.booking_ref = '' then
    new.booking_ref := generate_transport_ref();
  end if;
  return new;
end;
$$;

create trigger transport_booking_ref
  before insert on transport_requests
  for each row execute function set_transport_booking_ref();

-- ---------------------------------------------------------------------------
-- transition guard — same shape as the existing appointment_status_guard
-- ---------------------------------------------------------------------------

create or replace function enforce_transport_transition()
returns trigger
language plpgsql
as $$
declare
  allowed text[];
begin
  if new.status = old.status then
    return new;
  end if;

  allowed := case old.status
    when 'requested'              then array['searching','cancelled_by_requester']
    when 'scheduled'              then array['searching','cancelled_by_requester']
    when 'searching'              then array['matched','no_unit_available','cancelled_by_requester']
    when 'matched'                then array['en_route_to_patient','searching','cancelled_by_requester','cancelled_by_provider']
    when 'en_route_to_patient'    then array['on_scene','searching','cancelled_by_requester','cancelled_by_provider']
    when 'on_scene'               then array['transporting','completed','cancelled_by_provider']
    when 'transporting'           then array['arrived_at_destination','cancelled_by_provider']
    when 'arrived_at_destination' then array['completed']
    else array[]::text[]
  end;

  if not (new.status = any(allowed)) then
    raise exception 'invalid transport transition: % -> %', old.status, new.status
      using errcode = 'check_violation';
  end if;

  insert into transport_events (request_id, from_status, to_status)
  values (new.id, old.status, new.status);

  return new;
end;
$$;

create trigger transport_transition_guard
  before update of status on transport_requests
  for each row execute function enforce_transport_transition();

-- matched/en_route back to 'searching' is the re-dispatch path after a provider
-- cancellation or a unit breakdown. It is a fresh search on the same request,
-- not a rollback — clear assigned_unit_id in the same UPDATE.

-- ---------------------------------------------------------------------------
-- RLS
--
-- Web API routes use createAdminClient() and bypass all of this. These policies
-- protect direct anon-key access from the mobile app.
-- ---------------------------------------------------------------------------

alter table ambulance_providers         enable row level security;
alter table ambulance_crew              enable row level security;
alter table ambulances                  enable row level security;
alter table ambulance_shifts            enable row level security;
alter table ambulance_shift_crew        enable row level security;
alter table transport_requests          enable row level security;
alter table dispatch_offers             enable row level security;
alter table transport_events            enable row level security;
alter table ambulance_current_location  enable row level security;
alter table ambulance_locations         enable row level security;
alter table transport_rate_cards        enable row level security;
alter table transport_invoices          enable row level security;
alter table dispatcher_alerts           enable row level security;

-- Requester reads and creates their own requests.
create policy "Users can read own transport requests" on transport_requests
  for select using (
    requester_id = (select id from users where auth_id = auth.uid())
  );

create policy "Users can create own transport requests" on transport_requests
  for insert with check (
    requester_id = (select id from users where auth_id = auth.uid())
  );

-- Crew read the job currently assigned to their on-shift unit, and nothing
-- after it closes. There is no reason a crew member can browse past patients.
create policy "Crew can read active assigned job" on transport_requests
  for select using (
    status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')
    and assigned_unit_id in (
      select s.ambulance_id
        from ambulance_shifts s
        join ambulance_shift_crew sc on sc.shift_id = s.id
        join ambulance_crew c        on c.id = sc.crew_member_id
        join users u                 on u.id = c.user_id
       where u.auth_id = auth.uid()
         and c.is_active
         and now() between s.starts_at and s.ends_at
    )
  );

-- Receiving hospital sees inbound transports only.
create policy "Hospital staff can read inbound transports" on transport_requests
  for select using (
    destination_hospital_id in (
      select ha.hospital_id from hospital_admins ha
        join users u on u.id = ha.user_id
       where u.auth_id = auth.uid()
      union
      select ca.hospital_id from clinic_admins ca
        join users u on u.id = ca.user_id
       where u.auth_id = auth.uid()
    )
  );

-- Crew read offers addressed to their unit.
create policy "Crew can read own offers" on dispatch_offers
  for select using (
    ambulance_id in (
      select s.ambulance_id
        from ambulance_shifts s
        join ambulance_shift_crew sc on sc.shift_id = s.id
        join ambulance_crew c        on c.id = sc.crew_member_id
        join users u                 on u.id = c.user_id
       where u.auth_id = auth.uid()
         and c.is_active
         and now() between s.starts_at and s.ends_at
    )
  );

-- Live position is readable only by participants in an active job.
create policy "Participants can read live unit position" on ambulance_current_location
  for select using (
    ambulance_id in (
      select t.assigned_unit_id from transport_requests t
       where t.status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')
         and (
           t.requester_id = (select id from users where auth_id = auth.uid())
           or t.destination_hospital_id in (
                select ha.hospital_id from hospital_admins ha
                  join users u on u.id = ha.user_id where u.auth_id = auth.uid()
                union
                select ca.hospital_id from clinic_admins ca
                  join users u on u.id = ca.user_id where u.auth_id = auth.uid()
              )
         )
    )
  );

-- Public directory of verified providers.
create policy "Public can read verified providers" on ambulance_providers
  for select using (is_active and is_verified);

-- Queue — give the crew the live ETA on their own job
--
-- transport_requests.eta_seconds is now recomputed as the unit moves
-- (web/src/lib/dispatch/live-eta.ts). The patient sees it on the tracking
-- screen; the crew could not, because get_my_active_job() never returned it.
--
-- Returning it here means both sides of the same job read one number from one
-- place. Two independently-derived ETAs that disagree is exactly the kind of
-- thing that ends with a patient on the phone saying "your app says four
-- minutes" to a crew whose app says eleven.
--
-- Same body as 20260730000001, with eta_seconds and eta_updated_at appended.
-- Postgres cannot change a function's OUT columns in place, so the old one is
-- dropped first.

drop function if exists get_my_active_job();

create or replace function get_my_active_job()
returns table (
  request_id          uuid,
  booking_ref         text,
  status              text,
  assigned_unit_id    uuid,
  triage_level        smallint,
  symptom_description text,
  contact_phone       text,
  pickup_address      text,
  pickup_lat          double precision,
  pickup_lng          double precision,
  destination_hospital_id uuid,
  destination_hospital_name text,
  eta_seconds         integer,
  eta_updated_at      timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.booking_ref, r.status, r.assigned_unit_id, r.triage_level, r.symptom_description,
         r.contact_phone, r.pickup_address,
         ST_Y(r.pickup_point::geometry), ST_X(r.pickup_point::geometry),
         r.destination_hospital_id, h.name,
         r.eta_seconds, r.eta_updated_at
    from transport_requests r
    left join hospitals h on h.id = r.destination_hospital_id
   where r.status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')
     and r.assigned_unit_id in (
       select s.ambulance_id
         from ambulance_shifts s
         join ambulance_shift_crew sc on sc.shift_id = s.id
        where now() between s.starts_at and s.ends_at
          and (
            sc.crew_member_id in (
              select c.id from ambulance_crew c
               where c.user_id = (select id from users where auth_id = auth.uid()) and c.is_active
            )
            or sc.hospital_admin_id in (
              select ha.id from hospital_admins ha
               where ha.user_id = (select id from users where auth_id = auth.uid())
                 and ha.role = 'ambulance_crew' and ha.is_active
            )
          )
     )
   limit 1;
$$;

revoke all on function get_my_active_job() from public, anon;
grant execute on function get_my_active_job() to authenticated;

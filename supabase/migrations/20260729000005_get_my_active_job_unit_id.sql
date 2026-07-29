-- Add assigned_unit_id to get_my_active_job()'s output — the crew app needs it
-- to know which ambulance_id to attach location pings to.

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
  destination_hospital_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.booking_ref, r.status, r.assigned_unit_id, r.triage_level, r.symptom_description,
         r.contact_phone, r.pickup_address,
         ST_Y(r.pickup_point::geometry), ST_X(r.pickup_point::geometry),
         r.destination_hospital_id, h.name
    from transport_requests r
    left join hospitals h on h.id = r.destination_hospital_id
   where r.status in ('matched','en_route_to_patient','on_scene','transporting','arrived_at_destination')
     and r.assigned_unit_id in (
       select s.ambulance_id
         from ambulance_shifts s
         join ambulance_shift_crew sc on sc.shift_id = s.id
         join ambulance_crew c        on c.id = sc.crew_member_id
        where c.user_id = (select id from users where auth_id = auth.uid())
          and c.is_active
          and now() between s.starts_at and s.ends_at
     )
   limit 1;
$$;

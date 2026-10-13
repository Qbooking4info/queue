-- A parked ambulance went stale and dropped out of dispatch.
--
-- record_unit_location() threw away any fix within 15 m of the previous one
-- ("stationary drift") without touching ambulance_current_location.recorded_at.
-- A rig waiting at base never moves 15 m, so its last fix aged past the
-- find_candidate_units() freshness window and the unit vanished from dispatch
-- while the crew was on duty with GPS working. Found in the 2026-10-13 emulator
-- run: on duty, pings arriving every 30s, the card still said "GPS stale".
--
-- Fix: a stationary fix is still proof the unit is alive where it was. It now
-- refreshes recorded_at/received_at/accuracy on the current-location row, but
-- writes no breadcrumb to ambulance_locations, so the trail stays clean.
CREATE OR REPLACE FUNCTION public.record_unit_location(p_ambulance_id uuid, p_lat double precision, p_lng double precision, p_heading numeric, p_speed_kmh numeric, p_accuracy_m numeric, p_recorded_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_point    geography;
  v_prev     ambulance_current_location%rowtype;
  v_moved_m  double precision;
  v_secs     double precision;
  v_request  uuid;
  v_at       timestamptz;
begin
  v_point := ST_SetSRID(ST_MakePoint(p_lng, p_lat), 4326)::geography;

  -- an unusable fix is worse than no fix
  if p_accuracy_m is not null and p_accuracy_m > 50 then
    return false;
  end if;

  -- A device clock ahead of the server is never legitimate. Stored as-is it
  -- would also block every subsequent ping from the same device via the
  -- out-of-order guard below.
  v_at := least(coalesce(p_recorded_at, now()), now());

  select * into v_prev from ambulance_current_location where ambulance_id = p_ambulance_id;

  if found then
    -- out of order arrival after a reconnect: keep the newer reading
    if v_at <= v_prev.recorded_at then
      return false;
    end if;

    v_moved_m := ST_Distance(v_point, v_prev.location);
    v_secs    := extract(epoch from (v_at - v_prev.recorded_at));

    -- stationary drift
    if v_moved_m < 15 then
      update ambulance_current_location
         set recorded_at = v_at, received_at = now(),
             accuracy_m = coalesce(p_accuracy_m, accuracy_m)
       where ambulance_id = p_ambulance_id;
      return true;
    end if;

    -- physically impossible jump — a glitch, not a vehicle
    if v_secs > 0 and (v_moved_m / v_secs) * 3.6 > 200 then
      return false;
    end if;
  end if;

  select id into v_request from transport_requests
   where assigned_unit_id = p_ambulance_id
     and status in ('matched','en_route_to_patient','on_scene','transporting')
   limit 1;

  insert into ambulance_locations
    (ambulance_id, request_id, location, heading, speed_kmh, accuracy_m, recorded_at)
  values
    (p_ambulance_id, v_request, v_point, p_heading, p_speed_kmh, p_accuracy_m, v_at);

  insert into ambulance_current_location
    (ambulance_id, location, heading, speed_kmh, accuracy_m, recorded_at)
  values
    (p_ambulance_id, v_point, p_heading, p_speed_kmh, p_accuracy_m, v_at)
  on conflict (ambulance_id) do update
    set location = excluded.location, heading = excluded.heading,
        speed_kmh = excluded.speed_kmh, accuracy_m = excluded.accuracy_m,
        recorded_at = excluded.recorded_at, received_at = now();

  return true;
end;
$function$

;

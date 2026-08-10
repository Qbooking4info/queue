-- Queue — get_daily_booking_count: honour the clinic's own limit
--
-- The function takes p_clinic_id and correctly scopes the COUNT to that clinic,
-- then compares the result against the *hospital's* daily_booking_limit. So a
-- clinic that set its own cap was never actually capped by it:
--
--   hospital limit 200, clinic limit 20
--   -> clinic accepted bookings until the clinic alone hit 200
--
-- and in the other direction a small clinic inside a busy hospital was cut off
-- early. hospital_clinics.daily_booking_limit exists, the mobile Clinic type
-- reads it, and the booking flow's effectiveDailyLimit already treats the
-- clinic's value as governing — this is the one place that disagreed.
--
-- Semantics kept deliberately narrow: the clinic's limit governs when a clinic
-- is specified AND has one set; otherwise fall back to the hospital's. A clinic
-- with NULL means "no clinic-specific cap", not "unlimited".

create or replace function public.get_daily_booking_count(
  p_hospital_id uuid,
  p_date        date,
  p_clinic_id   uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  with lim as (
    select coalesce(
      case when p_clinic_id is not null
           then (select daily_booking_limit from hospital_clinics where id = p_clinic_id)
      end,
      (select daily_booking_limit from hospitals where id = p_hospital_id)
    ) as value
  ),
  used as (
    select count(*)::int as n
      from appointments
     where hospital_id = p_hospital_id
       and appointment_date = p_date
       and status <> 'cancelled'
       and (p_clinic_id is null or clinic_id = p_clinic_id)
  )
  select (select value from lim) is not null
     and (select n from used) >= (select value from lim);
$function$;

revoke all on function public.get_daily_booking_count(uuid, date, uuid) from public;
grant execute on function public.get_daily_booking_count(uuid, date, uuid) to anon, authenticated;

comment on function public.get_daily_booking_count(uuid, date, uuid) is
  'True when the day is full. A clinic-specific daily_booking_limit governs when one is set; otherwise the hospital-wide limit applies. Returns only the boolean, never the count — see 20260727000004 for why.';

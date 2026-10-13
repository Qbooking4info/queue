-- Two related "is this doctor actually available to take this patient" rules,
-- enforced where every other cross-cutting appointment invariant in this
-- schema already lives: a trigger, not scattered per-route checks. That's not
-- a style preference here -- one of the paths that needs to be closed
-- (createAppointment's raw client-side Supabase insert, used when a patient
-- picks a "preferred doctor" while booking a hospital virtual consult) has no
-- server route sitting in front of it at all. A per-route check can't reach
-- it; a trigger can, and also becomes a backstop for every path that already
-- has an app-layer check (walk-in booking, referral, assign_doctor).
--
-- 1. Hospital-linked doctor (doctor_id / assigned_doctor_id): must be
--    is_active. This is a persistent, date-independent state -- a deactivated
--    doctor is never bookable, whether the appointment is today or three
--    weeks out -- so it's safe to enforce unconditionally on every insert or
--    reassignment.
--
--    availability_status (on_duty/on_break/off_duty) is deliberately NOT
--    checked here: it's a real-time "at their desk right now" flag, and most
--    inserts that set doctor_id are for a FUTURE-dated appointment (a patient
--    picking a preferred doctor for next Tuesday). Rejecting that because the
--    doctor happens to be off-duty at the moment of booking would be wrong.
--    The on-duty half is instead enforced app-side, only at the call sites
--    where "right now" is the actual meaning: assign_doctor (check-in time,
--    already existing), walk-in booking (a patient physically present now),
--    and same-day referrals.
--
-- 2. Independent/direct booking (hospital_id null, doctor_user_id set, type
--    virtual/home_visit): the named doctor's own doctor_profiles row must
--    exist, not be paused, and currently accept that visit type. Unlike the
--    hospital-linked half, direct bookings have no scheduling lead time
--    (DirectBookingScreen offers the next 14 days but there's no shift
--    concept to reason about) and had ZERO server-side enforcement before
--    this migration -- accepts_direct_virtual/accepts_direct_home_visit only
--    ever gated which buttons the patient app rendered, never the insert
--    itself.

alter table doctor_profiles
  add column if not exists is_paused boolean not null default false;

comment on column doctor_profiles.is_paused is
  'A doctor-controlled pause on ALL direct bookings (virtual and home visit alike), independent of the accepts_direct_virtual/accepts_direct_home_visit preferences -- going on leave shouldn''t require remembering to flip two separate toggles back on later.';

create or replace function check_doctor_assignable()
returns trigger language plpgsql as $$
declare
  v_active  boolean;
  v_profile record;
begin
  if new.doctor_id is not null then
    select is_active into v_active from doctors where id = new.doctor_id;
    if v_active is not true then
      raise exception 'This doctor is not active and cannot be assigned patients' using errcode = '23514';
    end if;
  end if;

  if new.assigned_doctor_id is not null then
    select is_active into v_active from doctors where id = new.assigned_doctor_id;
    if v_active is not true then
      raise exception 'This doctor is not active and cannot be assigned patients' using errcode = '23514';
    end if;
  end if;

  if new.hospital_id is null and new.doctor_user_id is not null and new.type in ('virtual', 'home_visit') then
    select is_paused, accepts_direct_virtual, accepts_direct_home_visit
      into v_profile
      from doctor_profiles where user_id = new.doctor_user_id;

    if v_profile is null then
      raise exception 'This doctor does not accept direct bookings' using errcode = '23514';
    end if;
    if v_profile.is_paused then
      raise exception 'This doctor is not currently accepting bookings' using errcode = '23514';
    end if;
    if new.type = 'virtual' and not v_profile.accepts_direct_virtual then
      raise exception 'This doctor is not accepting virtual consultations right now' using errcode = '23514';
    end if;
    if new.type = 'home_visit' and not v_profile.accepts_direct_home_visit then
      raise exception 'This doctor is not accepting home visits right now' using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_doctor_assignable on appointments;
create trigger enforce_doctor_assignable
  before insert or update of doctor_id, assigned_doctor_id, doctor_user_id, type on appointments
  for each row execute function check_doctor_assignable();

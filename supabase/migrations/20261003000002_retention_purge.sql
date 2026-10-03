-- Queue — enforce the stated retention policy
--
-- 20261003000001 stated a retention period. Stating one and not enforcing it is the
-- same gap as claiming NDPR compliance without the mechanics: the policy says
-- operational data is discarded after 90 days, and until now nothing discarded it.
--
-- Deliberately narrow. This purges OPERATIONAL data only — the GPS trail and old
-- notifications. It does not touch appointments, vitals, diagnoses, prescriptions or
-- transport requests: those are the clinical record, kept for 7 years under the
-- treating hospital's own obligation, and the account-deletion path anonymises them
-- rather than deleting them. A retention job that quietly ate medical history would
-- be far worse than one that runs too narrow.

-- ---------------------------------------------------------------------------
-- Retention windows. Single source of truth in SQL, mirroring
-- packages/shared/lib/privacy.ts RETENTION — if one changes, change both.
-- ---------------------------------------------------------------------------
create or replace function operational_retention_days()
returns integer language sql immutable as $$ select 90 $$;

comment on function operational_retention_days() is
  'Days operational data is kept. Mirrors RETENTION.operationalDays in '
  'packages/shared/lib/privacy.ts, which is what the app shows the user.';

-- ---------------------------------------------------------------------------
-- The purge
--
-- Returns what it removed rather than nothing, so a scheduled job that silently
-- stops working is visible: a run that reports zeroes forever on a growing table is
-- a broken job, and without a return value nobody would ever find out.
-- ---------------------------------------------------------------------------
create or replace function purge_expired_operational_data()
returns table (locations_deleted integer, notifications_deleted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz := now() - (operational_retention_days() || ' days')::interval;
  v_loc    integer;
  v_notif  integer;
begin
  -- The GPS trail. ambulance_current_location (the live map's source) is a separate
  -- table holding one row per unit and is NOT touched — purging history must never
  -- blind the dispatcher's map.
  --
  -- A trail belonging to a request still in flight is kept regardless of age: an
  -- ambulance job that has somehow been open for 90 days is a bug to investigate,
  -- and deleting its evidence first would be the wrong move.
  delete from ambulance_locations al
   where al.recorded_at < v_cutoff
     and (
       al.request_id is null
       or not exists (
         select 1 from transport_requests tr
          where tr.id = al.request_id
            and tr.status not in ('completed', 'cancelled', 'no_unit_available')
       )
     );
  get diagnostics v_loc = row_count;

  -- Delivered notifications. Unread ones are spared whatever their age: an unread
  -- "no ambulance available" is the one message a patient most needs to still find,
  -- and silently deleting it would hide a failure from the person it happened to.
  delete from notifications n
   where n.created_at < v_cutoff
     and n.is_read = true;
  get diagnostics v_notif = row_count;

  return query select v_loc, v_notif;
end;
$$;

comment on function purge_expired_operational_data() is
  'Enforces the 90-day operational retention window: old GPS trail and read '
  'notifications. Never touches clinical records, the live location table, '
  'in-flight job trails, or unread notifications.';

revoke all on function purge_expired_operational_data() from public;
revoke all on function purge_expired_operational_data() from authenticated;
grant execute on function purge_expired_operational_data() to service_role;

-- ---------------------------------------------------------------------------
-- Schedule
--
-- Daily at 03:15 UTC (04:15 WAT) — outside clinic hours, and offset from the hour
-- so it does not pile onto whatever else runs on the hour. Interval-string syntax
-- is not needed here: this is a genuine cron expression, unlike the sub-minute
-- sweepers in 20260729000003 which required 'N seconds' on this pg_cron version.
-- ---------------------------------------------------------------------------
select cron.unschedule('retention-purge')
 where exists (select 1 from cron.job where jobname = 'retention-purge');

select cron.schedule(
  'retention-purge',
  '15 3 * * *',
  $$select purge_expired_operational_data();$$
);

-- Queue — ambulance services: schedule the offer/tracking sweepers.
--
-- Deferred out of 20260729000002 pending confirmation of this project's pg_cron
-- sub-minute scheduling syntax (verified: pg_cron 1.6.4, confirmed via
-- `select extversion from pg_extension where extname = 'pg_cron'`). Sub-minute
-- jobs on this version use an interval string ('N seconds'), not a 6-field cron
-- expression — the original draft's '*/10 * * * * *' would not have scheduled
-- what it looked like it was scheduling.
--
-- The offer sweeper is not optional: without it, a request whose crew ignores
-- the push notification stays stuck in 'searching' forever.

select cron.schedule('expire-offers',  '10 seconds', $$select expire_stale_offers();$$);
select cron.schedule('stale-tracking', '30 seconds', $$select flag_stale_tracking();$$);

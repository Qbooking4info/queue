-- Queue — notifications: clients may only insert notifications addressed to themselves
--
-- 2026-10-13 audit H2. "service_insert_notifications" was FOR INSERT TO anon,
-- authenticated WITH CHECK (true): anyone holding the publishable key could write a
-- notification to ANY user — including a forged "Ambulance on the way", or a
-- `show_emergency_fallback` payload the patient app keys its emergency UI on.
--
-- The name says "service", but the service role bypasses RLS and never needed it.
-- The only client writer is addNotification() in packages/shared/lib/api.ts, which
-- the patient app uses to drop its own "booking confirmed" entry into its own inbox
-- (always user_id = the signed-in user). It now uses the authenticated client, so
-- that is the one case kept. Older installed builds sent it with the anon client;
-- for them that self-notification is no longer written (the booking itself is
-- unaffected — the insert's result was never checked).

drop policy if exists "service_insert_notifications" on notifications;
drop policy if exists "notifications_insert_own" on notifications;

create policy "notifications_insert_own" on notifications
  for insert to authenticated
  with check (user_id = (select id from users where auth_id = auth.uid()));

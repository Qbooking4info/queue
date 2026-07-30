-- Queue — accept_dispatch_offer: re-check unit availability at accept time
--
-- find_candidate_units() only ever offers a unit whose `ambulances.status` is
-- 'available', but nothing re-verified that when the offer was *accepted*, and
-- an offer holds no reservation on the unit. That leaves a window:
--
--   1. Request R1 offers unit U       (U available)
--   2. Request R2 also offers unit U  (U still available — R1's offer is only
--                                      an offer, so U is still a candidate)
--   3. Crew accepts R1  -> R1 matched, U.status = 'assigned'
--   4. Crew accepts R2 — R2's offer is still 'pending' and unexpired, and R2's
--      status is still 'searching', so the guard on transport_requests passes.
--      R2 is matched to U as well, and U is silently re-pointed at R2.
--
-- Both requests now believe the same ambulance is covering them, while the crew
-- is physically en route to only one of the two patients. The second request
-- looks covered on every dashboard, so it never re-dispatches and never raises
-- a no_unit_available alert — it just quietly never gets an ambulance.
--
-- The fix locks the ambulance row and re-checks its status before matching.
-- Losing here is the same normal outcome as losing the broadcast race: the
-- offer is marked expired and the caller gets false ("already covered"), which
-- /api/transport/offers/respond already handles.
--
-- Lock order is offer row -> ambulance row -> transport_request row, taken in
-- that order by every caller, so this introduces no deadlock cycle.

create or replace function accept_dispatch_offer(
  p_offer_id uuid,
  p_auth_id  uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request_id  uuid;
  v_unit_id     uuid;
  v_user_id     uuid;
  v_unit_status text;
  v_updated     integer;
begin
  select id into v_user_id from users where auth_id = p_auth_id;

  select o.request_id, o.ambulance_id
    into v_request_id, v_unit_id
    from dispatch_offers o
   where o.id = p_offer_id
     and o.response = 'pending'
     and o.expires_at > now()
     for update;

  if not found then
    return false;
  end if;

  -- Re-check the unit is still free, holding the row so the status cannot
  -- change between this check and the assignment below.
  select status into v_unit_status
    from ambulances
   where id = v_unit_id
     for update;

  if v_unit_status is distinct from 'available' then
    update dispatch_offers set response = 'expired', responded_at = now()
     where id = p_offer_id;
    return false;
  end if;

  -- The guard is `status = 'searching'`. Concurrent callers serialize on the
  -- row and only the first one sees 'searching'.
  update transport_requests
     set status = 'matched', assigned_unit_id = v_unit_id, matched_at = now(), updated_at = now()
   where id = v_request_id and status = 'searching';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    update dispatch_offers set response = 'expired', responded_at = now()
     where id = p_offer_id;
    return false;
  end if;

  update dispatch_offers set response = 'accepted', responded_at = now()
   where id = p_offer_id;

  -- withdraw sibling offers from this broadcast round
  update dispatch_offers set response = 'expired', responded_at = now()
   where request_id = v_request_id and id <> p_offer_id and response = 'pending';

  update ambulances set status = 'assigned', updated_at = now() where id = v_unit_id;

  update transport_events
     set actor_id = v_user_id, actor_role = 'crew'
   where request_id = v_request_id
     and to_status = 'matched'
     and actor_id is null;

  return true;
end;
$$;

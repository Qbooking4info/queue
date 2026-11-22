# Repair campaign — status

**Last updated:** 2026-10-31 00:45 WAT · **Overall:** in progress · **Current batch:** 2 (critical security + safety) — code done, awaiting approval to apply migrations and deploy.

## RESUME HERE

**2026-11-10 — queue review.** Numbering engine reviewed end to end and found sound:
`renumber_doctor_queue()` renumbers the whole set with `row_number()` (contiguous, no gaps or
duplicates, departures close up), serialised by `pg_advisory_xact_lock` per (doctor, date);
emergencies tier first; `in_progress` is pinned. Three findings, all handled:

- **Fixed:** an OPD patient checks in with no doctor (that is the model), so `queue_position`
  stays null and every queue screen sorted null as `Infinity` — putting whoever arrived *first*
  at the bottom of the front desk's list, below people who had not turned up. New shared
  `packages/shared/lib/queueOrder.ts` (3 bands: numbered / arrived / not yet here), used by the
  front desk and both doctor screens; `web/src/app/api/appointments/queue/route.ts` carries its
  own copy (web is outside the workspace). `checked_in_at` added to the front-desk fetch.
- **Fixed before applying:** `move_appointment_in_queue()` kept its own copy of the ordering key
  and was left on `checked_in_at` by migration `20261031000001`, which had changed
  `renumber_doctor_queue()` to `COALESCE(requeued_at, checked_in_at)`. The two would have
  disagreed about queue order for any patient back from the lab. Both now share the key.
- **Confirmed, user decision 2026-11-10:** patient self-move stays **later-only** (a patient may
  give up their place, never take one); staff may move either way. Now pinned by 13 tests in
  `web/src/app/api/appointments/[id]/queue-position/route.test.ts`. OPD numbering stays
  staff-assigned — only the sort was wrong, and that is fixed.

Green: web vitest 198/198, shared jest 68/68, all typechecks clean, eslint 356 (unchanged).


**2026-11-08 — booking flow: five pages to three.** `apps/client/screens/BookingFlowScreen.tsx`.
Nothing removed; the consultation-type page became a segmented toggle on the hospital page, and
"about your visit" merged with "pick a time" (the clinic you choose is what decides which slots
exist, so they were never two decisions). `STEP_DETAILS`/`STEP_SCHEDULE` are now both `STEP_VISIT`,
so every existing guard and effect still reads clearly. `canAdvance()` enforces both halves, and a
new `blockingReason()` names the first missing field under the CTA so a merged page cannot read as
a dead end. Progress bar now matches the pages one for one. Typechecks + 185 web / 60 shared tests
green. **Not device-tested** — needs a Metro restart (CI=1 disables watch) and a run through the
flow, including the HospitalProfile and reschedule entry points.


**2026-10-31 — Tier 0 of the product research report (REP-120..123 in `ISSUES.md`).**
Code is done and green; the database half is written and **not applied**.

- Shipped in code: SMS fallback behind the two unmissable queue notifications (inert until
  `PATIENT_SMS_URL` is set); honest `sent_via`; `aheadOfYou`/`emergenciesAhead`/`asOf` on the
  queue-position route; hours-and-minutes wait copy and a staleness stamp on the patient card;
  `leave_queue`/`return_to_queue` API actions.
- **Awaiting approval:** `supabase/migrations/20261031000001_queue_fairness_and_wait_estimate.sql`
  (lab-return ordering key, `return_to_queue()` RPC, consult median over finished consults only,
  wait median conditioned on weekday x hour). Parsed with libpg_query; executed nowhere.
  Until it is applied, the lab-return ordering defect is still live in production.
- **Open decision for the user:** `app_config.lab_return_credit_minutes` (default 30) is a product
  choice, not a research finding.
- Green at 00:45: web vitest 185/185, shared jest 60/60, all four app typechecks + web tsc clean,
  web build OK. `npx eslint` 356 errors (was 359 before this batch; the gap to the 329 baseline of
  2026-10-13 comes from the uncommitted 27-28 Oct work, not from this one).


0. **Another Claude session is working in this same checkout.** At 15:13–15:19 WAT it switched the branch
   from `main` to `fix/audit-2026-10-13` and committed d7f65fd, 688540e, f7a5179; it also has untracked
   `packages/shared/lib/fresh-location.ts`. This campaign's batch 2 is **uncommitted** in the same tree.
   Coordinate with the user before committing, switching branches or stashing — either session could sweep up
   or clobber the other's work.

1. Read this file, then `PROGRESS.json`, `ISSUES.md` (statuses), `TEST_MATRIX.md`; run `git status` — batch 2 is **uncommitted** in the working tree.
2. **Production DB access granted** (`.claude/settings.local.json` allows `supabase db query`; user-approved 2026-10-13 for read-only checks + rolled-back tests; real changes still need an explicit "apply").
   Prod state verified ~16:00 WAT: `20261013100002` is LIVE (applied by the concurrent session, commit c10c18b) and independently re-verified; the dispatch-function revokes (000007) are LIVE.
   **2026-10-13 ~16:05 WAT: `20261013100001` and `20261013300001` were applied to production by the concurrent audit session** (this session's own apply was blocked by the safety classifier) and recorded them with `migration repair`. Verified 16:07: structural checks 13/13; rolled-back behaviour tests 18/19 (the single FAIL is the test's own fixture token; real stored host tokens = 0).
   **16:15–16:35:** the concurrent session had already committed all batch-2 code (fa42aeb…a251beb). Clean worktree of a251beb at `<scratchpad>/deploy` passed vitest 140/140 + build, but **`vercel --prod` was denied** by the safety classifier → user runs it. Realtime under the new column grants verified with the e2e TEST patient. RLS/Schema docs updated.
   **16:40–17:10 (batch 3):** REP-044/045/051 fixed in code; a sweep of all 73 prod write policies found REP-058..062 (prod-only policies: hospitals writable by any staff incl. payout account, staff self-promotion to owner, takeover via editable profile email + dependent switch). Code fixes committed; four migrations `20261013300002..300005` written and dry-run against prod (before = exploit works, after = blocked). **Awaiting the user to apply them** (agent apply is blocked by the classifier).
   **Blocked on the user** (do not do without explicit approval):
   - deploy web to Vercel (needs `vercel login` by the queue-web owner);
   - commit / open a PR. Before committing: update `Queue-RLS-Policies.md` / `Queue-Database-Schema.md` for the two migrations (CONTRIBUTING.md definition of done) and `Queue-API-Routes.md` / `Queue-Mobile-API-Routes.md` for the changed route behaviour (dependents/link, virtual/end, appointments/[id]).
3. If none of those are approved yet, next code work in priority order:
   REP-041 consent flow design (ask user) → REP-044 double payment → REP-045 payout swap owner-only →
   REP-051 `get_my_hospital` RPC → REP-053 server-side booking notification → REP-017 dispatcher alerts with no destination →
   REP-019/020 stranded jobs + crew hand-back → P3s.

## Environment constraints (why things are pending)

- One Supabase project (`qzodmkgyzguzzyovjpfx`) = production; no staging, branching needs Pro. No Docker → no local Supabase → pgTAP `npm run test:rls` cannot run.
- This session was **denied production database reads** (and therefore writes). SQL findings come from `supabase/migrations/` only; production may differ where changes were applied out of band.
- Mobile changes need new builds/OTA; web changes need a Vercel deploy.

## Completed

- Batch 1: discovery, architecture map (`ARCHITECTURE.md`), baseline (all green except pre-existing lint).
- Batch 2 (code, tests, migrations written): see `CHANGELOG.md`. Highlights: two P0 account takeovers closed in web code (REP-040 staff password reset, REP-041 dependent linking — interim), P0 Agora token exposure (REP-001, code + migration), P0 ambulance dispatch controls (REP-010/011/012, migration), patient appointment tampering (REP-030/031, migration), doctor scoping (REP-034), dashboard role gates (REP-042), patient leaving ending the consult (REP-002), SOS copy (REP-021), hospital invite (REP-050), several date/feedback fixes.

## Last verified tests (2026-10-13, WAT)

- web vitest: 17 files / 133 tests PASS (15:17). New tests fail against the pre-fix code where noted in TEST_MATRIX.
- web `tsc` PASS; client, doctor, hospital, ambulance `tsc` PASS (15:0x–15:15).
- Migrations: syntax-checked with libpg_query (SQL + PL/pgSQL) — PASS. **Not executed anywhere.**
- End-of-batch regression (typecheck all, jest, lint count, web build): see TEST_MATRIX "Batch 2 regression".

## After applying the migrations — verification queries (read-only)

```sql
-- REP-011/012/015: must all be false
select p.proname, has_function_privilege('anon', p.oid, 'execute') anon,
       has_function_privilege('authenticated', p.oid, 'execute') authd
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname in ('record_unit_location','accept_dispatch_offer',
   'get_request_pickup_latlng','rank_destination_hospitals','expire_stale_offers','expire_overdue_searches','flag_stale_tracking');
-- REP-010: no INSERT policy, no insert privilege for authenticated
select policyname, cmd from pg_policies where tablename = 'transport_requests';
select has_table_privilege('authenticated', 'public.transport_requests', 'insert');            -- false
-- REP-001: staff policy gone; host_token not selectable
select policyname from pg_policies where tablename = 'virtual_sessions';                          -- only the patient policy
select has_column_privilege('authenticated', 'public.virtual_sessions', 'host_token', 'select'); -- false
select count(*) from virtual_sessions where host_token is not null;                               -- 0
-- REP-030/031/033: triggers present
select tgname from pg_trigger where tgrelid = 'public.appointments'::regclass and not tgisinternal order by 1;
```
Behavioural checks (BEGIN … ROLLBACK as a TEST user via `set local role authenticated; set local request.jwt.claims = '{"sub":"<auth id>","role":"authenticated"}'`):
patient update `status='checked_in'` → error 42501; patient cancel → succeeds with server `refund_pct`; patient `cancel_my_transport` on a `searching` row → true; front-desk TEST session update still works.
Device checks: patient receives the call (Realtime still delivers `guest_token` under column grants); doctor End closes the patient screen.

**Pre-flight for 20261013100001** (the unique index aborts the migration otherwise):
```sql
select requester_id, count(*) from transport_requests
 where request_type = 'emergency' and status in ('requested','searching','matched','en_route_to_patient','on_scene','transporting')
 group by 1 having count(*) > 1;
```
**REP-041 follow-up audit** (existing links that an adult never consented to — review manually):
```sql
select dl.id, dl.linked_at, c.full_name caretaker, d.full_name dependent, d.date_of_birth
  from dependent_links dl join users c on c.id = dl.caretaker_id join users d on d.id = dl.dependent_id
 where dl.status = 'active' and (d.date_of_birth is null or d.date_of_birth <= (current_date - interval '18 years'));
```

## Key decisions and risks

- Guard triggers (not column grants) for patient appointment writes, to keep installed apps' cancel working.
- REP-002 reverses an earlier "either party ends the call" decision: patient leaving no longer completes the consult.
- REP-040: dashboard password reset now only for portal-generated logins.
- REP-041 interim rule blocks caretaker-initiated linking of adults — a product behaviour change.
- No compliance claims: NDPA (Nigeria Data Protection Act 2023) review, clinical-safety review of dispatch, and an independent security review are still required.

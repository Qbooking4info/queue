# Test matrix

States: PASS (executed, meaningful assertions) · FAIL · BLOCKED (documented dependency) ·
NOT_RUN · NOT_APPLICABLE. Times are WAT (Africa/Lagos, UTC+1).

## Baseline — 2026-10-13 12:43–12:50 WAT, before any repair edits

| Check | Command (dir) | Result |
|---|---|---|
| Web unit/route tests | `npx vitest run` (web) | PASS — 9 files, 96 tests |
| Web typecheck | `npx tsc --noEmit` (web) | PASS |
| Web lint | `npx eslint` (web) | FAIL — 329 errors, 22 warnings (pre-existing, REP-090) |
| Web production build | `npm run build` (web; includes env-safety prebuild) | PASS |
| App typechecks | `npm run typecheck` (root → ambulance, client, doctor, hospital) | PASS ×4 |
| Shared jest | `npm test` (root → packages/shared) | PASS — 2 suites, 32 tests |
| pgTAP RLS tests | `npm run test:rls` (web) | BLOCKED — needs local Supabase/Docker; Docker not installed |
| E2E role flows | `node scripts/e2e/*.js` | BLOCKED — signs in against production; production access not permitted this session |

## Batch 2 — 2026-10-13 14:56–15:01 WAT

| App / area | Test | Result |
|---|---|---|
| web · virtual | `virtual/token/route.test.ts` — non-doctor 403, doctor 200, rings patient, missing cert 500, **host token not stored** | PASS (5) |
| web · virtual | `virtual/end/route.test.ts` — patient leave no state change, doctor end completes + consult_ended_at, idempotent, in-person 400, stranger 403 | PASS (5) |
| web · virtual | Same two files against the **pre-fix** routes (regression proof) | 5 FAIL as expected, then restored |
| web · transport | `transport/request/route.test.ts` — create + dispatch, duplicate guard, 23505 race, bad coords 400 | PASS (4) |
| web | full `npx vitest run` after batch 2 | PASS — 102 tests (before request tests were added) |
| web | `npx tsc --noEmit` after batch 2 | PASS |
| client, doctor | `npx tsc --noEmit` after call-screen fixes | PASS |
| web · staff | `dashboard/staff/actions.test.ts` (5) — own-hospital portal login only | PASS; 3 FAIL on original |
| web · dependents | `dependents/link/route.test.ts` (5) + `lib/dependent-linking.test.ts` (4) | PASS; 3 FAIL on original |
| web · appointments | `appointments/[id]/route.test.ts` (4) — doctor scoping | PASS; 2 FAIL on original |
| web · dashboard | `dashboard/appointments/actions.test.ts` (6) — role gates | PASS |
| web · clinic-staff | `clinic-staff/reset-password/route.test.ts` (3) | PASS |
| hospital, ambulance | `npx tsc --noEmit` after fixes | PASS |
| DB · migrations 20261013100001/100002 | libpg_query parse of SQL + PL/pgSQL (negative control rejects a broken body) | PASS (syntax only) |
| DB · migrations 20261013100001/100002 | apply + privilege/RLS/behaviour checks | NOT_RUN — needs production write approval |
| client/doctor · video call | device test: doctor ends → patient sees "Consultation ended"; patient drops → doctor sees waiting state; patient rejoins | NOT_RUN — needs device build + deploy |

## Feature coverage (what exists vs. gaps)

| Workflow | Automated coverage | Gap |
|---|---|---|
| Appointment booking / capacity / cancel | walk-in route test only | concurrency, cancel releases capacity, time zones (audit pending) |
| Queue check-in / numbering / call-next | walk-in route test | concurrent numbering, transitions |
| Virtual consultation | token + end routes | `GET /api/virtual`, RLS on `virtual_sessions`, screens |
| Ambulance dispatch | matching/routing/eta pure logic, sweep route, request route | respond/location/triage/receive routes; SQL grants/constraints (pgTAP blocked) |
| Payments / wallet | paystack + fees libs | webhook route, wallet race |
| Cross-app E2E | `scripts/e2e` (read paths, prod) | BLOCKED this session |

## Batch 2 regression — 2026-10-13 15:18–15:30 WAT

| Check | Result |
|---|---|
| `npx vitest run` (web) | PASS — 17 files, 133 tests |
| `npm run typecheck` (all four apps) | PASS (no errors) |
| `npm test` (packages/shared jest) | PASS — 3 suites, 36 tests (the third suite, `ambulance-api.test.ts`, came from the concurrent session's commit f7a5179) |
| `npx eslint` (web) | 329 errors / 22 warnings — **same as baseline**; 7 `any`s this batch briefly added in test mocks were removed |
| `npm run build` (web) | PASS |

## Production checks — 2026-10-13 15:55–16:05 WAT (read-only, or BEGIN…ROLLBACK with synthetic fixtures)

| Check | Result |
|---|---|
| Function EXECUTE grants (7 dispatch/location fns) | PASS — anon/authenticated false (000007 live) |
| Live 100002 guard: forged insert, queue jump, hospital move, cancel >24h, service role | PASS (5) |
| Live 100002 guard: late cancel resending refund 100 | **FAIL** — kept 100 → fix `20261013300001` |
| `20261013300001` dry run + 7 assertions | PASS (7/7) |
| `20261013100001` dry run + 11 assertions (tokens, staff access, transport insert, cancel while searching, session end trigger, index) | PASS (11/11) |
| Production unchanged after dry runs (policies, token count, index, fixtures) | PASS |
| pgTAP `patient_appointment_writes.test.sql` (concurrent session's) | PASS (final assertion visible; tool returns last result set only) |

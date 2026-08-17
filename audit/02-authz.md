# Pass 2 — Authorization (service-role routes)

Every handler under `web/src/app/api/**` was scanned mechanically for three
signals: does it use the service-role client, does it verify caller identity
(`requireRole` / `getServerUser`), and does it verify the caller's right to the
**specific record** being acted on.

56 handlers across 40 route files. Full matrix in `/tmp` during the run; the
findings below are the ones where a signal is missing and it matters.

---

## 2-A · CRITICAL — Cross-tenant staff account takeover

**`web/src/app/api/clinic-staff/reset-password/route.ts:6-33`**

```
 6   const auth = await requireRole(['super_admin','hospital_admin','clinic_admin'])
19   const { data: caRow } = await db.from('clinic_admins')
22       .eq('id', staffId)              // ← staffId comes straight from the body
33   await db.auth.admin.updateUserById(userRow.auth_id, { password: newPassword })
```

The handler authenticates the caller and then resets the password of **whatever
`staffId` the body names**. It never compares that staff member's `hospital_id`
against `caller.hospitalId`.

**What breaks in plain terms:** any hospital_admin or clinic_admin — at *any*
hospital on the platform — can reset the password of *any* staff member at *any
other* hospital, then sign in as them. That is full account takeover across the
tenant boundary, and the account taken over has front-desk or clinic-admin
access to the victim hospital's patient records. Under the stated severity model
(patient data exposure is top class) this is the worst finding in the audit.

This is an inconsistency rather than an oversight in design: the sibling handler
`web/src/app/api/clinic-staff/route.ts:117` performs exactly the right check on
exactly the same lookup —

```
117  if (caller.role !== 'super_admin' && caller.hospitalId !== caRow.hospital_id) {
```

— so the pattern exists in the same file family and was simply not applied here.

Production currently has 5 `clinic_admins` rows across 1 hospital, so the
cross-tenant path is not yet exploitable *in practice*. It becomes exploitable
the moment a second hospital onboards.

**Concrete fix:** select `hospital_id` alongside `user_id` at line 20, then
mirror line 117 of the sibling route before the `updateUserById` call. Also
consider whether `clinic_admin` should be able to reset passwords at all, or
only `hospital_admin`.
**Effort:** 10 minutes.
**NOT APPLIED** — touches auth. Proposal only, per the rules.

---

## 2-B · HIGH — Unauthenticated push-notification injection to clinical staff

**`web/src/app/api/appointments/notify-staff/route.ts:5-18`**

```
 5   export async function POST(req: NextRequest) {
 7     const { appointmentId, patientName, hospitalName } = await req.json()
10     const db = createAdminClient()
12     const body = patientName ? `${patientName} just booked ...` : ...
16     await notifyStaff(db, appointmentId, title, body)
```

No `requireRole`, no `getServerUser`, no signature check — and it uses the
service-role client. `patientName` and `hospitalName` are taken verbatim from
the request body and become the notification text.

`web/src/lib/notify-staff.ts:43-50` then inserts a `notifications` row and
`:4-11` sends an Expo push to the doctor's device.

**What breaks in plain terms:** anyone on the internet can send arbitrary text
as a push notification to a named doctor's phone, and write unbounded rows into
`notifications`. In a clinical setting that is a social-engineering channel
("Patient X is waiting in room 3") delivered through a trusted app, plus a free
denial-of-service against the notifications table.

It does not leak patient data back to the attacker — the response is always
`{ok:true}` — which is why this is HIGH and not CRITICAL.

Root cause is visible at the call site: `mobile/screens/BookingFlowScreen.tsx`
posts to this endpoint with no `Authorization` header, so it was built to be
open.

**Concrete fix:** require the caller's session, verify they are the patient on
`appointmentId` (or staff at that hospital), and derive `patientName` /
`hospitalName` server-side from the appointment rather than trusting the body.
The mobile call site must then send the bearer token, as `WalkInBookingScreen`
already does.
**Effort:** 25 minutes including the mobile change.
**NOT APPLIED** — touches auth.

Secondary, same file, **LOW**: line 20 returns `String(err)` to the caller,
leaking internal error text on an unauthenticated endpoint.

---

## 2-C · LOW — Handlers with identity but no record-ownership check (reviewed, OK)

The scan flagged these as "authenticated, no ownership signal". Each was read;
all are correctly scoped by other means, recorded here so the next audit does
not re-investigate:

| route:line | why it is fine |
|---|---|
| `doctors/me/route.ts:15,21,33` | scoped to `caller.doctorId` from the verified session, never a body value |
| `ambulances/fleet/units/[unitId]/duty/route.ts:22` | delegates to `set_unit_duty()`, which calls `assert_can_operate_unit()` in SQL |
| `emergency-directory/route.ts:30,45,80,111` | `super_admin` only; platform-wide data by design |
| `super-admin/analytics/route.ts:7` | `super_admin` only |
| `payments/subaccount/route.ts:23` | reads `caller.hospitalId`; POST/DELETE scope by it |
| `transport/offers/respond/route.ts:13` | verifies the caller is on the unit's active shift crew (`:35-48`) |
| `transport/location/route.ts:17` | same shift-crew check (`:29-42`) |
| `virtual/token`, `virtual/end` | participant check inside the handler |
| `public/hospitals/*` | intentionally public directory |
| `payments/webhook` | HMAC signature, not caller identity — correct for a webhook |
| `transport/sweep` | `CRON_SECRET` bearer, constant-time compare |
| `geocode/route.ts:32` | proxy to Nominatim, no data access |

---

## Summary

| severity | count |
|---|---|
| CRITICAL | 1 |
| HIGH | 1 |
| LOW | 1 |

The service-role client is used in 40 route files. Two have a real gap. The
rest either check identity and ownership, or are deliberately public.

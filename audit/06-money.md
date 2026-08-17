# Pass 6 — Money and Data Integrity

Scope as briefed: the emergency booking flow (`booking_mode`, `urgency`, 2× fee,
arrival time). Can the fee be manipulated client-side, can a slot be double
booked, are amounts computed server-side only?

---

## 6-A · HIGH — The fee arithmetic is server-side, but one of its inputs is not

**`web/src/lib/fees.ts:91`**

```
91    fee: computeFee(base, a.urgency === 'emergency'),
```

Two inputs, with different trust levels:

| input | source | trust |
|---|---|---|
| `base` | `hospitals.opd_fee` / `doctors.consultation_fee` | server-owned ✓ |
| `urgency` | `appointments.urgency` | **written by the client** |

`mobile/lib/api.ts:327` and `:379` set `urgency: payload.urgency ?? 'routine'`,
and the mobile app inserts into `appointments` **directly through Supabase**
(`mobile/lib/api.ts:252,265,277,316`) rather than through a validating API route.
There is **no CHECK constraint on `urgency`** in any migration — the only
references are in the queue-renumbering trigger
(`20260805000001_atomic_queue_renumbering.sql:62,105,144`), which reads it but
does not constrain it.

**What breaks in plain terms:** a modified client can book through the emergency
flow while writing `urgency: 'routine'`, and pay the single fee instead of the
2× emergency fee. `/api/payments/initialize` then faithfully computes the lower
amount, because it trusts the stored row. The endpoint's own comment at
`:13-15` says the amount is resolved from the database precisely so a client
cannot dictate it — which is true of the arithmetic, and not true of this input.

The self-limiting factor: `urgency` also drives queue priority
(`20260805000001:62` sorts emergencies first), so under-declaring costs the
patient their place in the queue. It is a discount, not a queue-jump. The
reverse — inflating `urgency` to jump the queue — costs the patient money, so
neither direction is purely advantageous. That is why this is HIGH and not
CRITICAL.

**Concrete fix:** derive `urgency` server-side from the flow that created the
booking rather than accepting it, or add a DB CHECK plus a trigger that pins
`urgency` at insert and forbids patient UPDATEs of it. The cleanest version is
to route booking creation through an API route, as walk-ins already are.
**Effort:** 60 min.
**NOT APPLIED** — payments/schema, proposal only.

---

## 6-B · MEDIUM — Slots can be double booked (see 5-A)

`increment_slot_booking()` is defined
(`20260726000002_secure_increment_slot_booking.sql`) and **never called**; the
only references are the generated types at `web/src/types/database.ts:3718`.
`mobile/lib/api.ts:321` writes `slot_id` without reserving it.

Dormant: `time_slots` has 0 rows, 0 appointments carry a `slot_id`. Full write-up
in Pass 5.

---

## 6-C · PASS — Amount is never accepted from the request body

**`web/src/app/api/payments/initialize/route.ts:30`** destructures **only**
`appointmentId`. `:47` resolves the fee from the database, `:117` passes
`fee.totalKobo`. There is no code path where a client-supplied number reaches
Paystack. Verified live on 2026-08-10: a real transaction charged ₦500 computed
server-side.

## 6-D · PASS — The webhook re-checks the amount

`web/src/app/api/payments/webhook/route.ts:94-105` compares the verified amount
against the recorded amount and writes `failed` on mismatch rather than
confirming. `:108-119` guards the status transition so duplicate deliveries are
idempotent. Both verified live against Paystack.

## 6-E · LOW — The emergency multiplier is duplicated in three files

`web/src/lib/fees.ts:20`, `mobile/lib/fees.ts:20`,
`web/src/app/api/appointments/stats/route.ts:18` — all currently `2`.

They have drifted before (mobile quoted 1.5× while the server booked 2×, fixed
2026-08-10). Three copies is still three chances to drift; the mobile/web
boundary genuinely prevents sharing a module, but `fees.ts` and
`stats/route.ts` are both server-side and could share one.
**Effort:** 10 min. **NOT APPLIED** — touches money.

## 6-F · LOW — Platform margin goes negative above ~₦26,700

Documented in `Queue-Env-Config.md`. A flat ₦500 platform fee against Paystack's
percentage fee nets **−₦358** on a ₦50,500 emergency booking. Commercial
decision, not a defect; recorded here because it is a money-integrity issue that
will not announce itself.

---

## Summary

| severity | count |
|---|---|
| HIGH | 1 |
| MEDIUM | 1 |
| LOW | 2 |
| PASS | 2 |

The payment endpoint is correctly built — the amount cannot be dictated by a
request body, and the webhook re-verifies independently. The gap is upstream: a
value the fee depends on is written by the client into a table the client can
insert into directly.

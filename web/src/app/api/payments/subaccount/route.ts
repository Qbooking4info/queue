import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { paystackConfigured, listBanks, resolveAccount, createSubaccount } from '@/lib/paystack'

/**
 * Hospital payout setup.
 *
 * GET    ?banks=1                       — banks Paystack can settle to
 * GET    ?accountNumber=&bankCode=      — resolve the name on an account
 * POST   { bankCode, accountNumber }    — create the subaccount and attach it
 *
 * hospital_admin only. This decides where a hospital's revenue lands, so it is
 * deliberately not something clinic_admin or front_desk can touch.
 *
 * Account resolution is exposed separately so the UI can show the account name
 * for confirmation BEFORE anything is created. A transposed digit otherwise
 * settles a hospital's takings into a stranger's account, and nothing downstream
 * would detect it — Paystack pays whoever the number belongs to.
 */

export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  if (!paystackConfigured()) {
    return NextResponse.json({ error: 'Online payment is not enabled', code: 'PAYMENTS_DISABLED' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)

  if (searchParams.get('banks')) {
    try {
      const banks = await listBanks()
      return NextResponse.json({ banks: banks.map(b => ({ name: b.name, code: b.code })) })
    } catch (err) {
      return Errors.internal(err instanceof Error ? err.message : 'Could not load banks')
    }
  }

  const accountNumber = searchParams.get('accountNumber')?.trim()
  const bankCode = searchParams.get('bankCode')?.trim()
  if (accountNumber && bankCode) {
    if (!/^\d{10}$/.test(accountNumber)) {
      return Errors.validation('Account number must be 10 digits')
    }
    try {
      const r = await resolveAccount(accountNumber, bankCode)
      return NextResponse.json({ accountName: r.account_name, accountNumber: r.account_number })
    } catch {
      // Paystack returns an error for an account it cannot find; that is a
      // normal outcome of typing the wrong number, not a server fault.
      return NextResponse.json({ error: 'Could not verify that account. Check the number and bank.' }, { status: 400 })
    }
  }

  return Errors.validation('Pass ?banks=1 or ?accountNumber=&bankCode=')
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()
  if (!paystackConfigured()) {
    return NextResponse.json({ error: 'Online payment is not enabled', code: 'PAYMENTS_DISABLED' }, { status: 503 })
  }

  const body = await req.json().catch(() => null) as { bankCode?: string; accountNumber?: string } | null
  const bankCode = body?.bankCode?.trim()
  const accountNumber = body?.accountNumber?.trim()
  if (!bankCode || !accountNumber) return Errors.validation('bankCode and accountNumber are required')
  if (!/^\d{10}$/.test(accountNumber)) return Errors.validation('Account number must be 10 digits')

  const db = createAdminClient()
  const { data: hospital } = await db
    .from('hospitals')
    .select('name, email, paystack_subaccount_code')
    .eq('id', caller.hospitalId)
    .single()
  if (!hospital) return Errors.notFound('Hospital')

  const h = hospital as { name: string; email: string | null; paystack_subaccount_code: string | null }
  if (h.paystack_subaccount_code) {
    // Replacing a payout destination silently is how a hospital's revenue ends
    // up somewhere nobody chose. Requires an explicit removal first.
    return Errors.validation('This hospital already has a payout account. Remove it before adding another.')
  }

  try {
    // Resolve again server-side. The UI already showed the name, but the client
    // could have submitted a different number than the one it verified.
    const resolved = await resolveAccount(accountNumber, bankCode)

    const sub = await createSubaccount({
      businessName: h.name,
      bankCode,
      accountNumber,
      contactEmail: h.email,
    })

    const { data: banks } = { data: await listBanks().catch(() => []) }
    const bankName = banks.find(b => b.code === bankCode)?.name ?? null

    const { error } = await db.from('hospitals').update({
      paystack_subaccount_code: sub.subaccount_code,
      paystack_bank_name: bankName,
      paystack_account_last4: accountNumber.slice(-4),
    } as never).eq('id', caller.hospitalId)
    if (error) return Errors.internal(error.message)

    return NextResponse.json({
      subaccountCode: sub.subaccount_code,
      accountName: resolved.account_name,
      bankName,
      last4: accountNumber.slice(-4),
    })
  } catch (err) {
    console.error('[payments] subaccount creation failed', caller.hospitalId, err)
    return Errors.internal(err instanceof Error ? err.message : 'Could not create the payout account')
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(['super_admin', 'hospital_admin'], req)
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  if (!caller.hospitalId) return Errors.forbidden()

  const db = createAdminClient()
  // Detaches locally only. The Paystack subaccount is left intact so historical
  // settlements remain traceable; deleting it there would orphan past payouts.
  const { error } = await db.from('hospitals').update({
    paystack_subaccount_code: null,
    paystack_bank_name: null,
    paystack_account_last4: null,
  } as never).eq('id', caller.hospitalId)
  if (error) return Errors.internal(error.message)

  return NextResponse.json({ success: true, note: 'Online payment is now off for this hospital; bookings continue with payment at the desk.' })
}

import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { notifyStaff } from '@/lib/notify-staff'

// No auth on this route by design -- a patient's own device calls it mid-booking flow,
// before there's necessarily a session to verify against. notifyStaff() resolves the
// patient/hospital name itself from appointmentId rather than trusting client input,
// so the only thing an unauthenticated caller controls is which real appointmentId
// triggers a (truthful) notification, not what the notification says.
export async function POST(req: NextRequest) {
  try {
    const { appointmentId } = await req.json()
    if (!appointmentId) return NextResponse.json({ error: 'appointmentId required' }, { status: 400 })

    const db = createAdminClient()
    await notifyStaff(db, appointmentId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

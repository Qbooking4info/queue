import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { notifyStaff } from '@/lib/notify-staff'

export async function POST(req: NextRequest) {
  try {
    const { appointmentId, patientName, hospitalName } = await req.json()
    if (!appointmentId) return NextResponse.json({ error: 'appointmentId required' }, { status: 400 })

    const db = createAdminClient()
    const title = 'New Appointment Booked'
    const body = patientName
      ? `${patientName} just booked an appointment${hospitalName ? ` at ${hospitalName}` : ''}.`
      : `A new appointment has been booked${hospitalName ? ` at ${hospitalName}` : ''}.`

    await notifyStaff(db, appointmentId, title, body)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

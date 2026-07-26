import { createAdminClient } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { Errors } from '@/lib/api-error'
import { safePatientName } from '@/lib/dashboard-utils'

interface AdminNotification {
  id: string
  type: 'new' | 'cancel' | 'review' | 'payment'
  msg: string
  time: string
  href: string
  sortAt: string
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// GET /api/hospitals/[id]/activity?limit=10 -- replaces admin-api.ts's
// getRecentActivity (Task 15), used by the dashboard's notification bell
// (TopBar.tsx). Recent hospital-scoped activity across appointments,
// reviews and payouts, merged and sorted newest-first -- not a persisted
// notifications table, derived live from the source tables.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(['super_admin', 'hospital_admin', 'clinic_admin', 'front_desk', 'doctor'])
  if (auth instanceof NextResponse) return auth
  const { caller } = auth
  const { id: hospitalId } = await params
  if (caller.role !== 'super_admin' && caller.hospitalId !== hospitalId) return Errors.forbidden()
  const db = createAdminClient()

  const limit = Number(new URL(req.url).searchParams.get('limit') ?? '10')
  // Only surface activity from the last 7 days -- otherwise a booking from months ago gets
  // relabeled as "New booking received" just because it's the most recent row in the table.
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [{ data: newAppts }, { data: cancelledAppts }, { data: reviews }, { data: payouts }] = await Promise.all([
    (db as any).from('appointments')
      .select('id, created_at, patient:users!appointments_patient_id_fkey(full_name)')
      .eq('hospital_id', hospitalId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(limit),
    (db as any).from('appointments')
      .select('id, cancelled_at, patient:users!appointments_patient_id_fkey(full_name)')
      .eq('hospital_id', hospitalId)
      .eq('status', 'cancelled')
      .gte('cancelled_at', cutoff)
      .order('cancelled_at', { ascending: false })
      .limit(limit),
    (db as any).from('reviews')
      .select('id, rating, created_at, doctor:doctors(full_name)')
      .eq('hospital_id', hospitalId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(limit),
    (db as any).from('payouts')
      .select('id, amount, paid_at, status')
      .eq('hospital_id', hospitalId)
      .eq('status', 'paid')
      .gte('paid_at', cutoff)
      .order('paid_at', { ascending: false })
      .limit(limit),
  ])

  const items: AdminNotification[] = []

  for (const a of (newAppts ?? []) as any[]) {
    if (!a.created_at) continue
    items.push({
      id: `appt-new-${a.id}`, type: 'new', href: `/dashboard/appointments`,
      msg: `New booking received from ${safePatientName(a.patient?.full_name, 'a patient')}`,
      time: timeAgo(a.created_at), sortAt: a.created_at,
    })
  }
  for (const a of (cancelledAppts ?? []) as any[]) {
    if (!a.cancelled_at) continue
    items.push({
      id: `appt-cancel-${a.id}`, type: 'cancel', href: `/dashboard/appointments`,
      msg: `Appointment cancelled by ${safePatientName(a.patient?.full_name, 'a patient')}`,
      time: timeAgo(a.cancelled_at), sortAt: a.cancelled_at,
    })
  }
  for (const r of (reviews ?? []) as any[]) {
    if (!r.created_at) continue
    items.push({
      id: `review-${r.id}`, type: 'review', href: `/dashboard/doctors`,
      msg: `New ${r.rating}-star review posted${r.doctor?.full_name ? ` for Dr. ${r.doctor.full_name}` : ''}`,
      time: timeAgo(r.created_at), sortAt: r.created_at,
    })
  }
  for (const p of (payouts ?? []) as any[]) {
    if (!p.paid_at) continue
    items.push({
      id: `payout-${p.id}`, type: 'payment', href: `/dashboard/analytics`,
      msg: `Payout of ${p.amount ? `₦${Number(p.amount).toLocaleString()}` : 'funds'} processed to your bank`,
      time: timeAgo(p.paid_at), sortAt: p.paid_at,
    })
  }

  const notifications = items
    .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime())
    .slice(0, limit)

  return NextResponse.json({ notifications })
}

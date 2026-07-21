import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'

// Aggregate platform analytics for super_admin — no patient PHI.
// Returns hospital-level counts only: bookings this month, total bookings, doctor count.
export async function GET() {
  const auth = await requireRole(['super_admin'])
  if (auth instanceof NextResponse) return auth

  const db = createAdminClient()
  const monthStart = new Date()
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)

  const [
    { data: hospitals },
    { data: monthly },
    { data: allTime },
    { data: doctors },
  ] = await Promise.all([
    // BL6: filter to active hospitals only so deactivated/offboarded hospitals don't inflate totals
    db.from('hospitals').select('id, name, city, state, type, is_verified, created_at').eq('is_active', true),

    // Monthly booking count per hospital (excluding cancelled)
    db.from('appointments')
      .select('hospital_id')
      .gte('created_at', monthStart.toISOString())
      .neq('status', 'cancelled'),

    // All-time completed count per hospital
    db.from('appointments')
      .select('hospital_id')
      .eq('status', 'completed'),

    // Active doctor count per hospital
    db.from('doctors').select('hospital_id').eq('is_active', true),
  ])

  // Build lookup maps
  const monthlyMap: Record<string, number> = {}
  for (const r of monthly ?? []) monthlyMap[r.hospital_id] = (monthlyMap[r.hospital_id] ?? 0) + 1

  const completedMap: Record<string, number> = {}
  for (const r of allTime ?? []) completedMap[r.hospital_id] = (completedMap[r.hospital_id] ?? 0) + 1

  const doctorMap: Record<string, number> = {}
  for (const r of doctors ?? []) doctorMap[r.hospital_id] = (doctorMap[r.hospital_id] ?? 0) + 1

  const rows = (hospitals ?? []).map(h => ({
    id:                h.id,
    name:              h.name,
    city:              h.city,
    state:             h.state,
    type:              h.type,
    is_verified:       h.is_verified,
    joined:            h.created_at,
    monthly_bookings:  monthlyMap[h.id]   ?? 0,
    total_completed:   completedMap[h.id] ?? 0,
    active_doctors:    doctorMap[h.id]    ?? 0,
  }))

  return NextResponse.json({
    month:      monthStart.toISOString().slice(0, 7),
    hospitals:  rows,
    totals: {
      hospitals:         rows.length,
      verified:          rows.filter(h => h.is_verified).length,
      monthly_bookings:  rows.reduce((s, h) => s + h.monthly_bookings, 0),
      total_completed:   rows.reduce((s, h) => s + h.total_completed, 0),
      active_doctors:    rows.reduce((s, h) => s + h.active_doctors, 0),
    },
  })
}

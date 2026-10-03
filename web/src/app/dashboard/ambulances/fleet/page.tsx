import Link from 'next/link'
import { ArrowLeft, Ambulance } from 'lucide-react'
import { getHospitalContext } from '@/lib/getHospitalContext'

export const dynamic = 'force-dynamic'

/**
 * Ambulance fleet management moved entirely into the Queue Ambulance app --
 * "ambulance management will be on the ambulance app only, other users ...
 * can view and request ambulances from their accounts, not manage ambulance
 * services." A hospital's own ambulance service now registers and is run
 * through its own account there (same flow an independent operator uses),
 * not through this hospital admin login, so there is nothing left to manage
 * from this page. Kept as a pointer rather than a 404 -- this URL was
 * bookmarked/linked from the settings page in the previous design.
 */
export default async function FleetMovedPage() {
  await getHospitalContext()

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <Link href="/dashboard/ambulances" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted, #888)', textDecoration: 'none', marginBottom: 20 }}>
        <ArrowLeft size={14} /> Ambulances
      </Link>
      <div style={{ textAlign: 'center', padding: '48px 24px' }}>
        <Ambulance size={40} style={{ margin: '0 auto 16px', opacity: 0.6 }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Fleet management moved</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, opacity: 0.75 }}>
          Adding units, setting duty, and managing crew now happen in the <strong>Queue Ambulance</strong> app.
          If your hospital runs its own ambulance service, register it there — the same signup independent
          operators use, with an option to link it to your hospital. Sign in with the dedicated ambulance
          account you register, not your hospital admin login.
        </p>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { supabase } from '../lib/supabase'

/**
 * How many referrals addressed to this doctor are still waiting on the
 * receiving hospital's decision -- the badge on the doctor app's Inbox tab.
 *
 * A referral is an ordinary appointment row with booking_mode 'referral';
 * "pending" is approval_status 'pending_approval', which is the state
 * /api/appointments/refer leaves it in when the receiving hospital approves
 * bookings manually. Polled rather than subscribed, like the locum badge: a
 * referral arrives a few times a day, and a realtime channel per doctor would
 * cost more than it saves. Refreshed on foreground so a doctor who was
 * notified while away sees the badge as soon as they open the app.
 */
export function usePendingReferrals(doctorId: string | null, intervalMs = 60_000) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!doctorId) { setCount(0); return }
    let cancelled = false

    const refresh = async () => {
      const { count: n } = await supabase
        .from('appointments')
        .select('*', { count: 'exact', head: true })
        .eq('doctor_id', doctorId)
        .eq('booking_mode', 'referral')
        .eq('approval_status', 'pending_approval')
      if (!cancelled) setCount(n ?? 0)
    }

    refresh()
    const timer = setInterval(refresh, intervalMs)
    const sub = AppState.addEventListener('change', s => { if (s === 'active') refresh() })

    return () => { cancelled = true; clearInterval(timer); sub.remove() }
  }, [doctorId, intervalMs])

  return count
}

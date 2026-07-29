'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Subscribes to Supabase Realtime for live inbound-ambulance updates.
// Falls back to 30s polling in case Realtime is not enabled on transport_requests.
export function AutoRefreshAmbulances({ hospitalId }: { hospitalId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`ambulances-${hospitalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transport_requests', filter: `destination_hospital_id=eq.${hospitalId}` },
        () => router.refresh(),
      )
      .subscribe()

    const fallback = setInterval(() => router.refresh(), 30_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(fallback)
    }
  }, [hospitalId, router])

  return null
}

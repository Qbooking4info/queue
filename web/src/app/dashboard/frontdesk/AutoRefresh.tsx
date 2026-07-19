'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Subscribes to Supabase Realtime for live queue updates.
// Falls back to 60s polling in case Realtime is not enabled on the appointments table.
export function AutoRefresh({ hospitalId }: { hospitalId: string }) {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel(`queue-${hospitalId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `hospital_id=eq.${hospitalId}` },
        () => router.refresh(),
      )
      .subscribe()

    // Fallback: re-fetch every 60s if Realtime is unavailable
    const fallback = setInterval(() => router.refresh(), 60_000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(fallback)
    }
  }, [hospitalId, router])

  return null
}

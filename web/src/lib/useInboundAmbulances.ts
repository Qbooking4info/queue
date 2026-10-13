'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface InboundAmbulance {
  id: string
  booking_ref: string
  status: string
  triage_level: number | null
  symptom_description: string | null
  eta_seconds: number | null
  is_inbound: boolean
  unit: { plate_number: string; call_sign: string | null } | { plate_number: string; call_sign: string | null }[] | null
}

// Trips still on their way in. Arrived ones stay listed until "Patient received".
const LIVE = ['matched', 'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination']

/**
 * Ambulances heading to this hospital, most urgent first. Feeds the dashboard's
 * inbound banner and the sidebar's Ambulance badge. Reads GET /api/ambulances
 * (the same route Queue Hospital uses), refreshed on realtime changes to this
 * hospital's transports and every 20 s as a fallback.
 */
export function useInboundAmbulances(hospitalId: string | null | undefined, enabled: boolean) {
  const [inbound, setInbound] = useState<InboundAmbulance[]>([])

  useEffect(() => {
    if (!hospitalId || !enabled) { setInbound([]); return }
    let cancelled = false
    const load = () => fetch('/api/ambulances')
      .then(r => r.ok ? r.json() : { requests: [] })
      .then(({ requests }: { requests: InboundAmbulance[] }) => {
        if (cancelled) return
        setInbound((requests ?? [])
          .filter(r => r.is_inbound && LIVE.includes(r.status))
          .sort((a, b) => (a.triage_level ?? 9) - (b.triage_level ?? 9) || (a.eta_seconds ?? 1e9) - (b.eta_seconds ?? 1e9)))
      })
      .catch(() => {})

    load()
    const supabase = createClient()
    const channel = supabase.channel(`inbound-banner-${hospitalId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_requests', filter: `destination_hospital_id=eq.${hospitalId}` }, load)
      .subscribe()
    const timer = setInterval(load, 20_000)
    return () => { cancelled = true; supabase.removeChannel(channel); clearInterval(timer) }
  }, [hospitalId, enabled])

  return inbound
}

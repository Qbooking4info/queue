import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Linking, Platform } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import * as ExpoLocation from 'expo-location'
import { Text } from '@queue/shared/components/ui/Typography'
import {
  Screen, AppBar, Card, Btn, BottomBar, IconBtn, Empty, Mono, Stat, StatStrip, Hair,
} from '@queue/shared/components/q'
import { LiveTrackMap, type LiveTrackData } from '@queue/shared/components/map/LiveTrackMap'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { getMyActiveJob, type ActiveJob } from '@queue/shared/lib/crew-api'
import { fetchJobPatientLocation, subscribeToPatientLocation, TRANSPORT_STATUS_LABEL, type TransportStatus } from '@queue/shared/lib/ambulance-api'
import { startConversation } from '@queue/shared/lib/chat'

function metres(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, toR = (d: number) => d * Math.PI / 180
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
const fmtDist = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`)

// Full-screen live tracking for the active job: where the patient is right now,
// where this ambulance is, and the receiving hospital.
export function CrewTrackScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const [job, setJob] = useState<ActiveJob | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [patient, setPatient] = useState<{ lat: number; lng: number; live: boolean } | null>(null)
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null)
  const [dest, setDest] = useState<{ lat: number; lng: number; name?: string } | null>(null)
  const [recenter, setRecenter] = useState(0)

  const load = useCallback(async () => {
    const j = await getMyActiveJob().catch(() => null)
    setJob(j); setLoaded(true)
    if (!j) return
    if (j.pickup_lat != null && j.pickup_lng != null) setPatient(p => p ?? { lat: j.pickup_lat!, lng: j.pickup_lng!, live: false })
    const live = await fetchJobPatientLocation(j.request_id)
    if (live) setPatient({ lat: live.lat, lng: live.lng, live: true })
    if (j.destination_hospital_id) {
      const { data } = await supabase.from('hospitals').select('name, latitude, longitude').eq('id', j.destination_hospital_id).maybeSingle()
      const h = data as { name: string; latitude: number | null; longitude: number | null } | null
      if (h?.latitude != null && h.longitude != null) setDest({ lat: h.latitude, lng: h.longitude, name: h.name })
    }
  }, [])
  useFocusEffect(useCallback(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id) }, [load]))

  // Patient's live position as they move.
  useEffect(() => {
    if (!job) return
    const ch = subscribeToPatientLocation(job.request_id, pos => setPatient({ lat: pos.lat, lng: pos.lng, live: true }))
    return () => { ch?.unsubscribe?.() }
  }, [job?.request_id])

  // Our own position, straight from the phone's GPS.
  useEffect(() => {
    let sub: ExpoLocation.LocationSubscription | null = null
    ExpoLocation.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') return
      ExpoLocation.watchPositionAsync({ accuracy: ExpoLocation.Accuracy.High, distanceInterval: 10, timeInterval: 5000 },
        l => setMe({ lat: l.coords.latitude, lng: l.coords.longitude })).then(s => { sub = s })
    })
    return () => { sub?.remove() }
  }, [])

  const toHospital = job?.status === 'transporting'
  const target = toHospital ? dest : patient
  const data: LiveTrackData = useMemo(() => ({
    patient: patient ? { ...patient, label: patient.live ? 'Patient (live)' : 'Pickup point' } : null,
    unit: me, destination: dest,
  }), [patient, me, dest])

  function navigate() {
    if (!target) return
    haptics.tap()
    const d = `${target.lat},${target.lng}`
    const url = Platform.select({ ios: `maps://?daddr=${d}&dirflg=d`, android: `google.navigation:q=${d}&mode=d` })!
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${d}`).catch(() => {}))
  }

  if (loaded && !job) {
    return (
      <Screen>
        <AppBar title="Track" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 12 }}>
          <Empty icon="navigate-outline" title="No active run"
            body="When you accept a job, the patient's live position shows here."
            action="Back to jobs" onAction={() => navigation.goBack()} />
        </Card>
      </Screen>
    )
  }

  const etaMins = job?.eta_seconds != null ? Math.round(job.eta_seconds / 60) : null
  const etaAt = job?.eta_updated_at
    ? new Date(job.eta_updated_at).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
    : null
  const distance = me && target ? fmtDist(metres(me, target)) : null

  return (
    <Screen>
      <AppBar
        title={toHospital ? 'To hospital' : 'To patient'}
        sub={job?.booking_ref}
        onBack={() => navigation.goBack()}
        right={<IconBtn name="locate-outline" label="Recenter the map" onPress={() => setRecenter(n => n + 1)} />} />

      <LiveTrackMap data={data} recenterKey={recenter} style={{ flex: 1 }} />

      <Card style={{ marginHorizontal: 0, borderRadius: 0, borderLeftWidth: 0, borderRightWidth: 0, borderBottomWidth: 0 }}>
        <StatStrip>
          <Stat label={toHospital ? 'To hospital' : 'To pickup'}
            value={etaMins != null ? etaMins : '—'} unit={etaMins != null ? 'min' : undefined}
            note={etaAt ? `as of ${etaAt}` : 'not computed yet'} />
          <Stat label="Distance" value={distance ?? '—'} note={me ? 'straight line' : 'no fix yet'} />
          <Stat label="Priority" value={job?.triage_level != null ? `P${job.triage_level}` : '—'}
            tone={job?.triage_level != null && job.triage_level <= 2 ? 'red' : undefined}
            note={TRANSPORT_STATUS_LABEL[job?.status as TransportStatus] ?? ''} last />
        </StatStrip>
        <Hair inset={0} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: patient?.live ? t.q.redFill : t.q.ink60 }} />
          <Text numberOfLines={2} style={{ flex: 1, fontSize: 13, color: t.q.ink70 }}>
            {toHospital
              ? (dest?.name ?? job?.destination_hospital_name ?? 'Receiving hospital')
              : patient?.live ? 'The patient is sharing their live position' : 'Showing the booked pickup point'}
          </Text>
        </View>
      </Card>

      <BottomBar meta={
        <Mono size={12} weight="600" color={t.q.ink60}>
          {job?.symptom_description ?? 'No condition details given'}
        </Mono>
      }>
        <Btn grow label="Navigate" icon="navigate" disabled={!target} onPress={navigate} />
        <Btn label="Call" variant="secondary" icon="call-outline" disabled={!job?.contact_phone}
          onPress={() => job?.contact_phone && Linking.openURL(`tel:${job.contact_phone}`).catch(() => {})} />
        {!!job?.destination_hospital_id && (
          <Btn label="Message" variant="secondary" icon="chatbubble-outline"
            onPress={async () => {
              const r = await startConversation('hospital', job.destination_hospital_id!)
              if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
              else Alert.alert('Messages', r.error)
            }} />
        )}
      </BottomBar>
    </Screen>
  )
}

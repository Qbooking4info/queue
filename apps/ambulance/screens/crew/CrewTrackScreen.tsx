import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Linking, Platform, TouchableOpacity } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import * as ExpoLocation from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '@queue/shared/components/ui/Typography'
import { Header, PrimaryButton, EmptyState, HeaderIconButton } from '@queue/shared/components/ui/v3'
import { LiveTrackMap, type LiveTrackData } from '@queue/shared/components/map/LiveTrackMap'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { getMyActiveJob, type ActiveJob } from '@queue/shared/lib/crew-api'
import { fetchJobPatientLocation, subscribeToPatientLocation, formatEta, TRANSPORT_STATUS_LABEL, type TransportStatus } from '@queue/shared/lib/ambulance-api'
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
      <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <Header title="Tracking" onBack={() => navigation.goBack()} />
        <EmptyState icon="navigate-outline" title="No active job" body="When you accept a job, the patient's live position shows here." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title={toHospital ? 'To hospital' : 'To patient'}
        subtitle={job ? `${TRANSPORT_STATUS_LABEL[job.status as TransportStatus] ?? job.status}${['matched', 'en_route_to_patient'].includes(job.status) ? ` · ETA ${formatEta(job.eta_seconds)}` : ''}` : 'Loading…'}
        onBack={() => navigation.goBack()}
        right={<HeaderIconButton icon="locate-outline" label="Recenter map" onPress={() => setRecenter(n => n + 1)} />} />
      <LiveTrackMap data={data} recenterKey={recenter} style={{ flex: 1 }} />
      <View style={{ padding: 16, gap: 10, backgroundColor: t.cardBg, borderTopWidth: 1, borderTopColor: t.cardBorder }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 10, height: 10, borderRadius: 99, backgroundColor: patient?.live ? t.danger : t.textMuted }} />
          <Text style={{ flex: 1, fontSize: 14, color: t.textPrimary }} numberOfLines={2}>
            {toHospital ? (dest?.name ?? job?.destination_hospital_name ?? 'Receiving hospital')
              : patient?.live ? 'Patient is sharing live location' : 'Showing the booked pickup point'}
          </Text>
          {me && target && <Text style={{ fontSize: 16, fontWeight: '800', color: t.textPrimary }}>{fmtDist(metres(me, target))}</Text>}
        </View>
        {!!job?.symptom_description && <Text style={{ fontSize: 13, color: t.textSecondary }} numberOfLines={2}>{job.symptom_description}</Text>}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1.3 }}><PrimaryButton height={64} icon="navigate" label="Navigate" disabled={!target} onPress={navigate} /></View>
          <View style={{ flex: 1 }}>
            <PrimaryButton height={64} variant="ghost" icon="call-outline" label="Call" disabled={!job?.contact_phone}
              onPress={() => job?.contact_phone && Linking.openURL(`tel:${job.contact_phone}`).catch(() => {})} />
          </View>
          {!!job?.destination_hospital_id && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Message hospital"
              onPress={async () => {
                const r = await startConversation('hospital', job.destination_hospital_id!)
                if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
                else Alert.alert('Messages', r.error)
              }}
              style={{ width: 64, height: 64, borderRadius: 13, borderWidth: 1.5, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="chatbubble-ellipses-outline" size={22} color={t.accent} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </SafeAreaView>
  )
}

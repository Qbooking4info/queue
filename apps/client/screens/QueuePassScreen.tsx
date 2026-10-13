import { SafeAreaView } from 'react-native-safe-area-context'
import { useCallback, useEffect, useRef, useState } from 'react'
import { View, ScrollView, ActivityIndicator, Modal, TouchableOpacity } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import QRCode from 'react-native-qrcode-svg'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getAppointmentById } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { readCache, writeCache } from '@queue/shared/lib/cache'
import { StatusBadge } from '@queue/shared/components/ui/StatusBadge'
import { Header, Card, EmptyState, PrimaryButton } from '@queue/shared/components/ui/v3'
import { QueuePositionPicker } from '@queue/shared/components/QueuePositionPicker'
import { haptics } from '@queue/shared/lib/haptics'
import { showQueueNotification, clearQueueNotification } from '@queue/shared/lib/queueNotification'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'

const RAIL = ['Booked', 'Confirmed', 'Checked in', 'With doctor', 'Done'] as const

function railIndex(status: string) {
  switch (status) {
    case 'pending': return 0
    case 'confirmed': return 1
    case 'checked_in': return 2
    case 'in_progress': return 3
    case 'completed': return 4
    default: return 0
  }
}

interface Props { navigation: any; route: { params: { appointmentId: string } } }

export function QueuePassScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth() as any
  const id = route.params?.appointmentId
  const [appt, setAppt] = useState<AppointmentWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [showLate, setShowLate] = useState(false)
  const lastPos = useRef<number | null>(null)

  // Feel the queue move: a light tap when you move up, a stronger one when you're next.
  // Also keep the Android shade notification in step with the pass.
  useEffect(() => {
    if (!appt) return
    const pos = appt.queue_position
    const live = appt.status === 'checked_in'
    if (live && pos != null && lastPos.current != null && pos < lastPos.current) {
      if (pos === 1) haptics.success(); else haptics.tap()
    }
    lastPos.current = pos ?? null
    if (live && pos != null) {
      showQueueNotification(appt.id, pos === 1 ? 'You’re next' : `#${pos} in the queue`,
        appt.estimated_wait != null ? `About ${appt.estimated_wait} min · ${appt.doctor?.full_name ?? ''}` : (appt.doctor?.full_name ?? 'Queue Pass'))
    } else if (appt.status === 'in_progress') {
      showQueueNotification(appt.id, 'It’s your turn', 'Go to the consulting room')
    } else {
      clearQueueNotification()
    }
  }, [appt?.status, appt?.queue_position, appt?.estimated_wait])

  const load = useCallback(async () => {
    if (!id) return
    const a = await getAppointmentById(id).catch(() => null)
    if (a) { setAppt(a); setUpdatedAt(new Date()); writeCache(user?.id, 'pass:' + id, { a, at: Date.now() }) }
    setLoading(false)
  }, [id])

  // Realtime on this one row, with a 20 s poll as the fallback the handoff asks for
  // (Realtime drops silently on flaky mobile data; the poll keeps the pass honest).
  // The pass must open at the front desk even with no signal: cached copy first.
  useEffect(() => {
    readCache<{ a: AppointmentWithRelations; at: number }>(user?.id, 'pass:' + id).then(c => {
      if (c) { setAppt(p => p ?? c.a); setUpdatedAt(u => u ?? new Date(c.at)); setLoading(false) }
    })
  }, [id, user?.id])

  useEffect(() => {
    load()
    const ch = supabase.channel(`queue-pass-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `id=eq.${id}` }, () => load())
      .subscribe()
    const poll = setInterval(load, 20000)
    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [id, load])

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.accent} /></View>
  }
  if (!appt) {
    return (
      <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
        <Header title="Queue Pass" onBack={() => navigation.goBack()} />
        <EmptyState icon="ticket-outline" title="We couldn't find this visit" body="It may have been cancelled or moved." action="Back to appointments" onAction={() => navigation.goBack()} />
      </View>
    )
  }

  const step = railIndex(appt.status)
  const checkedIn = step >= 2
  const withDoctor = appt.status === 'in_progress'
  const patientId = (user?.patient_code as string | undefined) ?? '—'
  const label = withDoctor ? 'IT’S YOUR TURN' : checkedIn ? 'YOUR POSITION' : 'NOT CHECKED IN YET'
  const big = withDoctor ? 'Now' : checkedIn && appt.queue_position != null ? `#${appt.queue_position}` : '—'
  const sub = withDoctor ? 'Go to the consulting room'
    : checkedIn ? (appt.queue_position === 1 ? 'You’re next' : appt.estimated_wait != null ? `About ${appt.estimated_wait} min` : 'Waiting')
    : 'Your position shows after check-in'

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Queue Pass" subtitle={updatedAt ? `Works offline · updated ${updatedAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}` : undefined}
          onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
                <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 12 }}>
          <Card style={{ padding: 20, gap: 16, borderRadius: 18, shadowColor: '#0B1B1E', shadowOpacity: 0.12, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View>
                <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: t.textMuted }}>{label}</Text>
                <Text accessibilityLiveRegion="polite" style={{ fontSize: 64, fontWeight: '800', color: t.accent, letterSpacing: -2, lineHeight: 70 }}>{big}</Text>
                <Text style={{ fontSize: 14, color: t.textSecondary }}>{sub}</Text>
              </View>
              <StatusBadge type={appt.status} />
            </View>

            <View accessibilityLabel={`Progress: ${RAIL[step]}`} style={{ flexDirection: 'row', gap: 4 }}>
              {RAIL.map((r, i) => (
                <View key={r} style={{ flex: 1, gap: 6 }}>
                  <View style={{ height: 6, borderRadius: 99, backgroundColor: i < step ? t.accent : i === step ? '#14B8A6' : t.cardBorder }} />
                  <Text style={{ fontSize: 10, lineHeight: 12, color: i === step ? t.textPrimary : t.textMuted, fontWeight: i === step ? '800' : '400' }}>{r}</Text>
                </View>
              ))}
            </View>

            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingTop: 14, borderTopWidth: 1, borderTopColor: t.cardBorder, borderStyle: 'dashed' }}>
              <View accessible accessibilityLabel="Check-in QR code" style={{ padding: 6, backgroundColor: '#FFFFFF', borderRadius: 8 }}>
                <QRCode value={`queue:appt:${appt.id}:${patientId}`} size={96} color="#0B1B1E" backgroundColor="#FFFFFF" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 12, color: t.textMuted }}>Patient ID</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: 1, color: t.textPrimary }}>{patientId}</Text>
                <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 18 }}>Show this at the front desk to check in.</Text>
              </View>
            </View>
          </Card>

          <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{appt.doctor?.full_name ?? 'Doctor to be assigned'}</Text>
              <Text style={{ fontSize: 13, color: t.textMuted }}>
                {[appt.hospital?.name, appt.clinic?.name].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><PrimaryButton label="Show at front desk" icon="qr-code-outline" height={48} onPress={() => setShowQr(true)} /></View>
            {checkedIn && !withDoctor && (
              <View style={{ flex: 1 }}><PrimaryButton label="Running late?" variant="ghost" height={48} onPress={() => setShowLate(true)} /></View>
            )}
          </View>
          <Text style={{ fontSize: 12, color: t.textMuted, lineHeight: 18 }}>
            Emergencies are seen first, then by check-in time. We'll ring your phone when it's your turn.
          </Text>
        </View>
      </ScrollView>

      <Modal visible={showQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowQr(false)} accessibilityLabel="Close QR code"
          style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 }}>
          <Text style={{ fontSize: 15, color: '#4B5B5E' }}>Show this to the front desk</Text>
          <QRCode value={`queue:appt:${appt.id}:${patientId}`} size={260} color="#0B1B1E" backgroundColor="#FFFFFF" />
          <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, color: '#0B1B1E' }}>{patientId}</Text>
          <Text style={{ fontSize: 13, color: '#4B5B5E' }}>Tap anywhere to close</Text>
        </TouchableOpacity>
      </Modal>

      {showLate && (
        <QueuePositionPicker appointmentId={appt.id} onClose={() => setShowLate(false)}
          onMoved={() => { setShowLate(false); load() }} />
      )}
    </SafeAreaView>
  )
}
